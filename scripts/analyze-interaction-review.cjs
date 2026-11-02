// Analyze matched fresh-process runs. Cycle statistics are observations, not
// independent launches, and a median of cycle p95s is never a pooled frame p95.
const fs = require('node:fs'), path = require('node:path');
const { summarizeResourceRows } = require('./interaction-review-resources.cjs');
const number = value => typeof value === 'number' && Number.isFinite(value);
function distribution(values) {
  const known = values.filter(number), sorted = [...known].sort((a, b) => a - b), n = sorted.length;
  return { count: n, mean: n ? known.reduce((a, b) => a + b, 0) / n : null,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.ceil((n - 1) / 2)]) / 2 : null,
    min: n ? sorted[0] : null, max: n ? sorted.at(-1) : null, values: known };
}
function offeredInputCount(phase) {
  if (number(phase.offeredInputCount)) return phase.offeredInputCount;
  if (Array.isArray(phase.sent)) return phase.sent.length;
  if (number(phase.offerGaps?.count)) return phase.offerGaps.count + 1;
  if (number(phase.ack?.count) && phase.ack.count > 0) return phase.ack.count;
  if (/^cycle-recovery-\d+$/.test(phase.name)) return 0;
  return null;
}
function completeCpuCost(resources) {
  const cpu = resources?.cpu;
  return number(cpu?.cpuSeconds) && number(resources.durationMs) && resources.durationMs > 0
    && cpu.oneCorePercent?.coveredMs >= resources.durationMs - .001 ? cpu.cpuSeconds : null;
}
const metrics = phase => ({
  activeFrameMeanMs: phase.activeFrames?.mean, activeFrameP95Ms: phase.activeFrames?.p95,
  activeFrameP99Ms: phase.activeFrames?.p99, activeFrameMaxMs: phase.activeFrames?.max,
  activeFrameOver144Share: phase.activeFrames?.over144, activeFrameOver60Share: phase.activeFrames?.over60,
  drainFrameP95Ms: phase.drainFrames?.p95, ackP95Ms: phase.ack?.p95, ackMaxMs: phase.ack?.max,
  eventDelayP95Ms: phase.rendererInput?.delay?.p95, firstHandlerToCommitP95Ms: phase.commits?.first?.p95,
  latestHandlerToCommitP95Ms: phase.commits?.latest?.p95, postOfferInputCount: phase.inputAfterOffer?.count,
  lastPostOfferInputMs: phase.inputAfterOffer?.lastDelayMs, queueDrainMs: phase.queueDrainMs, settleMs: phase.settleMs,
  offerGapMedianMs: phase.offerGaps?.p50, offerGapP95Ms: phase.offerGaps?.p95,
  cpuOneCoreMeanPercent: phase.resources?.cpu?.oneCorePercent?.mean,
  cpuMachineMeanPercent: phase.resources?.cpu?.machinePercent?.mean,
  cpuIntervalP95OneCorePercent: phase.resources?.cpu?.oneCorePercent?.p95,
  cpuSeconds: completeCpuCost(phase.resources),
  offeredInputCount: offeredInputCount(phase),
  cpuSecondsPerInput: completeCpuCost(phase.resources) !== null && offeredInputCount(phase) > 0 ? completeCpuCost(phase.resources) / offeredInputCount(phase) : null,
  cpuSecondsPer96Inputs: completeCpuCost(phase.resources) !== null && offeredInputCount(phase) > 0 ? completeCpuCost(phase.resources) / offeredInputCount(phase) * 96 : null,
  elapsedSeconds: number(phase.resources?.durationMs) ? phase.resources.durationMs / 1000 : null,
  workingSetMedianMiB: phase.resources?.memory?.workingSetMiB?.median,
  workingSetMaxMiB: phase.resources?.memory?.workingSetMiB?.max,
  privateMedianMiB: phase.resources?.memory?.privateMiB?.median,
  privateMaxMiB: phase.resources?.memory?.privateMiB?.max,
});
function summarizePhases(phases) {
  const groups = {};
  for (const phase of phases) (groups[phase.name.replace(/-\d+$/, '')] ??= []).push(phase);
  return Object.fromEntries(Object.entries(groups).map(([name, rows]) => {
    const values = rows.map(metrics), keys = Object.keys(values[0]);
    const coveredMs = rows.reduce((sum, row) => sum + (row.resources?.cpu?.oneCorePercent?.coveredMs || 0), 0);
    const cpuSeconds = rows.reduce((sum, row) => sum + (row.resources?.cpu?.cpuSeconds || 0), 0);
    return [name, { cycles: rows.length,
      metrics: Object.fromEntries(keys.map(key => [key, distribution(values.map(row => row[key]))])),
      cpuAcrossCoveredIntervals: { coveredMs, cpuSeconds: coveredMs ? cpuSeconds : null,
        oneCoreMeanPercent: coveredMs ? cpuSeconds / (coveredMs / 1000) * 100 : null,
        excludedIntervals: rows.reduce((sum, row) => sum + (row.resources?.cpu?.excludedIntervals?.length || 0), 0) },
      incompleteDrainCycles: rows.filter(row => row.drained === false).map(row => row.name),
    }];
  }));
}
function runMetrics(result, tail, workload) {
  const idle = result.idleResources, recovery = result.recoveryResources;
  const repeated = workload.repeated?.resources;
  const cycles = workload.cycles.map(cycle => cycle.resources);
  return {
    idleCpuOneCoreMeanPercent: idle?.cpu?.oneCorePercent?.mean,
    idleWorkingSetMedianMiB: idle?.memory?.workingSetMiB?.median, idlePrivateMedianMiB: idle?.memory?.privateMiB?.median,
    recoveryCpuOneCoreMeanPercent: recovery?.cpu?.oneCorePercent?.mean,
    recoveryWorkingSetMedianMiB: recovery?.memory?.workingSetMiB?.median, recoveryPrivateMedianMiB: recovery?.memory?.privateMiB?.median,
    recoveryWorkingSetEndpointMiB: recovery?.memory?.workingSetMiB?.endpoint, recoveryPrivateEndpointMiB: recovery?.memory?.privateMiB?.endpoint,
    last10sRecoveryCpuOneCoreMeanPercent: tail?.cpu?.oneCorePercent?.mean,
    last10sRecoveryCpuMachineMeanPercent: tail?.cpu?.machinePercent?.mean,
    last10sRecoveryWorkingSetMedianMiB: tail?.memory?.workingSetMiB?.median,
    last10sRecoveryPrivateMedianMiB: tail?.memory?.privateMiB?.median,
    last10sRecoveryWorkingSetEndpointMiB: tail?.memory?.workingSetMiB?.endpoint,
    last10sRecoveryPrivateEndpointMiB: tail?.memory?.privateMiB?.endpoint,
    measuredWindowCpuOneCoreMeanPercent: repeated?.cpu?.oneCorePercent?.mean,
    measuredWindowCpuMachineMeanPercent: repeated?.cpu?.machinePercent?.mean,
    measuredWindowCpuSeconds: completeCpuCost(repeated),
    measuredWindowElapsedSeconds: number(repeated?.durationMs) ? repeated.durationMs / 1000 : null,
    measuredWindowCpuSecondsPerCycle: completeCpuCost(repeated) !== null && cycles.length ? completeCpuCost(repeated) / cycles.length : null,
    measuredWindowWorkingSetMedianMiB: repeated?.memory?.workingSetMiB?.median,
    measuredWindowPrivateMedianMiB: repeated?.memory?.privateMiB?.median,
    measuredWindowWorkingSetMaxMiB: repeated?.memory?.workingSetMiB?.max,
    measuredWindowPrivateMaxMiB: repeated?.memory?.privateMiB?.max,
    completeCycleCpuSecondsMean: distribution(cycles.map(completeCpuCost)).mean,
  };
}
function workloadWindows(result, rows, offset, cores) {
  const cycles = [], phases = result.phases || [];
  if (!rows.length || offset === null || !number(cores) || cores <= 0) return { cycles, repeated: null };
  for (const start of phases.filter(phase => /^normal-zoom-\d+$/.test(phase.name))) {
    const index = Number(start.name.match(/(\d+)$/)[1]);
    const finish = phases.find(phase => phase.name === `cycle-recovery-${index}`);
    if (!number(start.start) || !number(finish?.end) || finish.end <= start.start) continue;
    const inCycle = phases.filter(phase => phase.start >= start.start && phase.end <= finish.end);
    const inputCounts = inCycle.map(phase => ({ name: phase.name, count: offeredInputCount(phase) }));
    const resources = summarizeResourceRows(rows, start.start - offset, finish.end - offset, cores);
    cycles.push({ name: `complete-cycle-${index}`, index, start: start.start, end: finish.end, inputCounts,
      offeredInputCount: inputCounts.every(phase => number(phase.count)) ? inputCounts.reduce((sum, phase) => sum + phase.count, 0) : null,
      resources, completeCpuCost: completeCpuCost(resources),
      label: 'One complete fixed-input cycle, including phase setup, drains and its cycle recovery; warmup and final cleanup excluded.' });
  }
  cycles.sort((a, b) => a.index - b.index);
  if (!cycles.length) return { cycles, repeated: null };
  const start = Math.min(...cycles.map(cycle => cycle.start)), end = Math.max(...cycles.map(cycle => cycle.end));
  const resources = summarizeResourceRows(rows, start - offset, end - offset, cores);
  return { cycles, repeated: { start, end, cycles: cycles.length,
    offeredInputCount: cycles.every(cycle => number(cycle.offeredInputCount)) ? cycles.reduce((sum, cycle) => sum + cycle.offeredInputCount, 0) : null,
    resources, completeCpuCost: completeCpuCost(resources),
    label: 'First normal zoom start through last cycle recovery end, including gaps between cycles; warmup and final cleanup excluded.' } };
}
function cleanupCounts(state) {
  const fields = ['desks', 'allDesks', 'transit', 'exits', 'chatRows', 'chatNodes', 'canvases', 'backingPixels', 'dom', 'worldScroll'];
  return { ...Object.fromEntries(fields.map(key => [key, number(state?.[key]) ? state[key] : null])),
    ...Object.fromEntries(['surfaces', 'assets', 'pending', 'bytes', 'cached'].map(key => [`staticArt.${key}`, number(state?.staticArt?.[key]) ? state.staticArt[key] : null])),
    ...Object.fromEntries(['loops', 'active', 'pendingImages'].map(key => [`renderLoops.${key}`, number(state?.renderLoops?.[key]) ? state.renderLoops[key] : null])),
  };
}
function processSeries(rows, cores) {
  const validCores = number(cores) && cores > 0;
  return rows.map((row, i) => {
    const summary = i && row.at > rows[i - 1].at ? summarizeResourceRows([rows[i - 1], row], rows[i - 1].at, row.at, validCores ? cores : 1) : null;
    const total = field => row.error || !row.processes.length || !row.processes.every(process => number(process.memory?.[field]))
      ? null : row.processes.reduce((sum, process) => sum + process.memory[field], 0) / 1024;
    return { ...row,
      intervalStart: i ? rows[i - 1].at : null,
      totals: { workingSetMiB: total('workingSetSize'), privateMiB: total('privateBytes'),
        oneCorePercent: summary?.cpu.oneCorePercent.mean ?? null, machinePercent: validCores ? summary?.cpu.machinePercent.mean ?? null : null,
        excludedIntervals: summary?.cpu.excludedIntervals ?? [] },
      processes: row.processes.map(process => {
        const usage = summary?.cpu.processes.find(value => value.pid === process.pid && value.creationTime === (process.creationTime ?? null) && value.type === process.type);
        return { ...process, workingSetMiB: number(process.memory?.workingSetSize) ? process.memory.workingSetSize / 1024 : null,
          privateMiB: number(process.memory?.privateBytes) ? process.memory.privateBytes / 1024 : null,
          oneCorePercent: usage?.oneCorePercent.mean ?? null, machinePercent: validCores ? usage?.machinePercent.mean ?? null : null };
      }),
    };
  });
}
function comparable(result) {
  return JSON.stringify({ hardware: result.hardware, viewport: result.executing?.viewport, seed: result.seed,
    roster: result.executing?.roster, cycles: result.request?.cycles, isolation: result.request?.isolation || 'base',
    pacedOnly: !!result.request?.pacedOnly, finalRecoveryMs: result.request?.finalRecoveryMs ?? 30000 });
}
function analyzeRecords(records) {
  const excluded = [], runs = [];
  for (const record of records) {
    const r = record.result;
    const reasons = [record.loadError, record.exitCode != null && record.exitCode !== 0 ? `exit-${record.exitCode}` : null,
      !r ? 'missing-result' : null, r?.error, r?.errors?.length ? 'renderer-errors' : null,
      r && !r.completed ? 'incomplete-run' : null, r?.request?.trace ? 'tracing-enabled' : null,
      r?.request?.quick ? 'quick-diagnostic-run' : null, r?.request?.isolation && r.request.isolation !== 'base' ? 'diagnostic-isolation' : null,
      !['before', 'after'].includes(record.variant) ? 'unknown-variant' : null].filter(Boolean);
    if (reasons.length) { excluded.push({ pair: record.pair, variant: record.variant, directory: record.directory, reasons }); continue; }
    const rows = record.processRows || [], cores = r.hardware?.logicalProcessors;
    const offset = number(r.clockSync?.offset) ? r.clockSync.offset : null, recovery = r.finalRecovery;
    const tail = rows.length && offset !== null && number(cores) && cores > 0 && number(recovery?.start) && number(recovery?.end)
      ? summarizeResourceRows(rows, Math.max(recovery.start, recovery.end - 10000) - offset, recovery.end - offset, cores) : null;
    const workload = workloadWindows(r, rows, offset, cores);
    const beforeCounts = cleanupCounts(r.preCleanup), afterCounts = cleanupCounts(recovery?.state);
    runs.push({ ...record, phases: summarizePhases([...(r.phases || []), ...workload.cycles]), metrics: runMetrics(r, tail, workload),
      completeCycles: workload.cycles, measuredWindow: workload.repeated,
      last10sRecovery: tail, processSeries: processSeries(rows, number(cores) && cores > 0 ? cores : NaN),
      processSeriesUnits: { at: 'epoch milliseconds in sampler/main-process clock', memory: 'raw MemoryInfo KiB, derived MiB', cpu: 'raw cumulativeCPUUsage seconds; derived interval core percentages' },
      cleanup: { before: r.preCleanup ?? null, after: recovery?.state ?? null, beforeCounts, afterCounts,
        countChanges: Object.fromEntries(Object.keys(beforeCounts).map(key => [key, number(beforeCounts[key]) && number(afterCounts[key]) ? afterCounts[key] - beforeCounts[key] : null])) },
      resourceCoverage: { idleMs: r.idleResources?.cpu?.oneCorePercent?.coveredMs ?? null,
        recoveryMs: r.recoveryResources?.cpu?.oneCorePercent?.coveredMs ?? null,
        recoveryDurationMs: r.recoveryResources?.durationMs ?? null,
        recoveryMemorySamples: r.recoveryResources?.memory?.workingSetMiB?.samples ?? null },
    });
  }
  const paired = [], unmatched = [];
  for (const pair of new Set(runs.map(run => run.pair))) {
    const before = runs.filter(run => run.pair === pair && run.variant === 'before'), after = runs.filter(run => run.pair === pair && run.variant === 'after');
    if (before.length !== 1 || after.length !== 1) { unmatched.push({ pair, reason: 'Need exactly one valid before and after launch' }); continue; }
    if (comparable(before[0].result) !== comparable(after[0].result)) { unmatched.push({ pair, reason: 'Hardware, viewport, seed, roster, cycles, paced mode, recovery duration or isolation differs' }); continue; }
    paired.push({ pair, before: before[0], after: after[0] });
  }
  const phaseNames = [...new Set(paired.flatMap(pair => Object.keys(pair.before.phases).filter(name => pair.after.phases[name])))];
  const phases = {};
  for (const name of phaseNames) {
    const keys = [...new Set(paired.flatMap(pair => Object.keys(pair.before.phases[name]?.metrics || {})))];
    phases[name] = {};
    for (const key of keys) {
      const runValue = run => {
        const phase = run.phases[name];
        if (key === 'cpuOneCoreMeanPercent') return phase?.cpuAcrossCoveredIntervals.oneCoreMeanPercent ?? null;
        if (key === 'cpuMachineMeanPercent') {
          const value = phase?.cpuAcrossCoveredIntervals.oneCoreMeanPercent;
          return number(value) && number(run.result.hardware?.logicalProcessors) ? value / run.result.hardware.logicalProcessors : null;
        }
        return phase?.metrics[key]?.mean ?? null;
      };
      const observations = paired.map(pair => ({ pair: pair.pair,
        before: runValue(pair.before), after: runValue(pair.after) })).filter(row => number(row.before) && number(row.after));
      phases[name][key] = { beforeRunMeans: distribution(observations.map(row => row.before)), afterRunMeans: distribution(observations.map(row => row.after)),
        beforePerCycleDistribution: distribution(paired.flatMap(pair => pair.before.phases[name]?.metrics[key]?.values || [])),
        afterPerCycleDistribution: distribution(paired.flatMap(pair => pair.after.phases[name]?.metrics[key]?.values || [])),
        pairedDifference: distribution(observations.map(row => row.after - row.before)), observations };
    }
  }
  const resourceKeys = [...new Set(paired.flatMap(pair => Object.keys(pair.before.metrics)))];
  const resources = Object.fromEntries(resourceKeys.map(key => {
    const observations = paired.map(pair => ({ pair: pair.pair, before: pair.before.metrics[key] ?? null, after: pair.after.metrics[key] ?? null }))
      .filter(row => number(row.before) && number(row.after));
    return [key, { before: distribution(observations.map(row => row.before)), after: distribution(observations.map(row => row.after)),
      pairedDifference: distribution(observations.map(row => row.after - row.before)), observations }];
  }));
  return {
    matchedPairs: paired.length, phases, resources, excluded, unmatched,
    runs: runs.map(({ result, loadError, processRows, ...run }) => ({ ...run, hardware: result.hardware, executing: result.executing,
      initialIdle: result.initialIdle, finalRecovery: result.finalRecovery, workload: result.workload, cycleCheckpoints: result.cycleCheckpoints || [] })),
    notes: [
      'Fresh process launches are the matched observations. Cycles within a launch share caches, ambient state and time; they are not independent launch replicates.',
      'Each phase metric retains its per-cycle distribution (mean, median and range). Comparison distributions use per-launch means of cycle metrics, except CPU means combine covered intervals with duration weighting. A mean or median of cycle p95s is not a pooled event/frame/CPU p95.',
      'cpuAcrossCoveredIntervals is duration-weighted across measured CPU intervals. Unknown intervals remain excluded. Memory medians and endpoints are sampled MiB values, not limits.',
      'CPU seconds compare computational cost for the fixed offered workload as well as utilization. cpuSecondsPer96Inputs normalizes a phase cost to 96 offered wheel inputs using its recorded sender count; this is not a delivered-event count or a physical energy measure. Mixed phases also include pointer movement.',
      'Complete cycle and measured-window costs come directly from cumulative process samples, including setup/drain/recovery time and gaps. Fixed-workload cost is unknown when CPU interval coverage is incomplete; known partial CPU time remains in the raw resource summary.',
      'Positive paired differences mean after is numerically higher. Timing and memory differences need context; fewer callbacks or smaller counts alone do not establish responsiveness.',
      'Summed working sets can double-count shared pages. GPU process RAM is not GPU VRAM; private committed memory can exceed resident working set.',
      'Final cleanup may change the workload by removing fixture projects and sending persistent roster robots elsewhere. Compare its recorded state and recovery duration, not just DOM count or initial idle RAM.',
      'Final recovery is a post-request workload transition, not proof of a full teardown. Desks, persistent roster robots and transit may remain active; the recorded cleanup counts are authoritative.',
      'Long-run recorder arrays intentionally grow. cycleCheckpoints record their exact element counts, fixture text UTF-8 bytes and any retained main-process recorder copy. These describe instrumentation ownership, not estimated JavaScript object bytes; do not attribute all heap growth to the app.',
      'The last10sRecovery window is the final 10 seconds of recorded recovery (shorter only when recovery itself is shorter), converted from renderer timestamps with clockSync.offset. Series preserve raw counters and include derived per-interval values; the first CPU reading is unknown.',
      'These measurements do not establish physical display FPS, human input feel, battery savings or a long-duration memory ceiling.',
    ],
  };
}
function analyzeManifest(file) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = manifest.runs.map(run => {
    const directory = path.isAbsolute(run.directory) ? run.directory : path.resolve(path.dirname(file), run.directory);
    try {
      const series = path.join(directory, 'process-samples.json');
      return { ...run, directory, result: JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8')),
        processRows: fs.existsSync(series) ? JSON.parse(fs.readFileSync(series, 'utf8')) : [], processSamplesFile: series };
    }
    catch (error) { return { ...run, directory, loadError: String(error.message || error) }; }
  });
  return { manifest: path.resolve(file), tools: manifest.tools, ...analyzeRecords(records) };
}
if (require.main === module) {
  const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  const target = arg('--manifest') || process.argv[2];
  if (!target) throw Error('Usage: node scripts/analyze-interaction-review.cjs --manifest <matched-runs.json> [--out <analysis.json>] [--series-dir <directory>]');
  const file = fs.statSync(target).isDirectory() ? path.join(target, 'matched-runs.json') : target;
  const analysis = analyzeManifest(file), out = arg('--out'), seriesDirectory = arg('--series-dir');
  if (seriesDirectory) {
    fs.mkdirSync(seriesDirectory, { recursive: true });
    for (const run of analysis.runs) {
      const name = `${run.pair}-${run.variant}`.replace(/[^a-z0-9_-]/gi, '_');
      const destination = path.resolve(seriesDirectory, `${name}-process-series.json`);
      fs.writeFileSync(destination, JSON.stringify({ hardware: run.hardware, source: run.processSamplesFile, units: run.processSeriesUnits, rows: run.processSeries }, null, 2) + '\n');
      run.processSeriesFile = destination; delete run.processSeries;
    }
  }
  const output = JSON.stringify(analysis, null, 2);
  if (out) fs.writeFileSync(out, output + '\n'); else process.stdout.write(output + '\n');
}
module.exports = { analyzeRecords, analyzeManifest };
