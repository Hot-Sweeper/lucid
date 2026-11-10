// Jobs a thread leaves running are matched to it by folder, with failures explained.
const assert = require('node:assert/strict');
const { createBackgroundJobs } = require('../electron/background-jobs.cjs');
const units = {
  'render.service': { ActiveState: 'failed', SubState: 'failed', Result: 'oom-kill', WorkingDirectory: '/home/u/.t3/scratch/visualizer/app', Description: 'Checkpointed render', StateChangeTimestamp: 'Sat 2026-11-07 13:25:01 CET' },
  'server.service': { ActiveState: 'active', SubState: 'running', Result: 'success', WorkingDirectory: '/home/u/.t3/scratch/pixels', Description: 'Pixels server', ActiveEnterTimestamp: 'Sat 2026-11-07 12:00:00 CET' },
  'shared.service': { ActiveState: 'active', SubState: 'running', Result: 'success', WorkingDirectory: '/home/u/project', Description: 'Dev server' },
  'done.service': { ActiveState: 'inactive', SubState: 'dead', Result: 'success', WorkingDirectory: '/home/u/.t3/scratch/visualizer', Description: 'Keep awake' },
  'look-alike.service': { ActiveState: 'active', SubState: 'running', Result: 'success', WorkingDirectory: '/home/u/.t3/scratch/pixels-other', Description: 'Another app' },
};
const calls = [];
const run = async (cmd, args) => {
  calls.push(cmd);
  if (cmd === 'systemctl' && args.includes('list-units')) return Object.keys(units).map(u => `${u} loaded x y desc`).join('\n') + '\n';
  if (cmd === 'systemctl' && args.includes('show')) return args.filter(a => a.endsWith('.service')).map(id => [`Id=${id}`, ...Object.entries(units[id]).map(([k, v]) => `${k}=${v}`)].join('\n')).join('\n\n') + '\n';
  if (cmd === 'journalctl') return 'Rendered 1/300\nRendered 271/300, time remaining: 3m 0s\n';
  return null;
};
(async () => {
  const folders = () => [
    { id: 'visualizer', path: '/home/u/.t3/scratch/visualizer' },
    { id: 'pixels', path: '/home/u/.t3/scratch/pixels' },
    { id: 'a', path: '/home/u/project' }, { id: 'b', path: '/home/u/project' },
  ];
  const jobs = await createBackgroundJobs({ folders, run, platform: 'linux' }).refresh();
  assert.deepEqual([...jobs.keys()].sort(), ['pixels', 'visualizer'], 'a folder shared by two threads names neither; a look-alike folder name does not match');
  assert.equal(jobs.get('visualizer').state, 'failed');
  assert.equal(jobs.get('visualizer').reason, 'killed because the computer ran out of memory');
  assert.ok(jobs.get('visualizer').since, 'the failure time is kept');
  assert.equal(jobs.get('pixels').state, 'running');
  assert.equal(jobs.get('pixels').progress, 'Rendered 271/300, time remaining: 3m 0s', 'a running job shows its latest log line');
  calls.length = 0;
  assert.equal((await createBackgroundJobs({ folders: () => [], run, platform: 'linux' }).refresh()).size, 0);
  assert.equal(calls.length, 0, 'no thread folders, no systemd calls');
  assert.equal((await createBackgroundJobs({ folders, run, platform: 'win32' }).refresh()).size, 0, 'other platforms report nothing');
  console.log('PASS: background jobs matched by thread folder, shared folders skipped, failures explained, live progress, idle and non-Linux paths.');
})().catch(e => { console.error(e); process.exitCode = 1; });
