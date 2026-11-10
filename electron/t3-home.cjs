// Where T3 Code keeps its state: T3CODE_HOME, or ~/.t3. Read when called, so a test or a caller
// that sets T3CODE_HOME first is respected.
const os = require("node:os");
const path = require("node:path");

const t3Home = () => process.env.T3CODE_HOME || path.join(os.homedir(), ".t3");

module.exports = { t3Home };
