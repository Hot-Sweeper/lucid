// One name per playable game, shared by the desktop and the Vapor library.
export const GAME_TITLES = {
  snake: "Snake",
  flappy: "Drone Hop",
  dash: "Dash",
  chess: "Chess",
  voxelvalley: "Voxel Valley",
  uptime: "Uptime Till Dawn",
  tictactoe: "Tic-tac-toe",
  connect4: "Four in a Row",
  bitmerge: "Bit Merge",
  rustwater: "Rustwater Bay",
  tidewatch: "Tidewatch Tactics",
  bugger: "Der Bugger 2",
  boot: "BOOT",
} as const;
export type GameKey = keyof typeof GAME_TITLES;
