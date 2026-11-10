// One name per playable game, shared by the desktop and the Steambot library.
export const GAME_TITLES = {
  snake: "Snake",
  flappy: "Drone Hop",
  dash: "Dash",
  chess: "Chess",
  blockcraft: "Voxel Valley",
  nightshift: "Uptime Till Dawn",
  tictactoe: "Tic-tac-toe",
  connect4: "Four in a Row",
  bitmerge: "Bit Merge",
  island: "Rustwater Bay",
  botcom: "Tidewatch Tactics",
  bugger: "Der Bugger 2",
  boot: "BOOT",
} as const;
export type GameKey = keyof typeof GAME_TITLES;
