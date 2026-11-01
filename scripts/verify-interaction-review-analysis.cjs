const assert = require('node:assert/strict');
const { analyzeRecords } = require('./analyze-interaction-review.cjs');
const resource = (cpu, ms, memory) => ({ durationMs: ms, cpu: { oneCorePercent: { mean: cpu, p95: cpu + 5, coveredMs: ms },
  machinePercent: { mean: cpu / 8 }, cpuSeconds: cpu / 100 * ms / 1000, excludedIntervals: [] },
  memory: { workingSetMiB: { median: memory, max: memory + 10, endpoint: memory + 5, samples: 3 },
    privateMiB: { median: memory + 20, max: memory + 30, endpoint: memory + 25, samples: 3 } } });
function record(pair, variant, frameP95s, width = 1280) {
  return { pair, variant, exitCode: 0, directory: `${pair}-${variant}`,
    processRows: [0, 10000, 20000, 30000].map((at, i) => ({ at, session: 1, processes: [{ pid: 10, creationTime: 1, type: 'Tab',
      cpu: { cumulativeCPUUsage: [0, 1, 3, 3.5][i] }, memory: { workingSetSize: (i + 1) * 1024, privateBytes: (i + 1) * 2048 } }] })), result: {
    completed: '2026-11-01', hardware: { cpu: 'Fixture CPU', logicalProcessors: 8 }, seed: 1731,
    request: { cycles: 2, isolation: 'base', trace: false }, executing: { viewport: { width, height: 800, dpr: 1.5 }, roster: ['same'] }, errors: [],
    phases: frameP95s.map((p95, i) => ({ name: `normal-zoom-${i}`, activeFrames: { mean: p95 / 2, p95, p99: p95 + 1, max: p95 + 5 },
      ack: { p95: p95 / 3 }, offerGaps: { count: 95 }, commits: { first: { p95: p95 / 4 }, latest: { p95: p95 / 5 } },
      resources: resource(i ? 100 : 50, i ? 3000 : 1000, 100 + i * 10) })),
    idleResources: resource(20, 10000, 80), recoveryResources: resource(10, 30000, 60),
    clockSync: { offset: 100 }, preCleanup: { dom: 100, canvases: 4 }, finalRecovery: { state: { dom: 50, canvases: 2 }, start: 100, end: 30100 },
  } };
}
const records = [record(0, 'before', [10, 100]), record(0, 'after', [9, 90]), record(1, 'before', [30, 70]), record(1, 'after', [27, 63])];
const analysis = analyzeRecords(records), phase = analysis.phases['normal-zoom'];
assert.equal(analysis.matchedPairs, 2);
assert.equal(phase.activeFrameP95Ms.beforeRunMeans.median, 52.5);
assert.deepEqual(phase.activeFrameP95Ms.beforePerCycleDistribution.values, [10, 100, 30, 70]);
assert.equal(phase.activeFrameP95Ms.beforePerCycleDistribution.median, 50, 'Label the median of cycle p95 observations separately');
assert.deepEqual(phase.activeFrameP95Ms.pairedDifference.values, [-5.5, -5]);
assert.equal(phase.cpuOneCoreMeanPercent.beforeRunMeans.mean, 87.5, 'Combine CPU means by measured interval duration, not cycle count');
assert.equal(phase.cpuMachineMeanPercent.beforeRunMeans.mean, 87.5 / 8);
assert.equal(phase.cpuSecondsPer96Inputs.beforeRunMeans.mean, 1.75);
assert.equal(phase.offeredInputCount.beforeRunMeans.mean, 96);
assert.equal(analysis.resources.recoveryWorkingSetEndpointMiB.before.mean, 65);
assert.equal(analysis.resources.recoveryPrivateEndpointMiB.after.mean, 85);
assert.deepEqual(analysis.runs[0].cleanup.after, { dom: 50, canvases: 2 });
assert.equal(analysis.runs[0].cleanup.countChanges.dom, -50);
assert.equal(analysis.runs[0].cleanup.countChanges.canvases, -2);
assert.equal(analysis.runs[0].cleanup.countChanges.chatRows, null);
assert.equal(analysis.runs[0].last10sRecovery.durationMs, 10000);
assert.equal(analysis.runs[0].last10sRecovery.cpu.oneCorePercent.mean, 5);
assert.equal(analysis.runs[0].last10sRecovery.memory.workingSetMiB.median, 3.5);
assert.equal(analysis.resources.last10sRecoveryPrivateEndpointMiB.before.mean, 8);
assert.equal(analysis.runs[0].processSeries[0].totals.oneCorePercent, null);
assert.equal(analysis.runs[0].processSeries[1].totals.oneCorePercent, 10);
assert.equal(analysis.runs[0].processSeries.at(-1).processes[0].cpu.cumulativeCPUUsage, 3.5);
assert.equal(analysis.runs[0].processSeries.at(-1).processes[0].memory.workingSetSize, 4096);
assert.equal(analysis.runs[0].processSeries.at(-1).processes[0].privateMiB, 8);
assert.equal(phase.queueDrainMs.beforeRunMeans.count, 0, 'Unknown timing data cannot become false zero latency');
const diagnostic = record(2, 'before', [1, 1]); diagnostic.result.request.trace = true;
const mismatch = analyzeRecords([diagnostic, record(2, 'after', [1, 1]), record(3, 'before', [2, 2], 1280), record(3, 'after', [2, 2], 900),
  { pair: 4, variant: 'before', loadError: 'Missing fixture result' }]);
assert.equal(mismatch.matchedPairs, 0); assert.equal(mismatch.unmatched.length, 2); assert.equal(mismatch.excluded.length, 2);
assert.ok(mismatch.unmatched.some(row => row.reason.includes('viewport')));
const complete = record(5, 'before', [10, 20]);
const zooms = complete.result.phases;
complete.result.phases = [
  { ...zooms[0], start: 100, end: 5100 },
  { name: 'cycle-recovery-0', start: 10100, end: 15100 },
  { ...zooms[1], start: 16100, end: 21100 },
  { name: 'cycle-recovery-1', start: 25100, end: 30100 },
];
let completeAnalysis = analyzeRecords([complete]).runs[0];
assert.equal(completeAnalysis.completeCycles.length, 2);
assert.equal(completeAnalysis.completeCycles[0].resources.cpu.cpuSeconds, 2);
assert.ok(Math.abs(completeAnalysis.completeCycles[1].resources.cpu.cpuSeconds - 1.3) < 1e-9);
assert.equal(completeAnalysis.measuredWindow.resources.cpu.cpuSeconds, 3.5, 'Whole workload includes the gap between complete cycles');
assert.equal(completeAnalysis.measuredWindow.resources.durationMs, 30000);
assert.equal(completeAnalysis.measuredWindow.offeredInputCount, 192);
assert.equal(completeAnalysis.completeCycles[0].offeredInputCount, 96);
assert.equal(completeAnalysis.metrics.measuredWindowCpuSecondsPerCycle, 1.75);
assert.ok(Math.abs(completeAnalysis.metrics.completeCycleCpuSecondsMean - 1.65) < 1e-9);
delete complete.processRows[2].processes[0].cpu.cumulativeCPUUsage;
completeAnalysis = analyzeRecords([complete]).runs[0];
assert.equal(completeAnalysis.metrics.measuredWindowCpuSeconds, null, 'Partial counter coverage is not total fixed-workload CPU cost');
assert.equal(completeAnalysis.measuredWindow.resources.cpu.cpuSeconds, 1, 'Known partial CPU time remains available without being called complete cost');
console.log('Interaction analysis passed: matched fresh launches, correlated cycle labels, paired differences, weighted CPU, cleanup endpoints, unknown data and diagnostic/mismatched exclusions.');
