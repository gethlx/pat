const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");

const ALLOWED_ENV_KEYS = [
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TZ",
  "TMPDIR",
  "TMP",
  "TEMP",
  "PATH",
];

function pickEnv(extra = {}) {
  const env = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] != null) {
      env[key] = process.env[key];
    }
    if (extra[key] != null) {
      env[key] = String(extra[key]);
    }
  }
  return env;
}

function resolveCwd(cwd) {
  if (cwd && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
    return cwd;
  }
  return os.tmpdir();
}

function killProcessGroup(child) {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // already exited
    }
  }
}

function startProcess({
  command,
  args = [],
  cwd,
  timeout = 30_000,
  env: extraEnv,
} = {}) {
  let settled = false;
  let timedOut = false;
  let stdout = "";
  let stderr = "";
  let timer = null;
  let child = null;

  const finishers = [];
  const done = new Promise((resolve) => {
    finishers.push(resolve);
  });

  function finish(result) {
    if (settled) {
      return;
    }
    settled = true;
    if (timer) {
      clearTimeout(timer);
    }
    finishers[0](result);
  }

  if (!command || !String(command).trim()) {
    finish({
      ok: false,
      code: null,
      signal: null,
      stdout: "",
      stderr: "未配置可执行文件路径",
      timedOut: false,
    });
    return {
      done,
      stop() {},
    };
  }

  child = spawn(command, args, {
    cwd: resolveCwd(cwd),
    env: pickEnv(extraEnv),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    windowsHide: true,
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  if (timeout > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child);
    }, timeout);
  }

  child.on("error", (err) => {
    finish({
      ok: false,
      code: null,
      signal: null,
      stdout,
      stderr: stderr || err.message,
      timedOut: false,
      error: err.message,
    });
  });

  child.on("close", (code, signal) => {
    const timeoutNote = `进程超时（${timeout}ms）并已结束进程组`;
    finish({
      ok: code === 0 && !timedOut,
      code,
      signal,
      stdout,
      stderr: timedOut ? [stderr.trim(), timeoutNote].filter(Boolean).join("\n") : stderr,
      timedOut,
    });
  });

  return {
    done,
    stop() {
      killProcessGroup(child);
    },
  };
}

function runProcess(options) {
  return startProcess(options).done;
}

module.exports = {
  ALLOWED_ENV_KEYS,
  pickEnv,
  startProcess,
  runProcess,
};
