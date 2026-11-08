const settingsView = document.getElementById("view-settings");
const workbenchView = document.getElementById("view-workbench");
const executorsRoot = document.getElementById("executors");
const backButton = document.getElementById("back-to-workbench");
const agentSelect = document.getElementById("agent-select");
const taskText = document.getElementById("task-text");
const artifactName = document.getElementById("artifact-name");

const AGENT_PLACEHOLDER = "请选择 Agent";

function showView(view) {
  settingsView.hidden = view !== "settings";
  workbenchView.hidden = view !== "workbench";
}

function isReadyAgent(executor) {
  return Boolean(executor.name.trim() && executor.command.trim());
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
    ? executor.args.join(" ")
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

function readExecutors() {
  return Array.from(executorsRoot.querySelectorAll("[data-executor]")).map((row) => {
    const argsText = row.querySelector('[data-field="args"]').value.trim();
    const timeoutText = row.querySelector('[data-field="timeout"]').value.trim();
    return {
      name: row.querySelector('[data-field="name"]').value,
      command: row.querySelector('[data-field="command"]').value,
      args: argsText ? argsText.split(/\s+/) : [],
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
  backButton.hidden = !state.complete;
}

async function boot() {
  applyState(await window.pat.getState());
}

document.getElementById("add-executor").addEventListener("click", () => {
  addExecutorRow();
});

document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  applyState(await window.pat.saveConfig(readForm()));
});

document.getElementById("open-settings").addEventListener("click", async () => {
  applyState(await window.pat.showSettings());
});

backButton.addEventListener("click", async () => {
  applyState(await window.pat.showWorkbench());
});

document.getElementById("new-task").addEventListener("click", () => {
  resetTaskForm();
});

boot();
