const fs = require('node:fs');
const path = require('node:path');
const skillPath = path.join(__dirname, 'skills', 'lucid', 'SKILL.md');
// Cache for this app process: an idempotent launch retry must keep the same text.
const skill = fs.readFileSync(skillPath, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
function withLucidSkill(message) {
  const text = String(message || '');
  return `${text}\n\n<lucid-work-skill>\n${skill}\n</lucid-work-skill>`;
}
module.exports = { withLucidSkill, skillPath };
