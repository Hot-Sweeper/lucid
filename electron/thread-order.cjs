// Matches T3 Code's manual sidebar order. Streaming updates never affect it.
const time = value => Date.parse(value || '') || 0;
const compareKey = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function sortThreads(threads) {
  return [...threads].sort((a, b) => {
    const section = t => t.settled ? 2 : t.pinned ? 0 : 1;
    const group = section(a) - section(b);
    if (group) return group;
    if (a.settled) return time(b.settledAt || b.updatedAt) - time(a.settledAt || a.updatedAt) || a.id.localeCompare(b.id);
    const key = t => t.pinned ? t.pinOrderKey : t.activeOrderKey;
    const ak = key(a), bk = key(b);
    if (ak != null && bk != null) return compareKey(ak, bk) || a.id.localeCompare(b.id);
    if ((ak != null) !== (bk != null)) return a.pinned ? (ak != null ? -1 : 1) : (ak != null ? 1 : -1);
    const rank = t => t.pinned ? time(t.createdAt) : Math.max(time(t.createdAt), time(t.unsettledAt));
    return rank(b) - rank(a) || a.id.localeCompare(b.id);
  });
}
// Valid T3 fractional ordering keys, evenly spaced, with no trailing 'a'.
function orderKeys(count) {
  let width = 2, range = 26 ** width;
  while (range <= (count + 1) * 2) range = 26 ** ++width;
  return Array.from({ length: count }, (_, i) => {
    let value = Math.round(range / (count + 1) * (i + 1));
    if (value % 26 === 0) value++;
    let key = '';
    for (let j = 0; j < width; j++) { key = 'abcdefghijklmnopqrstuvwxyz'[value % 26] + key; value = Math.floor(value / 26); }
    return key;
  });
}
function moveAssignments(threads, id, targetId, after = false) {
  const source = threads.find(t => t.id === id), target = threads.find(t => t.id === targetId);
  if (!source || !target || source.settled || target.settled || source.pinned !== target.pinned) throw Error('Move threads within the same active or pinned section.');
  if (id === targetId) return [];
  const list = sortThreads(threads).filter(t => !t.settled && t.pinned === source.pinned && t.id !== id);
  list.splice(list.findIndex(t => t.id === targetId) + Number(after), 0, source);
  const keys = orderKeys(list.length);
  return list.flatMap((t, i) => (source.pinned ? t.pinOrderKey : t.activeOrderKey) === keys[i] ? [] : [{ threadId: t.id, orderKey: keys[i], pinned: source.pinned }]);
}
module.exports = { sortThreads, orderKeys, moveAssignments };
