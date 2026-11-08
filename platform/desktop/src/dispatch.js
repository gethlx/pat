const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { claim, complete, history, release } = require("./ledger");
const { startProcess } = require("./process");
const { isLaunchableExecutor } = require("./config");
const { createAttempt, restoreAttempt, validArtifactName, verifiedArtifact } = require("./task-files");

function parseLedgerJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\n/).filter(Boolean);
    try {
      return JSON.parse(lines[lines.length - 1]);
    } catch {
      return null;
    }
  }
}

function ledgerOptions(config) {
  return {
    patLedgerPath: config.patLedgerPath,
    ledgerPath: config.ledgerPath,
    cwd: config.workDir,
    gitPath: config.gitPath,
  };
}

function locatePath(target) {
  const resolved = path.resolve(String(target));
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function pathsConflict(ledgerPath, workDir) {
  if (!ledgerPath || !String(ledgerPath).trim() || !workDir || !String(workDir).trim()) {
    return false;
  }
  const ledger = locatePath(ledgerPath);
  const work = locatePath(workDir);
  return isInside(ledger, work) || isInside(work, ledger);
}

function findExecutor(config, name) {
  return (config.executors || []).find(
    (item) => item.name.trim() === name && isLaunchableExecutor(item),
  );
}

function timeoutMs(executor) {
  const raw = Number(executor.timeout) || 0;
  if (raw <= 0) {
    return 60_000;
  }
  return raw < 1000 ? raw * 1000 : raw;
}

function combinedOutput(task) {
  return [task.stdout, task.stderr].filter(Boolean).join("\n");
}

function publicTask(task) {
  if (!task) {
    return null;
  }
  return {
    id: task.id,
    sourceRef: task.sourceRef,
    goal: task.goal,
    owner: task.owner,
    artifactName: task.artifactName,
    workDir: task.workDir,
    status: task.status,
    reason: task.reason,
    stdout: task.stdout,
    stderr: task.stderr,
    output: combinedOutput(task),
    artifactPath: task.artifactPath,
  };
}

function createSession() {
  const tasks = [];
  let selectedId = null;
  let busy = false;
  let runningHandle = null;
  let draftSourceRef = null;

  function nextDraftSourceRef() {
    if (!draftSourceRef) {
      draftSourceRef = `desktop:${randomUUID()}`;
    }
    return draftSourceRef;
  }

  function current() {
    return tasks.find((item) => item.id === selectedId) || null;
  }

  function snapshot() {
    return {
      busy,
      selectedId,
      currentTask: publicTask(current()),
      recentTasks: tasks.map(publicTask),
    };
  }

  function fail(message) {
    return { ...snapshot(), ok: false, error: message };
  }

  async function restore(config) {
    const result = await history(ledgerOptions(config));
    const payload = parseLedgerJson(result.stdout);
    if (!result.ok || !Array.isArray(payload?.tasks)) {
      return result.stderr || result.error || "无法读取账本历史";
    }
    tasks.splice(0, tasks.length, ...payload.tasks.map((row) => {
      const task = {
        id: row.id,
        sourceRef: row.source_ref,
        goal: row.goal,
        owner: row.owner,
        artifactName: "result.md",
        ...restoreAttempt(config.workDir, row),
      };
      if (row.pending) {
        task.status = "pending-sync";
        task.pendingAction = { done: "complete", inbox: "release", claimed: "claim" }[row.bucket];
        task.reason = "这笔账本变更尚未确认，继续同步不会重新执行。";
      } else if (row.bucket === "done") {
        task.status = "completed";
        task.reference = row.artifacts?.[0];
        task.artifactPath = verifiedArtifact(config.ledgerPath, task.id, task.reference);
        if (!task.artifactPath) task.reason = "账本产物在本机缺失或校验不符。";
      } else if (row.bucket === "inbox") {
        task.status = "released";
      } else {
        task.status = "review";
        task.reason = Date.parse(row.deadline) < Date.now()
          ? "任务已逾期。请核对原执行与现有产物。"
          : "上次领取尚无完成记录。请核对原执行是否已停止。";
      }
      if (task.workDir) {
        try {
          const logs = JSON.parse(fs.readFileSync(path.join(task.workDir, ".pat-output.json"), "utf8"));
          task.stdout = logs.stdout;
          task.stderr = logs.stderr;
        } catch {
          // The process may have stopped before its final log was saved.
        }
      }
      return task;
    }));
    selectedId = (tasks.find((task) => ["review", "pending-sync"].includes(task.status)) || tasks[0])?.id ?? null;
    return "";
  }

  function applyCompleteResult(config, task, finished) {
    const payload = parseLedgerJson(finished.stdout);
    if (payload && (payload.status === "completed" || payload.status === "pending-sync")) {
      task.status = payload.status;
      task.pendingAction = payload.status === "pending-sync" ? "complete" : "";
      if (payload.status === "pending-sync" && payload.error) {
        task.stderr = [task.stderr, payload.error].filter(Boolean).join("\n");
      }
      task.reference = payload.artifacts?.[0];
      task.artifactPath = payload.status === "completed"
        ? verifiedArtifact(config.ledgerPath, task.id, task.reference)
        : "";
      task.reason = payload.status === "pending-sync"
        ? "产物已记录，等待账本远端确认。"
        : task.artifactPath ? "" : "账本产物在本机缺失或校验不符。";
      return true;
    }
    task.status = "review";
    task.pendingAction = "";
    task.reason = "记账未完成，请查看执行详情。";
    task.stderr = [task.stderr, finished.stderr, payload && payload.error]
      .filter(Boolean)
      .join("\n");
    return false;
  }

  async function startExecutor(config, task, notify) {
    const executor = findExecutor(config, task.owner);
    if (!executor) {
      task.status = "review";
      task.stderr = "找不到已接通的 Agent";
      busy = false;
      runningHandle = null;
      notify();
      return;
    }
    const prompt = `请按以下任务在当前工作目录中写入 ${JSON.stringify(task.artifactName)}，作为可核对的文本结果。

${task.goal}`;
    const values = new Map([
      ["{prompt}", prompt],
      ["{workdir}", task.workDir],
      ["{artifact}", task.artifactName],
    ]);
    const args = executor.args.map((arg) => values.get(arg) ?? arg);
    if (!executor.args.some((arg) => values.has(arg))) {
      args.push(task.workDir);
    }
    fs.writeFileSync(path.join(task.workDir, ".pat-request.txt"), prompt, { flag: "wx", mode: 0o600 });
    const handle = startProcess({
      command: executor.command,
      args,
      cwd: task.workDir,
      requireCwd: true,
      timeout: timeoutMs(executor),
      onOutput({ stdout, stderr }) {
        task.stdout = stdout;
        task.stderr = stderr;
        notify();
      },
    });
    runningHandle = handle;
    task.status = "running";
    task.reason = "";
    task.pendingAction = "";
    task.stopped = false;
    busy = true;
    notify();
    const result = await handle.done;
    if (runningHandle === handle) {
      runningHandle = null;
    }
    task.stdout = result.stdout || "";
    task.stderr = result.stderr || "";
    try {
      fs.writeFileSync(path.join(task.workDir, ".pat-output.json"), JSON.stringify({
        code: result.code, signal: result.signal, stdout: task.stdout, stderr: task.stderr,
      }), { flag: "wx", mode: 0o600 });
    } catch {
      // Keep the in-memory log even when the working directory cannot be written.
    }
    if (task.stopped || !result.ok) {
      busy = false;
      task.reason = task.stopped
        ? "执行已停止，现场文件已保留。"
        : result.timedOut ? "执行超时，请检查现场文件。"
          : `执行未成功${result.code == null ? "" : `（退出码 ${result.code}）`}。`;
      task.status = "review";
      notify();
      return;
    }
    const finished = await complete(ledgerOptions(config), [
      "--id",
      task.id,
      "--workdir",
      task.workDir,
      "--artifact",
      task.artifactName,
    ]);
    applyCompleteResult(config, task, finished);
    busy = false;
    notify();
  }

  async function claimTask(config, { sourceRef, goal, owner, artifactName }, notify) {
    const claimed = await claim(ledgerOptions(config), [
      "--source-ref",
      sourceRef,
      "--goal",
      goal,
      "--owner",
      owner,
    ]);
    const payload = parseLedgerJson(claimed.stdout);
    if (!payload || payload.status !== "claimed") {
      busy = false;
      if (payload && payload.status === "duplicate") {
        const existing = tasks.find((item) => item.id === payload.id);
        if (existing) {
          selectedId = existing.id;
        }
        return { ok: false, error: "这条任务已经存在" };
      }
      const reason =
        (payload && payload.status === "review" && "同键内容冲突，请核对") ||
        claimed.stderr ||
        claimed.error ||
        "领取失败";
      return { ok: false, error: reason.trim() };
    }
    let task = tasks.find((item) => item.id === payload.id);
    if (!task) {
      task = { id: payload.id };
      tasks.unshift(task);
    }
    let workDir;
    try {
      workDir = createAttempt(config.workDir, { id: payload.id, sourceRef, artifactName });
    } catch (err) {
      task.sourceRef = sourceRef;
      task.goal = goal;
      task.owner = owner;
      task.artifactName = artifactName;
      task.status = "review";
      task.pendingAction = "";
      task.stderr = String(err && err.message ? err.message : err);
      selectedId = task.id;
      busy = false;
      return { ok: false, error: task.stderr, claimed: true };
    }
    task.id = payload.id;
    task.sourceRef = sourceRef;
    task.goal = goal;
    task.owner = owner;
    task.artifactName = artifactName;
    task.workDir = workDir;
    task.artifactPath = "";
    task.stdout = "";
    task.stderr = "";
    selectedId = task.id;
    startExecutor(config, task, notify).catch((err) => {
      task.status = "review";
      task.stderr = String(err && err.message ? err.message : err);
      busy = false;
      runningHandle = null;
      notify();
    });
    return { ok: true };
  }

  return {
    snapshot,
    restore,
    openTarget(config, kind) {
      const task = current();
      if (!task) return "";
      if (kind === "artifact") {
        return task.status === "completed"
          ? verifiedArtifact(config.ledgerPath, task.id, task.reference)
          : "";
      }
      const workDir = task.workDir;
      if (!workDir) return "";
      try {
        const root = fs.realpathSync(config.workDir);
        return isInside(root, workDir) && fs.realpathSync(workDir) === workDir
          && fs.lstatSync(workDir).isDirectory() ? workDir : "";
      } catch {
        return "";
      }
    },
    select(id) {
      if (busy) {
        return { ...snapshot(), ok: true };
      }
      if (tasks.some((item) => item.id === id)) {
        selectedId = id;
      }
      return { ...snapshot(), ok: true };
    },
    newTask() {
      draftSourceRef = null;
      if (!busy) {
        selectedId = null;
      }
      return { ...snapshot(), ok: true };
    },
    async dispatch(config, payload = {}, notify = () => {}) {
      if (busy) {
        return fail("已有进行中的任务");
      }
      const owner = String(payload.owner || "").trim();
      const goal = String(payload.goal || "").trim();
      const artifactName = String(payload.artifactName || "").trim() || "result.md";
      if (!owner) {
        return fail("请选择 Agent");
      }
      if (!goal) {
        return fail("请填写任务");
      }
      if (!validArtifactName(artifactName)) {
        return fail("请输入普通文件名，例如 result.md");
      }
      if (!findExecutor(config, owner)) {
        return fail("请选择已接通的 Agent");
      }
      if (!config.workDir || !String(config.workDir).trim()) {
        return fail("未配置工作目录");
      }
      if (pathsConflict(config.ledgerPath, config.workDir)) {
        return fail("工作目录必须与账本分开");
      }
      busy = true;
      const started = await claimTask(
        config,
        {
          sourceRef: nextDraftSourceRef(),
          goal,
          owner,
          artifactName,
        },
        notify,
      );
      if (!started.ok) {
        if (started.claimed) {
          draftSourceRef = null;
        }
        return { ...snapshot(), ok: false, error: started.error };
      }
      draftSourceRef = null;
      return { ...snapshot(), ok: true };
    },
    async stop() {
      const task = current();
      if (!task || !busy || !runningHandle) {
        return { ...snapshot(), ok: false, error: "没有进行中的任务" };
      }
      task.stopped = true;
      runningHandle.stop();
      return { ...snapshot(), ok: true };
    },
    async release(config) {
      const task = current();
      if (!task) {
        return fail("没有选中的任务");
      }
      if (busy) {
        return fail("进行中的任务请先停止");
      }
      if (task.status !== "review" && task.status !== "running") {
        return fail("只有领取中的任务可以放回待领取");
      }
      busy = true;
      let released;
      try {
        released = await release(ledgerOptions(config), ["--id", task.id]);
      } finally {
        busy = false;
      }
      const payload = parseLedgerJson(released.stdout);
      if (payload && payload.status === "released") {
        task.status = "released";
        task.reason = "";
        task.pendingAction = "";
        task.sourceRef = payload.source_ref || task.sourceRef;
        return { ...snapshot(), ok: true };
      }
      if (payload && payload.status === "pending-sync") {
        task.status = "pending-sync";
        task.pendingAction = "release";
        if (payload.error) {
          task.stderr = [task.stderr, payload.error].filter(Boolean).join("\n");
        }
        return { ...snapshot(), ok: false, error: payload.error || "待同步" };
      }
      return fail((released.stderr || released.error || "释放失败").trim());
    },
    async confirm(config) {
      const task = current();
      if (!task) {
        return fail("没有选中的任务");
      }
      if (busy) {
        return fail("已有进行中的任务");
      }
      if (task.status !== "review" || !task.workDir) {
        return fail("只有待核对的任务可以确认完成");
      }
      busy = true;
      let response;
      try {
        const finished = await complete(ledgerOptions(config), [
          "--id",
          task.id,
          "--workdir",
          task.workDir,
          "--artifact",
          task.artifactName,
        ]);
        applyCompleteResult(config, task, finished);
        response = {
          ok: task.status === "completed",
          error: task.status === "completed" ? undefined : task.stderr || "记账未完成",
        };
      } catch (err) {
        task.status = "review";
        response = { ok: false, error: String(err && err.message ? err.message : err) };
      } finally {
        busy = false;
      }
      return { ...snapshot(), ...response };
    },
    async continueSync(config) {
      const task = current();
      if (!task || task.status !== "pending-sync") {
        return fail("没有待同步的任务");
      }
      if (busy) {
        return fail("已有进行中的任务");
      }
      busy = true;
      let response;
      try {
        if (task.pendingAction === "claim") {
          const finished = await claim(ledgerOptions(config), [
            "--source-ref", task.sourceRef, "--goal", task.goal, "--owner", task.owner,
          ]);
          const payload = parseLedgerJson(finished.stdout);
          if (["claimed", "duplicate"].includes(payload?.status) && payload.bucket === "claimed") {
            task.status = "review";
            task.pendingAction = "";
            task.reason = "领取已同步。请核对原执行，再决定是否放回待领取。";
            response = { ok: true };
          } else {
            response = { ok: false, error: finished.stderr || "领取仍待核对" };
          }
        } else if (task.pendingAction === "release") {
          const finished = await release(ledgerOptions(config), ["--id", task.id]);
          const payload = parseLedgerJson(finished.stdout);
          if (payload && payload.status === "released") {
            task.status = "released";
            task.pendingAction = "";
            task.sourceRef = payload.source_ref || task.sourceRef;
            response = { ok: true };
          } else if (payload && payload.status === "pending-sync") {
            task.status = "pending-sync";
            task.pendingAction = "release";
            if (payload.error) {
              task.stderr = [task.stderr, payload.error].filter(Boolean).join("\n");
            }
            response = { ok: false, error: payload.error || "待同步" };
          } else {
            response = {
              ok: false,
              error: (finished.stderr || finished.error || "释放失败").trim(),
            };
          }
        } else {
          const finished = await complete(ledgerOptions(config), [
            "--id",
            task.id,
            "--workdir",
            task.workDir || config.workDir,
            "--artifact",
            task.artifactName,
          ]);
          applyCompleteResult(config, task, finished);
          response = {
            ok: task.status === "completed",
            error: task.status === "completed" ? undefined : task.stderr || "待同步",
          };
        }
      } catch (err) {
        response = { ok: false, error: String(err && err.message ? err.message : err) };
      } finally {
        busy = false;
      }
      return { ...snapshot(), ...response };
    },
    shutdown() {
      if (runningHandle) {
        const task = current();
        if (task) {
          task.stopped = true;
        }
        runningHandle.stop();
        runningHandle = null;
        busy = false;
      }
    },
    async redispatch(config, notify = () => {}) {
      const task = current();
      if (!task) {
        return fail("没有选中的任务");
      }
      if (busy) {
        return fail("已有进行中的任务");
      }
      if (task.status !== "released") {
        return fail("只有放回待领取的原任务可以重派");
      }
      busy = true;
      const started = await claimTask(
        config,
        {
          sourceRef: task.sourceRef,
          goal: task.goal,
          owner: task.owner,
          artifactName: task.artifactName || "result.md",
        },
        notify,
      );
      if (!started.ok) {
        return { ...snapshot(), ok: false, error: started.error };
      }
      return { ...snapshot(), ok: true };
    },
  };
}

module.exports = {
  createSession,
  parseLedgerJson,
};
