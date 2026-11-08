const { runProcess } = require("./process");

function missingPathResult(message) {
  return {
    ok: false,
    code: null,
    signal: null,
    stdout: "",
    stderr: message,
    timedOut: false,
  };
}

function runLedger({
  patLedgerPath,
  ledgerPath,
  args = ["ready"],
  cwd,
  timeout = 30_000,
  gitPath,
} = {}) {
  if (!patLedgerPath || !String(patLedgerPath).trim()) {
    return Promise.resolve(
      missingPathResult(
        "未配置 pat-ledger 路径，不会创建或使用默认账本路径。",
      ),
    );
  }
  if (!ledgerPath || !String(ledgerPath).trim()) {
    return Promise.resolve(
      missingPathResult(
        "必须通过 --ledger 传入账本 checkout 路径，不会创建或使用默认路径。",
      ),
    );
  }
  const argv = ["--ledger", ledgerPath];
  if (gitPath && String(gitPath).trim()) {
    argv.push("--git", String(gitPath));
  }
  argv.push(...args);
  return runProcess({
    command: patLedgerPath,
    args: argv,
    cwd,
    timeout,
  });
}

function ready(options) {
  return runLedger({ ...options, args: ["ready"] });
}

function history(options) {
  return runLedger({ ...options, args: ["history"] });
}

function claim(options, extraArgs = []) {
  return runLedger({ ...options, args: ["claim", ...extraArgs] });
}

function complete(options, extraArgs = []) {
  return runLedger({ ...options, args: ["complete", ...extraArgs] });
}

function release(options, extraArgs = []) {
  return runLedger({ ...options, args: ["release", ...extraArgs] });
}

module.exports = {
  runLedger,
  ready,
  history,
  claim,
  complete,
  release,
};
