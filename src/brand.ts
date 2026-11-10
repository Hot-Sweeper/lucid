// The product's public identity. To rename the app, edit electron/brand.json only.
import brand from "../electron/brand.json";

export const BRAND = brand as { readonly name: string; readonly shortName: string; readonly appId: string };

/** The robots' chat app with you, on their computers. */
export const CHAT_TITLE = `${BRAND.shortName} Chat`;
