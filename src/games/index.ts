// Games pack: more things the robots play when they are bored.
// Each game: play(body, host, { maxMs, skill }) => { result: "win" | "lose" | "ragequit" | "done", score? }
export type { FunHost, FunOpts, Outcome } from "../fun/host";
export { playVoxelValley } from "./voxel-valley";
export { playUptimeTillDawn } from "./uptime-till-dawn";
export { playTicTacToe } from "./tictactoe";
export { playConnectFour } from "./connect4";
export { playBitMerge } from "./merge";
export { playRustwaterBay } from "./rustwater-bay";
export { playTidewatchTactics } from "./tidewatch-tactics";
export { playDerBugger } from "./bugger";
export { playBoot } from "./boot";
