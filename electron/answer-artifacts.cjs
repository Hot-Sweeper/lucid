// Only explicit presentation tools become answers. Never expose arbitrary tool logs as HTML.
function answerArtifacts(db, threadId, { since, before } = {}) {
  return db.prepare(`select turn_item_id as id, updated_at as at,
      json_extract(payload_json, '$.input.html') as html,
      json_extract(payload_json, '$.output.htmlRender.title') as title,
      json_extract(payload_json, '$.output.htmlRender.height') as height
    from orchestration_v2_projection_turn_items where thread_id = ? and type = 'dynamic_tool'
      and status = 'completed' and json_extract(payload_json, '$.output.htmlRender.attachmentId') is not null
      ${since ? 'and updated_at >= ?' : ''} ${before ? 'and updated_at <= ?' : ''}
    order by ordinal asc`).all(threadId, ...(since ? [since] : []), ...(before ? [before] : [])).map(r => ({
      id: `artifact:${r.id}`, role: 'assistant', at: r.at, orderAt: r.at, streaming: false, text: '', attachments: [],
      artifact: { html: typeof r.html === 'string' ? r.html : '', title: r.title || 'Visual', height: Math.min(1200, Math.max(150, Number(r.height) || 400)) },
    }));
}
module.exports = { answerArtifacts };
