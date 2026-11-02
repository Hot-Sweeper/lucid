const os = require('node:os');

const SOURCES = {
  cpu: 'https://www.electronjs.org/docs/latest/api/structures/cpu-usage',
  memory: 'https://www.electronjs.org/docs/latest/api/structures/memory-info',
  identity: 'https://www.electronjs.org/docs/latest/api/structures/process-metric',
};
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const identity = process => `${process.pid}:${process.creationTime ?? 'unknown'}:${process.type}`;
function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (q === .5) return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
  return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
}
function weighted(values) {
  const coveredMs = values.reduce((sum, value) => sum + value.ms, 0);
  const percentile = q => {
    let elapsed = 0;
    for (const value of [...values].sort((a, b) => a.value - b.value)) {
      elapsed += value.ms;
      if (elapsed >= coveredMs * q) return value.value;
    }
    return null;
  };
  return {
    mean: coveredMs ? values.reduce((sum, value) => sum + value.value * value.ms, 0) / coveredMs : null,
    p50: percentile(.5), p95: percentile(.95), max: values.length ? Math.max(...values.map(value => value.value)) : null,
    coveredMs, intervals: values.length,
  };
}
function memoryStats(values) {
  const known = values.filter(value => value !== null);
  return { median: quantile(known, .5), p95: quantile(known, .95), max: known.length ? Math.max(...known) : null,
    endpoint: values.length ? values.at(-1) : null, samples: known.length, missingSamples: values.length - known.length };
}

function summarizeRows(rows, start, end, logicalProcessors) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw Error('Resource summary needs a finite ordered time window.');
  const cpu = [], processes = new Map(), excludedIntervals = [];
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1], current = rows[i];
    const from = Math.max(start, previous.at), to = Math.min(end, current.at), ms = to - from;
    if (!(ms > 0) || !(current.at > previous.at)) continue;
    const old = new Map(previous.processes.map(process => [identity(process), process]));
    const currentIds = new Set(current.processes.map(identity));
    const reasons = new Set();
    if (previous.error || current.error) reasons.add('sampling-error');
    if (previous.session !== current.session) reasons.add('sampler-restarted');
    if (!current.processes.length) reasons.add('no-processes');
    if ([...old.keys()].some(key => !currentIds.has(key))) reasons.add('process-departed');
    let total = 0;
    for (const process of current.processes) {
      const key = identity(process), before = old.get(key);
      const a = before?.cpu?.cumulativeCPUUsage, b = process.cpu?.cumulativeCPUUsage;
      if (!before) { reasons.add('new-process-needs-baseline'); continue; }
      if (!finite(a) || !finite(b)) { reasons.add('cumulative-cpu-unavailable'); continue; }
      if (b < a) { reasons.add('cumulative-cpu-reset'); continue; }
      if (previous.session !== current.session || previous.error || current.error) continue;
      // Cumulative seconds are independent of other getAppMetrics callers.
      // The sampled interval average is apportioned over any clipped boundary.
      const value = (b - a) / ((current.at - previous.at) / 1000) * 100;
      total += value;
      let record = processes.get(key);
      if (!record) {
        record = { pid: process.pid, creationTime: process.creationTime ?? null, type: process.type, values: [] };
        processes.set(key, record);
      }
      record.values.push({ value, ms });
    }
    if (reasons.size) excludedIntervals.push({ start: from, end: to, reasons: [...reasons] });
    else cpu.push({ value: total, ms });
  }
  const selected = rows.filter(row => row.at >= start && row.at <= end);
  const memoryTotal = (row, field) => row.error || !row.processes.length || !row.processes.every(process => finite(process.memory?.[field]))
    ? null : row.processes.reduce((sum, process) => sum + process.memory[field], 0) / 1024;
  return {
    start, end, durationMs: end - start, logicalProcessors, samples: selected.length,
    cpu: {
      oneCorePercent: weighted(cpu), machinePercent: weighted(cpu.map(value => ({ ...value, value: value.value / logicalProcessors }))),
      cpuSeconds: cpu.length ? cpu.reduce((sum, value) => sum + value.value / 100 * value.ms / 1000, 0) : null,
      excludedIntervals,
      processes: [...processes.values()].map(({ values, ...process }) => ({ ...process,
        oneCorePercent: weighted(values), machinePercent: weighted(values.map(value => ({ ...value, value: value.value / logicalProcessors }))) })),
    },
    memory: {
      workingSetMiB: memoryStats(selected.map(row => memoryTotal(row, 'workingSetSize'))),
      privateMiB: memoryStats(selected.map(row => memoryTotal(row, 'privateBytes'))),
      endpointAt: selected.at(-1)?.at ?? null,
    },
    notes: [
      'CPU uses adjacent cumulative CPU seconds for the same PID, creation time and type. A new process needs its own baseline; unknown intervals are excluded, not reported as zero.',
      'One-core CPU percent may exceed 100. Machine percent divides it by the recorded logical processor count.',
      'CPU quantiles and means are weighted by clipped interval duration. Boundary clipping assumes a constant average within that sample interval; max is an interval average, not an instantaneous peak.',
      'MemoryInfo is reported in KiB and divided by 1024 for MiB. Memory quantiles use the samples inside the requested window; endpoint is its last sample, not an extrapolation.',
      'Summed process working sets can double-count shared memory. Private bytes are unavailable unless every sampled process reports them.',
      'GPU process memory here is system RAM, not GPU VRAM. These samples do not measure battery use or establish a memory ceiling.',
    ],
    sources: SOURCES,
  };
}

function createResourceSampler(app, { intervalMs = 1000, clock = () => performance.timeOrigin + performance.now() } = {}) {
  if (!(Number.isFinite(intervalMs) && intervalMs > 0)) throw Error('Resource sampling interval must be positive.');
  const rows = [], logicalProcessors = Math.max(1, os.cpus().length);
  let timer = null, running = false, sampling = false, session = 0;
  function sample() {
    if (sampling) return null;
    sampling = true;
    const sampleStartedAt = clock();
    try {
      const metrics = app.getAppMetrics();
      const row = { at: clock(), sampleStartedAt, session, processes: metrics.map(({ pid, type, creationTime, name, serviceName, cpu, memory }) => ({
        pid, type, creationTime, name, serviceName, cpu: { ...cpu }, memory: { ...memory },
      })) };
      row.sampleDurationMs = row.at - sampleStartedAt;
      rows.push(row); return row;
    } catch (error) {
      const row = { at: clock(), sampleStartedAt, session, processes: [], error: String(error?.message || error) };
      rows.push(row); return row;
    } finally { sampling = false; }
  }
  function schedule() {
    if (!running || timer !== null) return;
    timer = setTimeout(() => { timer = null; sample(); schedule(); }, intervalMs);
    timer.unref?.();
  }
  const sampler = {
    start() { if (!running) { running = true; session++; sample(); schedule(); } return sampler; },
    sample,
    stop() { running = false; if (timer !== null) clearTimeout(timer); timer = null; return rows; },
    rows,
    summarize(start, end) { return summarizeRows(rows, start, end, logicalProcessors); },
  };
  return sampler;
}
module.exports = { createResourceSampler, summarizeResourceRows: summarizeRows };
