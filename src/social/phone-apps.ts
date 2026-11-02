export type PhoneApp = "botsapp" | "telegrid" | "chirp" | "instabot" | "snapbot" | "shorts" | "spool" | "sparkplug";
export const PHONE_APP_LABEL: Record<PhoneApp, string> = { botsapp: "BotsApp", telegrid: "Telegrid", chirp: "Chirp", instabot: "Instabot", snapbot: "Snapbot", shorts: "BotTube Shorts", spool: "Spool", sparkplug: "Sparkplug" };
/** What the robot is up to, for the activity line. */
export const PHONE_APP_DOING: Record<PhoneApp, string> = {
  botsapp: "Texting the family on BotsApp",
  telegrid: "Reading Telegrid channels",
  chirp: "Scrolling Chirp on its phone",
  instabot: "Scrolling Instabot",
  snapbot: "Sending snaps on Snapbot",
  shorts: "Watching BotTube Shorts",
  spool: "Scrolling clips on its phone",
  sparkplug: "Swiping on Sparkplug",
};
