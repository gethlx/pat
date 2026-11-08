const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ATTEMPT_DIR = /^attempt-[A-Za-z0-9]{6}$/;
const ARTIFACT_NAME = /^[^/\\\u0000-\u001f]+$/;

function validArtifactName(name) {
  return ARTIFACT_NAME.test(name) && !name.startsWith(".");
}

function taskRoot(base, id) {
  if (!TASK_ID.test(id) || id.includes("..")) {
    throw new Error("任务编号不合法");
  }
  return path.join(fs.realpathSync(base), id);
}

function ordinaryDir(dir) {
  try {
    return fs.lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function createAttempt(base, task) {
  const root = taskRoot(base, task.id);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (!ordinaryDir(root)) {
    throw new Error("任务工作目录不是普通目录");
  }
  const workDir = fs.mkdtempSync(path.join(root, "attempt-"));
  const details = {
    attempt: path.basename(workDir),
    sourceRef: task.sourceRef,
    artifactName: task.artifactName,
  };
  const pointer = path.join(workDir, ".pat-attempt.json");
  fs.writeFileSync(pointer, JSON.stringify(details), { flag: "wx", mode: 0o600 });
  fs.renameSync(pointer, path.join(root, ".pat-attempt.json"));
  return workDir;
}

function restoreAttempt(base, task) {
  try {
    const root = taskRoot(base, task.id);
    if (!ordinaryDir(root)) return {};
    const pointer = path.join(root, ".pat-attempt.json");
    if (!fs.existsSync(pointer)) {
      return { workDir: root, artifactName: "result.md" };
    }
    if (!fs.lstatSync(pointer).isFile()) return {};
    const saved = JSON.parse(fs.readFileSync(pointer, "utf8"));
    if (saved.sourceRef !== task.source_ref || !ATTEMPT_DIR.test(saved.attempt)
      || !validArtifactName(saved.artifactName)) {
      return {};
    }
    const workDir = path.join(root, saved.attempt);
    return ordinaryDir(workDir) ? { workDir, artifactName: saved.artifactName } : {};
  } catch {
    return {};
  }
}

function verifiedArtifact(ledgerPath, taskId, reference) {
  if (!reference || typeof reference.path !== "string") return "";
  const name = path.basename(reference.path);
  if (!validArtifactName(name) || reference.path !== `artifacts/${taskId}/${name}`) return "";
  try {
    const root = fs.realpathSync(ledgerPath);
    const file = path.join(root, reference.path);
    if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) return "";
    const digest = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    return digest === reference.sha256 ? file : "";
  } catch {
    return "";
  }
}

module.exports = { createAttempt, restoreAttempt, validArtifactName, verifiedArtifact };
