import type { Room, WThread } from './world';

/** A phone starts at real work at a readable room scale. The complete grounds
 * remain reachable with the existing overview action and pinch gestures. */
export function mobileStartRoom(rooms: Pick<Room, 'id' | 'kind' | 'threadIds'>[], threads: Pick<WThread, 'id' | 'runStatus' | 'question' | 'settled'>[], project?: string | null) {
  if (project) {
    const requested = rooms.find(room => room.id === `p:${project}`);
    if (requested) return requested.id;
  }
  for (const thread of threads.filter(t => !t.settled && (t.runStatus === 'running' || t.question))) {
    const room = rooms.find(room => room.threadIds.includes(thread.id));
    if (room) return room.id;
  }
  return rooms.find(room => room.kind === 'main')?.id ?? rooms.find(room => room.kind === 'project')?.id ?? null;
}
