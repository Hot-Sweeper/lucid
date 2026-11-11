// The data the world is drawn from (T3 threads and projects), saved office layouts, rooms and the
// contract a utility room (break room, question line, charging room) implements.
import { Walker, type Facing, type Pt, type RobotProfile } from "../../robot";
import type { RoomTheme } from "../decorate";
import { icon } from "../../ui/icons";

export type WThread = {
  id: string; projectId: string; title: string; updatedAt: string; provider: string;
  ultra?: boolean; fast?: boolean; effort?: string;
  runStatus: string | null; pinned: boolean; settled: boolean; question: string | null; model: string | null;
  schedule?: { nextRunAt: string | null; everyMs: number | null } | null;
  folder?: string | null;
  /** A job the thread left running after its turn (electron/background-jobs.cjs), from systemd. */
  job?: { unit: string; name: string; state: "running" | "failed"; since?: string | null; reason?: string; result?: string; progress?: string } | null;
  branch?: string | null; lastStatus?: string | null; runStartedAt?: string | null; unseen?: boolean;
  coinPending?: boolean;
  completionPending?: boolean;
  /** A journey of a worker that is not (any more) this thread's own: the robot to draw. */
  robot?: RobotProfile | null;
};
export type WProject = { id: string; title: string; root: string; icon: string | null; scratch: boolean };
export type WorldData = { nativeEnvironmentId?: string; environmentId?: string; projects: WProject[]; threads: WThread[]; models?: Record<string, string[]>; prices?: Record<string, { input: number; output: number }> };

export type OfficeLayout = {
  roomOrder: string[]; expandedRooms: string[]; collapsedRooms?: string[]; roomColumns?: Record<string, number>; hidden: string[];
  extra: Record<string, number>; homes: Record<string, string>;
  seats: Record<string, (string | null)[]>; themes: Record<string, RoomTheme>;
};
export type RoomKind = "main" | "project" | "freelance" | "break" | "queue" | "charging";
export type Room = { id: string; kind: RoomKind; title: string; icon: string | null; x: number; y: number; w: number; h: number; el: HTMLElement; threadIds: string[]; collapsed: boolean };
export type PhysicalRoomPlan = { id: string; kind: RoomKind; title: string; icon: string | null; threads: (WThread | null)[]; slots: number; w: number; h: number; collapsed: boolean;
  /** The Add a desk placeholder stands at place `slots`; the floor reserves that place. */
  ghost?: boolean };

export interface RoomExtension {
  el: HTMLElement;
  setThreads(list: { id: string; provider: string; title: string; question?: string | null }[]): void;
  onSelect: (id: string) => void;
  /** A leaving robot reached the door (room coordinates); true when the hall walker takes it from there. */
  onExit?: (id: string, at: Pt, face: Facing) => boolean;
  onDeparture?: (id: string, walker: Walker) => void;
  /** The next time this robot joins, its walker starts at this point (room coordinates), where the hall walker stopped. */
  enterFrom?(id: string, at: Pt): void;
  destroy(): void;
}
