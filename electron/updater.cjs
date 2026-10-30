// One-click updates for a git checkout: fetch, fast-forward, reinstall, rebuild, relaunch.
const { execFile } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT, shell: process.platform === "win32", windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || stdout || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

async function check() {
  try {
    await run("git", ["fetch", "--quiet"]);
    const upstream = await run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).catch(() => null);
    if (!upstream) return { available: false, reason: "no-remote" };
    const behind = Number(await run("git", ["rev-list", "--count", "HEAD..@{u}"]));
    const log = behind ? await run("git", ["log", "--format=%s", "-n", "5", "HEAD..@{u}"]) : "";
    return { available: behind > 0, behind, changes: log ? log.split("\n") : [] };
  } catch (err) {
    return { available: false, reason: String(err.message || err) };
  }
}

async function apply(onStep) {
  onStep("Downloading the update");
  await run("git", ["pull", "--ff-only"]);
  onStep("Installing packages");
  await run("npm", ["install", "--no-audit", "--no-fund"]);
  onStep("Building");
  await run("npm", ["run", "build"]);
  onStep("Restarting");
}

module.exports = { check, apply };
