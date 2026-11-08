const { spawn } = require("node:child_process");
const fs = require("node:fs");

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

function prepareCwd(cwd, requireCwd) {
  if (cwd == null || String(cwd).trim() === "") {
    return { cwd: undefined };
  }
  let listed;
  try {
    listed = fs.lstatSync(cwd);
  } catch {
    listed = null;
  }
  if (!listed) {
    if (requireCwd) {
      return { error: "工作目录不存在或不是普通目录" };
    }
    return { cwd: undefined };
  }
  if (listed.isSymbolicLink() || !listed.isDirectory()) {
    if (requireCwd) {
      return { error: "工作目录不存在或不是普通目录" };
    }
    if (listed.isSymbolicLink()) {
      return { cwd };
    }
    return { cwd: undefined };
  }
  return { cwd };
}

function killProcessGroup(child, signal) {
  if (!child || !child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
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
  onOutput,
  requireCwd = false,
} = {}) {
  let settled = false;
  let timedOut = false;
  let stdout = "";
  let stderr = "";
  let timer = null;
  let killTimer = null;
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
    if (killTimer) {
      clearTimeout(killTimer);
    }
    if (child) {
      child.unref();
    }
    finishers[0](result);
  }

  function armEscalation() {
    if (killTimer || settled || !child) {
      return;
    }
    killTimer = setTimeout(() => {
      if (settled || !child) {
        return;
      }
      killProcessGroup(child, "SIGKILL");
      if (child.stdout) {
        child.stdout.destroy();
      }
      if (child.stderr) {
        child.stderr.destroy();
      }
      child.unref();
      const timeoutNote = `进程超时（${timeout}ms）并已结束进程组`;
      finish({
        ok: false,
        code: null,
        signal: "SIGKILL",
        stdout,
        stderr: timedOut ? [stderr.trim(), timeoutNote].filter(Boolean).join("\n") : stderr,
        timedOut,
      });
    }, 1000);
  }

  function requestStop() {
    if (settled || !child) {
      return;
    }
    killProcessGroup(child, "SIGTERM");
    armEscalation();
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

  const prepared = prepareCwd(cwd, requireCwd);
  if (prepared.error) {
    finish({
      ok: false,
      code: null,
      signal: null,
      stdout: "",
      stderr: prepared.error,
      timedOut: false,
    });
    return {
      done,
      stop() {},
    };
  }

  child = spawn(command, args, {
    cwd: prepared.cwd,
    env: pickEnv(extraEnv),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    windowsHide: true,
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (onOutput) {
      onOutput({ stdout, stderr });
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (onOutput) {
      onOutput({ stdout, stderr });
    }
  });

  if (timeout > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      requestStop();
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
      requestStop();
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
