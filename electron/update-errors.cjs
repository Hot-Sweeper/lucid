// Keep compiler/process output available for diagnosis without turning it into
// the update button's tooltip or an enormous menu item.
function updateFailure(error, installed) {
  const describe = value => [String(value?.message || value), ...(Array.isArray(value?.errors) ? value.errors.map(describe) : [])].join('\n');
  const details = describe(error);
  let kind = 'failed', message = 'The update could not finish. Retry the update.';
  if (error?.cleanupUnconfirmed) {
    kind = 'cleanup-pending';
    message = 'An update process could not be confirmed stopped. Restart the computer before retrying the update.';
  } else if (/error TS\d+:|runtime syntax check failed|Typecheck failed/i.test(details)) {
    kind = 'not-ready';
    message = 'The new changes are not ready yet. They need a code fix before they can be installed.';
  } else if (/inputs changed|source.*changed|changed.*source|Files changed while preparing|do not match the validated/i.test(details)) {
    kind = 'source-changed';
    message = 'The code changed while the update was being prepared. Retry after editing has finished.';
  } else if (/Another Lucid update/i.test(details)) {
    kind = 'busy'; message = 'An update is already running. Wait for it to finish.';
  } else if (/ENOSPC|not enough space|disk.*full/i.test(details)) {
    message = 'There is not enough free disk space to prepare the update. Free some space, then retry.';
  } else if (/EPERM|EACCES|EBUSY|access.*denied|file.*in use/i.test(details)) {
    message = 'A file needed by the update is locked or cannot be accessed. Close other build processes, then retry.';
  } else if (/timed? out|ETIMEDOUT/i.test(details)) {
    message = 'Preparing the update took too long. Retry when the computer and connection are available.';
  }
  return { ok: false, kind, error: message + (installed ? ' Your installed version is still available.' : ''), details };
}
module.exports = { updateFailure };
