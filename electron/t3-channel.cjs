// Which T3 Code build the user runs, stable or Nightly, read from T3's own files so the robots'
// T3 Code windows match the real app. T3 records the last started desktop version in its home.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function t3Channel(home = process.env.T3CODE_HOME || path.join(os.homedir(), ".t3")) {
  try {
    const version = fs.readFileSync(path.join(home, "userdata", "desktop-last-started-version"), "utf8");
    if (version.trim()) return /nightly/i.test(version) ? "nightly" : "stable";
  } catch {}
  return /nightly/i.test(path.basename(home)) ? "nightly" : "stable";
}

module.exports = { t3Channel };
