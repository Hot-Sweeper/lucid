const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const marker = root => path.join(root, '.lucid-update-recovery.json');
function recoveryError() {
  return Object.assign(Error('An earlier update process could not be confirmed stopped. Restart the computer before retrying the update.'), {code:'UPDATE_RECOVERY_REQUIRED',cleanupUnconfirmed:true});
}
function assertRecovery(root, uptime = os.uptime()) {
  let state;
  try { state = JSON.parse(fs.readFileSync(marker(root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw recoveryError(); }
  // A substantially lower monotonic OS uptime positively establishes a reboot.
  // Wall-clock changes, a dead app PID, or simply waiting are not evidence
  // that an unconfirmed npm process and its children have stopped.
  if (Number.isFinite(state.uptime) && state.uptime > 0 && uptime + 60 < state.uptime) {
    try { fs.unlinkSync(marker(root)); return; } catch {}
  }
  throw recoveryError();
}
function retainRecovery(root, error, uptime = os.uptime()) {
  const state = {version:1,pid:process.pid,commandPid:Number.isInteger(error.commandPid)?error.commandPid:null,uptime};
  try { fs.writeFileSync(marker(root), JSON.stringify(state), {flag:'wx'}); }
  catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
}
module.exports = { assertRecovery, retainRecovery, recoveryError };
