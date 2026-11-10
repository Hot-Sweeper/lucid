// Long jobs a thread leaves behind after its turn ends, such as a render running as a systemd user
// service. T3 only knows the turn finished; the job's real state comes from systemd and is matched
// to the thread by the service's working directory being inside the thread's own folder.
const { execFile } = require('node:child_process');

// Always the user's own systemd session, even when Lucid was started inside another session
// (a sandbox or test desktop can point these at a private bus).
const userBus = () => {
  const dir = typeof process.getuid === 'function' ? `/run/user/${process.getuid()}` : process.env.XDG_RUNTIME_DIR;
  return dir ? { XDG_RUNTIME_DIR: dir, DBUS_SESSION_BUS_ADDRESS: `unix:path=${dir}/bus` } : {};
};
const exec = (cmd, args, timeout = 4000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, ...userBus(), SYSTEMD_COLORS: '0', LC_ALL: 'C' } },
    (error, stdout) => resolve(error ? null : String(stdout)));
});

const RESULT_TEXT = {
  'oom-kill': 'killed because the computer ran out of memory',
  'exit-code': 'exited with an error',
  signal: 'was killed',
  'core-dump': 'crashed',
  timeout: 'timed out',
  watchdog: 'stopped responding',
  'start-limit-hit': 'failed to start repeatedly',
  resources: 'could not get the resources it needed',
};

/** Parse `systemctl show` output for several units: blocks of key=value separated by blank lines. */
function parseShow(text) {
  return text.split(/\n\s*\n/).map((block) => Object.fromEntries(block.split('\n').filter(Boolean).map((line) => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
  }))).filter((u) => u.Id);
}

const inside = (dir, root) => !!dir && !!root && (dir === root || dir.startsWith(root.endsWith('/') ? root : `${root}/`));
const time = (s) => { const t = Date.parse(String(s || '').replace(/^\w{3} /, '').replace(/ ([A-Z]{3,4})$/, '')); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

function createBackgroundJobs({ folders, run = exec, interval = 10000, platform = process.platform } = {}) {
  let jobs = new Map(), at = 0, flight = null;
  async function refresh() {
    if (platform !== 'linux') return jobs;
    const byFolder = new Map();
    for (const { id, path } of folders()) {
      if (!path || path.length < 8) continue;
      byFolder.set(path, byFolder.has(path) ? null : id);   // a folder shared by several threads names none of them
    }
    const roots = [...byFolder].filter(([, id]) => id);
    const next = new Map();
    if (roots.length) {
      const list = await run('systemctl', ['--user', 'list-units', '--type=service', '--all', '--plain', '--no-legend', '--no-pager']);
      const units = (list || '').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((u) => u && u.endsWith('.service'));
      const shown = units.length ? await run('systemctl', ['--user', 'show', '-p', 'Id,ActiveState,SubState,Result,WorkingDirectory,Description,ActiveEnterTimestamp,StateChangeTimestamp', ...units]) : null;
      for (const u of parseShow(shown || '')) {
        const owner = roots.find(([root]) => inside(u.WorkingDirectory, root));
        if (!owner) continue;
        const running = ['active', 'activating', 'reloading'].includes(u.ActiveState), failed = u.ActiveState === 'failed';
        if (!running && !failed) continue;
        const job = { unit: u.Id, name: u.Description || u.Id.replace(/\.service$/, ''), state: running ? 'running' : 'failed',
          since: time(running ? u.ActiveEnterTimestamp : u.StateChangeTimestamp) };
        if (failed) { job.result = u.Result; job.reason = RESULT_TEXT[u.Result] || `stopped (${u.Result || 'unknown reason'})`; }
        if (running) {
          const line = await run('journalctl', ['--user', '-u', u.Id, '-n', '1', '-o', 'cat', '--no-pager'], 2000);
          const last = (line || '').trim().split('\n').at(-1)?.trim();
          if (last) job.progress = last.slice(0, 160);
        }
        // a running job outranks an older failed one from the same thread
        const prev = next.get(owner[1]);
        if (!prev || (prev.state === 'failed' && running)) next.set(owner[1], job);
      }
    }
    jobs = next; at = Date.now();
    return jobs;
  }
  /** The last known jobs by thread id, refreshing in the background when they are older than the interval. */
  function current() {
    if (Date.now() - at > interval && !flight) flight = refresh().catch(() => jobs).finally(() => { flight = null; });
    return jobs;
  }
  return { current, refresh };
}

module.exports = { createBackgroundJobs, parseShow };
