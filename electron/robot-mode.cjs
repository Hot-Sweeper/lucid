function robotMode(selection) {
  const raw = selection?.options;
  const opts = Array.isArray(raw) ? Object.fromEntries(raw.filter(Boolean).map(o => [o.id, o.value])) : raw || {};
  const effort = ['effort','reasoningEffort','reasoning_effort','reasoning','thinkingLevel','variant'].map(k => opts[k]).find(v => typeof v === 'string') || '';
  return { effort, ultra: /^(ultra(?:code|think)?|max|xhigh|extra[_ -]?high)$/i.test(effort),
    fast: Object.entries(opts).some(([k,v]) => /fast/i.test(k) && (v === true || v === 'true') || /^(serviceTier|service_tier|speed)$/i.test(k) && /^(fast|priority)$/i.test(String(v))) };
}
module.exports = { robotMode };
