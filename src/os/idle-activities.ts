import { lazyActivity } from "./lazy-activity";

// Keep optional apps out of the office's startup dependency graph. Their original
// modules and styles load together, while the robot opens the app's window.
export const playSnake = lazyActivity(() => import("../fun/games/snake").then(m => m.playSnake));
export const playFlappy = lazyActivity(() => import("../fun/games/flappy").then(m => m.playFlappy));
export const playDash = lazyActivity(() => import("../fun/games/dash").then(m => m.playDash));
export const playBlockcraft = lazyActivity(() => import("../games/blockcraft").then(m => m.playBlockcraft));
export const playNightShift = lazyActivity(() => import("../games/nightshift").then(m => m.playNightShift));
export const playTicTacToe = lazyActivity(() => import("../games/tictactoe").then(m => m.playTicTacToe));
export const playConnectFour = lazyActivity(() => import("../games/connect4").then(m => m.playConnectFour));
export const playBitMerge = lazyActivity(() => import("../games/merge").then(m => m.playBitMerge));
export const playRobotIsland = lazyActivity(() => import("../games/island").then(m => m.playRobotIsland));
export const playBotCom = lazyActivity(() => import("../games/botcom").then(m => m.playBotCom));
export const playDerBugger = lazyActivity(() => import("../games/bugger").then(m => m.playDerBugger));
export const playBoot = lazyActivity(() => import("../games/boot").then(m => m.playBoot));
export const watchBotflix = lazyActivity(() => import("../fun/botflix").then(m => m.watchBotflix));
export const watchTube = lazyActivity(() => import("../fun/tube").then(m => m.watchTube));
export const browseBenchtop = lazyActivity(() => import("../fun/benchtop").then(m => m.browseBenchtop));
export const makeBeat = lazyActivity(() => import("../life/beats").then(m => m.makeBeat));
export const hangOutInChat = lazyActivity(() => import("../life/chat").then(m => m.hangOutInChat));
export const usePhone = lazyActivity(() => import("../social/phonetime").then(m => m.usePhone));
export const chatOnBotsApp = lazyActivity(() => import("../social/botsapp").then(m => m.chatOnBotsApp));
export const browseTelegrid = lazyActivity(() => import("../social/telegrid").then(m => m.browseTelegrid));
export const scrollChirp = lazyActivity(() => import("../social/chirp").then(m => m.scrollChirp));
export const doodleInSketchpad = lazyActivity(() => import("../social/doodle").then(m => m.doodleInSketchpad));
export const solveCrossword = lazyActivity(() => import("../social/crossword").then(m => m.solveCrossword));
export const playSolitaire = lazyActivity(() => import("../social/solitaire").then(m => m.playSolitaire));
export const watchStocks = lazyActivity(() => import("../social/stocks").then(m => m.watchStocks));
export const checkMail = lazyActivity(() => import("../social/mail").then(m => m.checkMail));
export const learnWithLingobot = lazyActivity(() => import("../social/lingo").then(m => m.learnWithLingobot));
export const browseInstaweb = lazyActivity(() => import("../social/instaweb").then(m => m.browseInstaweb));
export const scrollSpoolWeb = lazyActivity(() => import("../social/spoolweb").then(m => m.scrollSpoolWeb));
export const swipeSparkplug = lazyActivity(() => import("../social/sparkplug").then(m => m.swipeSparkplug));
export const useVapor = lazyActivity(() => import("../leisure/vapor").then(m => m.useVapor));
export const tradeOnBotcoinExchange = lazyActivity(() => import("../leisure/trading").then(m => m.tradeOnBotcoinExchange));

const activities = {
  snake: playSnake, flappy: playFlappy, dash: playDash, blockcraft: playBlockcraft,
  nightshift: playNightShift, tictactoe: playTicTacToe, connect4: playConnectFour,
  bitmerge: playBitMerge, island: playRobotIsland, botcom: playBotCom, bugger: playDerBugger,
  boot: playBoot, botflix: watchBotflix, tube: watchTube, benchtop: browseBenchtop,
  beats: makeBeat, social: hangOutInChat, phone: usePhone, botsapp: chatOnBotsApp,
  telegrid: browseTelegrid, chirp: scrollChirp, doodle: doodleInSketchpad,
  crossword: solveCrossword, solitaire: playSolitaire, stocks: watchStocks, mail: checkMail,
  lingo: learnWithLingobot, instaweb: browseInstaweb, spoolweb: scrollSpoolWeb,
  sparkplug: swipeSparkplug, vapor: useVapor, trading: tradeOnBotcoinExchange,
};
export function preloadActivity(name: string) {
  // A failed speculative load is retried by the actual activity, where its owner
  // already handles failures and cancellation. Do not create unhandled rejections.
  const activity = activities[name as keyof typeof activities];
  if (activity) void activity.preload().catch(() => {});
}
