const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Keep the previous complete document visible until its replacement is durable.
// Serialize writes so an older, slower save cannot overwrite a newer one.
function createJsonStore(file, { fallback, array = false, io = fs.promises } = {}) {
  let tail = Promise.resolve(), pending = 0, lastFailure = null;
  const valid = text => {
    if (typeof text !== 'string') throw new Error('Invalid saved office data.');
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value) !== array) throw new Error('Invalid saved office data.');
    return text;
  };
  return {
    load() {
      try { return valid(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
    },
    save(text) {
      try { valid(text); } catch (error) { return Promise.reject(error); }
      pending++;
      const operation = tail.then(async () => {
        const temp = `${file}.${randomUUID()}.tmp`;
        let handle;
        try {
          await io.mkdir(path.dirname(file), { recursive: true });
          handle = await io.open(temp, 'wx');
          await handle.writeFile(text, 'utf8');
          await handle.sync();
          await handle.close(); handle = null;
          await io.rename(temp, file);
          lastFailure = null;
        } catch (error) {
          lastFailure = error;
          throw error;
        } finally {
          if (handle) await handle.close().catch(() => {});
          await io.unlink(temp).catch(() => {});
        }
      });
      tail = operation.catch(() => {}).finally(() => { pending--; });
      return operation;
    },
    async flush({ requireSaved = false } = {}) {
      while (pending) await tail;
      if (requireSaved && lastFailure) throw lastFailure;
    },
    get pending() { return pending > 0; },
  };
}

module.exports = { createJsonStore };
