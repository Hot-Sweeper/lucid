const assert = require('node:assert/strict');
const os = require('node:os');
const { createResourceSampler } = require('./interaction-review-resources.cjs');
const processMetric = (pid, cumulativeCPUUsage, workingSetSize = 1024, privateBytes = 512, creationTime = 123) => ({
  pid, creationTime, type: pid === 2 ? 'GPU' : 'Tab',
  cpu: { cumulativeCPUUsage, percentCPUUsage: 999 }, memory: { workingSetSize, privateBytes },
});
function fixture() {
  let now = 0, metrics = [];
  const sampler = createResourceSampler({ getAppMetrics() { if (metrics instanceof Error) throw metrics; return metrics; } }, { clock: () => now });
  return { sampler, sample(at, processes) { now = at; metrics = processes; return sampler.sample(); } };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);

(async () => {
  const fixed = fixture();
  fixed.sample(0, [processMetric(1, 10), processMetric(2, 1, 2048, 1024)]);
  let summary = fixed.sampler.summarize(0, 0);
  assert.equal(summary.cpu.oneCorePercent.mean, null, 'First CPU reading must be unknown, not a false idle zero');
  fixed.sample(1000, [processMetric(1, 10.5, 2048, 1024), processMetric(2, 1.25, 2048, 1024)]);
  fixed.sample(4000, [processMetric(1, 13.5, 4096, 2048), processMetric(2, 1.25, 2048, 1024)]);
  summary = fixed.sampler.summarize(0, 4000);
  near(summary.cpu.oneCorePercent.mean, 93.75);
  near(summary.cpu.oneCorePercent.p95, 100);
  near(summary.cpu.machinePercent.mean, 93.75 / os.cpus().length);
  near(summary.cpu.cpuSeconds, 3.75);
  assert.equal(summary.cpu.oneCorePercent.coveredMs, 4000);
  assert.deepEqual(summary.memory.workingSetMiB, { median: 4, p95: 6, max: 6, endpoint: 6, samples: 3, missingSamples: 0 });
  assert.equal(summary.memory.privateMiB.endpoint, 3);
  assert.equal(summary.memory.endpointAt, 4000);
  const clipped = fixed.sampler.summarize(500, 2000);
  near(clipped.cpu.oneCorePercent.mean, (75 * 500 + 100 * 1000) / 1500);
  near(clipped.cpu.cpuSeconds, 1.375);
  assert.equal(clipped.cpu.oneCorePercent.coveredMs, 1500);
  assert.equal(clipped.memory.workingSetMiB.endpoint, 4, 'Endpoint cannot extrapolate a later sample backward');
  assert.equal(fixed.sampler.rows[0].processes[0].cpu.cumulativeCPUUsage, 10);
  assert.equal(fixed.sampler.rows[0].processes[1].type, 'GPU');

  const restart = fixture();
  restart.sample(0, [processMetric(1, 1, 1024, 512, 10)]);
  restart.sample(1000, [processMetric(1, 50, 2048, 1024, 20)]);
  restart.sample(2000, [processMetric(1, 50.2, 4096, 1024, 20)]);
  const restarted = restart.sampler.summarize(0, 2000);
  near(restarted.cpu.oneCorePercent.mean, 20);
  assert.equal(restarted.cpu.oneCorePercent.coveredMs, 1000);
  assert.ok(restarted.cpu.excludedIntervals[0].reasons.includes('new-process-needs-baseline'), 'Reused PID with new creation time must not inherit CPU history');
  assert.ok(restarted.cpu.excludedIntervals[0].reasons.includes('process-departed'));
  assert.equal(restart.sampler.summarize(200, 400).cpu.oneCorePercent.mean, null);

  const unknown = fixture();
  unknown.sample(0, [processMetric(1, 0), processMetric(2, undefined, 2048, undefined)]);
  // Delete the optional value instead of supplying a fake memory zero.
  const missing = processMetric(2, undefined, 2048); delete missing.memory.privateBytes;
  unknown.sample(1000, [processMetric(1, .1), missing]);
  let incomplete = unknown.sampler.summarize(0, 1000);
  assert.equal(incomplete.cpu.oneCorePercent.mean, null);
  assert.equal(incomplete.cpu.processes.length, 1, 'Known per-process CPU remains available when an aggregate is incomplete');
  assert.equal(incomplete.memory.privateMiB.endpoint, null);
  assert.equal(incomplete.memory.privateMiB.missingSamples, 1);
  unknown.sample(2000, new Error('Fixture collection failure'));
  unknown.sample(3000, [processMetric(1, .4)]);
  assert.equal(unknown.sampler.summarize(1000, 3000).cpu.oneCorePercent.mean, null, 'Sampling failure must break adjacency');

  const resetCounter = fixture();
  resetCounter.sample(0, [processMetric(1, 10)]);
  resetCounter.sample(1000, [processMetric(1, 1)]);
  assert.ok(resetCounter.sampler.summarize(0, 1000).cpu.excludedIntervals[0].reasons.includes('cumulative-cpu-reset'));
  const evenMemory = fixture();
  evenMemory.sample(0, [processMetric(1, 0, 1024)]);
  evenMemory.sample(1000, [processMetric(1, 0, 3072)]);
  assert.equal(evenMemory.sampler.summarize(0, 1000).memory.workingSetMiB.median, 2);
  assert.equal(evenMemory.sampler.summarize(0, 1000).cpu.oneCorePercent.mean, 0, 'A genuine zero cumulative delta after priming is idle');

  let nested, reentrant;
  reentrant = createResourceSampler({ getAppMetrics() { nested = reentrant.sample(); return [processMetric(1, 0)]; } });
  reentrant.sample();
  assert.equal(nested, null); assert.equal(reentrant.rows.length, 1);
  let calls = 0;
  const timed = createResourceSampler({ getAppMetrics() { calls++; return [processMetric(1, calls / 100)]; } }, { intervalMs: 5 });
  timed.start(); timed.start(); assert.equal(calls, 1, 'Repeated start must not install a second sampler');
  await new Promise(resolve => setTimeout(resolve, 30)); timed.stop(); timed.stop();
  const stoppedCalls = calls; await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(stoppedCalls > 1); assert.equal(calls, stoppedCalls, 'Stop must release its only timer');
  timed.start(); timed.stop();
  assert.ok(timed.summarize(timed.rows[0].at, timed.rows.at(-1).at).cpu.excludedIntervals.some(interval => interval.reasons.includes('sampler-restarted')));
  assert.throws(() => timed.summarize(10, 1));
  console.log('Resource sampler passed: cumulative CPU, weighted/clipped windows, PID reuse, missing counters, collection errors, KiB conversion, endpoints, reentrancy and timer cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
