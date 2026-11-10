const fs = require('node:fs');
const path = require('node:path');
const brand = require('./brand.cjs');
const skillPath = path.join(__dirname, 'skills', 'lucid', 'SKILL.md');
// Cache for this app process: an idempotent launch retry must keep the same text.
const skill = fs.readFileSync(skillPath, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim().replaceAll('{{brand}}', brand.name);
/** Jobs launched through the hire flow carry the packaged work and evidence skill after the task. */
function withWorkSkill(message) {
  const text = String(message || '');
  return `${text}\n\n<work-skill>\n${skill}\n</work-skill>`;
}
module.exports = { withWorkSkill, skillPath };
