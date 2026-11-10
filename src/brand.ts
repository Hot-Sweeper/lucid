// The product's public identity. Change the name here (and in electron/brand.cjs) to rename it.
export const BRAND = {
  name: "Token Industries",
  shortName: "Token",
  appId: "dev.tokenindustries.app",
} as const;

/** The robots' chat app with you, on their computers. */
export const CHAT_TITLE = `${BRAND.shortName} Chat`;
