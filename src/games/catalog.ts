// One name per playable game, shared by the desktop and the Steambot library.
export const GAME_TITLES = {
  snake: "Snake",
  flappy: "Flappy Drone",
  dash: "Dash",
  chess: "Chess",
  blockcraft: "Blockcraft",
  nightshift: "Five Nights at the Server Room",
  tictactoe: "Tic-tac-toe",
  connect4: "Four in a Row",
  bitmerge: "Bit Merge",
  island: "The Secret of Robot Island",
  botcom: "BOT-COM: Terror from the Deep Sea",
  bugger: "Der Bugger 2",
  boot: "BOOT",
} as const;
export type GameKey = keyof typeof GAME_TITLES;
