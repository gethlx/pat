const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { claim, complete, release } = require("./ledger");
const { startProcess } = require("./process");

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

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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
    (item) => item.name.trim() === name && item.command.trim(),
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

  function ensureTaskDir(base, taskId) {
    if (!TASK_ID.test(String(taskId || "")) || String(taskId).includes("..")) {
      throw new Error("任务编号不合法");
    }
    const root = locatePath(base);
    const dir = path.resolve(root, taskId);
    const relative = path.relative(root, dir);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("任务目录越界");
    }
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function applyCompleteResult(task, finished) {
    const payload = parseLedgerJson(finished.stdout);
    if (payload && (payload.status === "completed" || payload.status === "pending-sync")) {
      task.status = payload.status;
      task.pendingAction = payload.status === "pending-sync" ? "complete" : "";
      if (payload.status === "pending-sync" && payload.error) {
        task.stderr = [task.stderr, payload.error].filter(Boolean).join("\n");
      }
      const localArtifact = path.join(task.workDir, task.artifactName);
      if (fs.existsSync(localArtifact)) {
        task.artifactPath = localArtifact;
      }
      return true;
    }
    task.status = "review";
    task.pendingAction = "";
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
    const handle = startProcess({
      command: executor.command,
      args: [...executor.args, task.workDir],
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
    task.pendingAction = "";
    task.stopped = false;
    busy = true;
    notify();
    const result = await handle.done;
    if (runningHandle === handle) {
      runningHandle = null;
    }
    busy = false;
    task.stdout = result.stdout || "";
    task.stderr = result.stderr || "";
    if (task.stopped || !result.ok) {
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
    applyCompleteResult(task, finished);
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
      workDir = ensureTaskDir(config.workDir, payload.id);
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
      const released = await release(ledgerOptions(config), ["--id", task.id]);
      const payload = parseLedgerJson(released.stdout);
      if (payload && payload.status === "released") {
        task.status = "released";
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
      if (task.status !== "review") {
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
        applyCompleteResult(task, finished);
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
        if (task.pendingAction === "release") {
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
            task.workDir,
            "--artifact",
            task.artifactName,
          ]);
          applyCompleteResult(task, finished);
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
