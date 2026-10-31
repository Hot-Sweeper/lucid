// Lucid games pack: more things the robots play when they are bored.
// Each game: play(body, host, { maxMs, skill }) => { result: "win" | "lose" | "ragequit" | "done", score? }
export type { FunHost, FunOpts, Outcome } from "../fun/host";
export { playBlockcraft } from "./blockcraft";
export { playNightShift } from "./nightshift";
export { playTicTacToe } from "./tictactoe";
export { playConnectFour } from "./connect4";
export { playBitMerge } from "./merge";
