const settingsView = document.getElementById("view-settings");
const workbenchView = document.getElementById("view-workbench");
const executorsRoot = document.getElementById("executors");
const backButton = document.getElementById("back-to-workbench");
const agentSelect = document.getElementById("agent-select");
const taskText = document.getElementById("task-text");
const artifactName = document.getElementById("artifact-name");
const dispatchButton = document.getElementById("dispatch-task");
const stopButton = document.getElementById("stop-task");
const confirmButton = document.getElementById("confirm-task");
const syncButton = document.getElementById("sync-task");
const releaseButton = document.getElementById("release-task");
const redispatchButton = document.getElementById("redispatch-task");
const openArtifactButton = document.getElementById("open-artifact");
const openWorkdirButton = document.getElementById("open-workdir");

const AGENT_PLACEHOLDER = "请选择 Agent";
const STATUS_LABELS = {
  running: "进行中",
  review: "待核对",
  released: "待领取",
  "pending-sync": "待同步",
  completed: "已完成",
};

function showView(view) {
  settingsView.hidden = view !== "settings";
  workbenchView.hidden = view !== "workbench";
}

function isReadyAgent(executor) {
  return Boolean(executor.name.trim() && executor.command.trim() && (!executor.mode || executor.mode === "push"));
}

function addExecutorRow(executor = {}) {
  const row = document.createElement("div");
  row.className = "executor";
  row.dataset.executor = "true";
  row.innerHTML = `
    <label>名称 <input data-field="name" /></label>
    <label>可执行文件路径 <input data-field="command" /></label>
    <label>参数 <input data-field="args" /></label>
    <label>超时 <input data-field="timeout" type="number" min="0" /></label>
    <label>mode <input data-field="mode" /></label>
    <label>invoke <input data-field="invoke" /></label>
  `;
  row.querySelector('[data-field="name"]').value = executor.name || "";
  row.querySelector('[data-field="command"]').value = executor.command || "";
  row.querySelector('[data-field="args"]').value = Array.isArray(executor.args)
    ? JSON.stringify(executor.args)
    : "";
  row.querySelector('[data-field="timeout"]').value =
    executor.timeout == null ? "" : String(executor.timeout);
  row.querySelector('[data-field="mode"]').value = executor.mode || "";
  row.querySelector('[data-field="invoke"]').value = executor.invoke || "";
  executorsRoot.appendChild(row);
}

function fillForm(config) {
  document.getElementById("ledgerPath").value = config.ledgerPath || "";
  document.getElementById("patLedgerPath").value = config.patLedgerPath || "";
  document.getElementById("workDir").value = config.workDir || "";
  document.getElementById("gitPath").value = config.gitPath || "";
  document.getElementById("gitUserName").value = config.gitUserName || "";
  document.getElementById("gitUserEmail").value = config.gitUserEmail || "";
  executorsRoot.replaceChildren();
  for (const executor of config.executors || []) {
    addExecutorRow(executor);
  }
}

function renderAgentRoster(config) {
  agentSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = AGENT_PLACEHOLDER;
  agentSelect.appendChild(placeholder);
  for (const executor of config.executors || []) {
    const name = executor.name.trim();
    if (!name) {
      continue;
    }
    const option = document.createElement("option");
    option.value = name;
    if (isReadyAgent(executor)) {
      option.textContent = name;
    } else {
      option.textContent = `${name}（待接入）`;
      option.disabled = true;
    }
    agentSelect.appendChild(option);
  }
  agentSelect.value = "";
}

function resetTaskForm() {
  agentSelect.value = "";
  taskText.value = "";
  artifactName.value = "";
}

function parseArgs(text) {
  if (!text) return [];
  if (!text.startsWith("[")) return text.split(/\s+/);
  const args = JSON.parse(text);
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new Error("执行参数必须是字符串数组。");
  }
  return args;
}

function readExecutors() {
  return Array.from(executorsRoot.querySelectorAll("[data-executor]")).map((row) => {
    const argsText = row.querySelector('[data-field="args"]').value.trim();
    const timeoutText = row.querySelector('[data-field="timeout"]').value.trim();
    return {
      name: row.querySelector('[data-field="name"]').value,
      command: row.querySelector('[data-field="command"]').value,
      args: parseArgs(argsText),
      timeout: timeoutText ? Number(timeoutText) : 0,
      mode: row.querySelector('[data-field="mode"]').value,
      invoke: row.querySelector('[data-field="invoke"]').value,
    };
  });
}

function readForm() {
  return {
    ledgerPath: document.getElementById("ledgerPath").value,
    patLedgerPath: document.getElementById("patLedgerPath").value,
    workDir: document.getElementById("workDir").value,
    gitPath: document.getElementById("gitPath").value,
    gitUserName: document.getElementById("gitUserName").value,
    gitUserEmail: document.getElementById("gitUserEmail").value,
    executors: readExecutors(),
  };
}

function applyState(state) {
  showView(state.view);
  fillForm(state.config);
  renderAgentRoster(state.config);
  renderTasks(state);
  backButton.hidden = !state.complete;
  document.getElementById("history-error").textContent = state.historyError || "";
}

function applyTasks(state) {
  renderTasks(state);
  if (state.error) {
    showEngineStatus({ ok: false, stderr: state.error });
  }
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "";
}

function renderTasks(state) {
  const current = state.currentTask;
  const detail = document.getElementById("current-task-detail");
  const emptyCurrent = document.getElementById("current-task-empty");
  const hasCurrent = Boolean(current);
  emptyCurrent.hidden = hasCurrent;
  detail.hidden = !hasCurrent;
  dispatchButton.disabled = Boolean(state.busy);
  document.getElementById("open-settings").disabled = Boolean(state.busy);
  document.getElementById("current-task-busy").hidden = !state.busy;
  document.getElementById("current-task-busy").textContent = current?.status === "running"
    ? "正在处理，结束后可继续派活。" : "正在确认账本，请稍候。";
  if (hasCurrent) {
    document.getElementById("current-task-id").textContent = current.id || "";
    const status = document.getElementById("current-task-status");
    status.textContent = statusLabel(current.status);
    status.dataset.state = current.status;
    document.getElementById("current-task-owner").textContent = current.owner || "未指定";
    document.getElementById("current-task-reason").textContent = current.reason || "";
    document.getElementById("current-task-goal").textContent = current.goal || "";
    document.getElementById("current-task-output").textContent = current.output || "";
    document.getElementById("artifact-path").textContent = current.artifactPath || "";
    document.getElementById("workdir-path").textContent = current.workDir || "";
    stopButton.hidden = current.status !== "running";
    confirmButton.hidden = current.status !== "review" || !current.workDir || Boolean(state.busy);
    syncButton.hidden = current.status !== "pending-sync";
    releaseButton.hidden = current.status !== "review";
    redispatchButton.hidden = current.status !== "released";
    openArtifactButton.hidden = !current.artifactPath;
    openWorkdirButton.hidden = !current.workDir;
  }
  const recent = state.recentTasks || [];
  const recentEmpty = document.getElementById("recent-tasks-empty");
  const list = document.getElementById("recent-task-list");
  recentEmpty.hidden = recent.length > 0;
  list.replaceChildren();
  for (const task of recent) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.taskId = task.id;
    const summary = document.createElement("strong");
    summary.textContent = task.goal || task.id;
    const caption = document.createElement("small");
    caption.textContent = [task.owner, statusLabel(task.status)].filter(Boolean).join(" · ");
    button.append(summary, caption);
    button.setAttribute("aria-pressed", String(task.id === state.selectedId));
    button.addEventListener("click", async () => {
      applyTasks(await window.pat.selectTask(task.id));
    });
    item.appendChild(button);
    list.appendChild(item);
  }
}

function showEngineStatus(result) {
  const text = result.ok
    ? (result.stdout || "ready").trim()
    : (result.stderr || result.error || "账本调用失败").trim();
  for (const el of document.querySelectorAll(".engine-status")) {
    el.hidden = false;
    el.textContent = text;
    el.dataset.ok = result.ok ? "true" : "false";
  }
}

async function probeReady() {
  showEngineStatus(await window.pat.probeReady());
}

async function refresh(state) {
  applyState(state);
  await probeReady();
}

async function boot() {
  await refresh(await window.pat.getState());
}

document.getElementById("add-executor").addEventListener("click", () => {
  addExecutorRow();
});

document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await refresh(await window.pat.saveConfig(readForm()));
  } catch (error) {
    showEngineStatus({ ok: false, error: error.message });
  }
});

document.getElementById("open-settings").addEventListener("click", async () => {
  applyState(await window.pat.showSettings());
});

backButton.addEventListener("click", async () => {
  await refresh(await window.pat.showWorkbench());
});

document.getElementById("new-task").addEventListener("click", async () => {
  resetTaskForm();
  applyTasks(await window.pat.newTask());
});

dispatchButton.addEventListener("click", async () => {
  const result = await window.pat.dispatch({
    owner: agentSelect.value,
    goal: taskText.value,
    artifactName: artifactName.value,
  });
  applyTasks(result);
  if (result.ok) {
    resetTaskForm();
  }
});

stopButton.addEventListener("click", async () => {
  applyTasks(await window.pat.stopTask());
});

confirmButton.addEventListener("click", async () => {
  applyTasks(await window.pat.confirmTask());
});

syncButton.addEventListener("click", async () => {
  applyTasks(await window.pat.continueSync());
});

releaseButton.addEventListener("click", async () => {
  applyTasks(await window.pat.releaseTask());
});

redispatchButton.addEventListener("click", async () => {
  applyTasks(await window.pat.redispatch());
});

for (const button of document.querySelectorAll("[data-directory]")) {
  button.addEventListener("click", async () => {
    const directory = await window.pat.chooseDirectory();
    if (directory) document.getElementById(button.dataset.directory).value = directory;
  });
}

for (const [button, kind] of [[openArtifactButton, "artifact"], [openWorkdirButton, "workdir"]]) {
  button.addEventListener("click", async () => {
    const error = await window.pat.openTarget(kind);
    if (error) showEngineStatus({ ok: false, error });
  });
}

window.pat.onState((state) => {
  applyTasks(state);
});

boot();
