const OPEN = "('preparing','queued','starting','running','waiting','awaiting_input')";
const settled = p => p.settledOverride === 'settled' || (!!p.settledAt && !p.unsettledAt && !['active', 'unsettled'].includes(p.settledOverride));
const parse = text => { try { return JSON.parse(text); } catch { return {}; } };

function settledContexts(db, projectId) {
  if (!projectId) return [];
  const rows = db.prepare(`select thread_id as id, project_id as projectId, coalesce(provider_instance_id, default_provider) as provider, title, updated_at as updatedAt, payload_json as payload
    from orchestration_v2_projection_threads t where project_id = ? and archived_at is null and deleted_at is null
      and json_extract(payload_json, '$.pinnedAt') is null
      and (json_extract(payload_json, '$.settledOverride') = 'settled' or (json_extract(payload_json, '$.settledAt') is not null and json_extract(payload_json, '$.unsettledAt') is null and coalesce(json_extract(payload_json, '$.settledOverride'), '') not in ('active','unsettled')))
      and not exists (select 1 from orchestration_v2_projection_runs r where r.thread_id = t.thread_id and r.status in ${OPEN})
      and not exists (select 1 from scheduled_tasks s where s.thread_id = t.thread_id and s.enabled = 1)
      and not exists (select 1 from orchestration_v2_projection_runtime_requests q where q.thread_id = t.thread_id and q.status not in ('resolved','cancelled','expired','failed'))
    order by updated_at desc limit 300`).all(projectId);
  const original = db.prepare("select substr(json_extract(payload_json, '$.text'),1,2400) as text from orchestration_v2_projection_messages where thread_id = ? and role = 'user' order by created_at asc, message_id asc limit 1");
  const recent = db.prepare("select substr(json_extract(payload_json, '$.text'),1,1000) as text from orchestration_v2_projection_messages where thread_id = ? and role in ('user','assistant') order by created_at desc, message_id desc limit 8");
  return rows.map(({ payload, ...row }) => ({ ...row, model: parse(payload).modelSelection?.model || null, request: original.get(row.id)?.text || '', recent: recent.all(row.id).map(m => m.text || '').join('\n') }));
}

function validateContext(row, opts) {
  const p = parse(row?.payload_json);
  if (!row || row.project_id !== opts.project || row.archived_at || row.deleted_at || p.pinnedAt || !settled(p) || (p.modelSelection?.instanceId || row.provider_instance_id || row.default_provider) !== opts.provider) throw Error('That conversation is no longer available for this job. Use fresh context or choose another candidate.');
}

function resumeCommand(opts) {
  return { type: 'message.dispatch', commandId: opts.requestId, threadId: opts.contextThreadId, messageId: opts.requestId,
    text: opts.message, attachments: [], createdBy: 'user', creationSource: 'web',
    modelSelection: { instanceId: opts.provider, model: opts.model, options: Object.entries(opts.options || {}).map(([id, value]) => ({ id, value })) },
    dispatchMode: { type: 'start_immediately' } };
}

async function continueHire(db, opts, dispatch) {
  if (!opts.requestId || !opts.model || !String(opts.message || '').trim()) throw Error('Add a prompt and choose a model before continuing this conversation.');
  // A timed-out response can arrive after T3 already accepted the message.
  // Retrying that request must never create a second run or fall back to a new thread.
  const accepted = db.prepare('select thread_id, payload_json from orchestration_v2_projection_messages where message_id = ?').get(opts.requestId);
  if (accepted) {
    if (accepted.thread_id !== opts.contextThreadId || parse(accepted.payload_json).text !== opts.message) throw Error('This request was already used for a different job. Reopen hiring to start another job.');
    return { threadId: accepted.thread_id };
  }
  const row = db.prepare('select * from orchestration_v2_projection_threads where thread_id = ?').get(opts.contextThreadId);
  validateContext(row, opts);
  const active = db.prepare(`select 1 from orchestration_v2_projection_runs where thread_id = ? and status in ${OPEN} limit 1`).get(opts.contextThreadId);
  const scheduled = db.prepare('select 1 from scheduled_tasks where thread_id = ? and enabled = 1 limit 1').get(opts.contextThreadId);
  const pending = db.prepare("select 1 from orchestration_v2_projection_runtime_requests where thread_id = ? and status not in ('resolved','cancelled','expired','failed') limit 1").get(opts.contextThreadId);
  if (active || scheduled || pending) throw Error('That conversation is busy now. Use fresh context or choose another candidate.');
  await dispatch(resumeCommand(opts));
  return { threadId: opts.contextThreadId };
}

module.exports = { settledContexts, validateContext, continueHire, resumeCommand };
