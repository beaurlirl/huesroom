/**
 * The game's name, in one place. The page title and link previews, the legal pages, the title card, the menus, the loading mark and the share card all read it,
 * so renaming the game is this line. Not renamed with it, on purpose: the `huesroom.*` storage keys (best times, coins, "seen"), so players keep their progress.
 * Also by hand: `ios/App/App/capacitor.config.json` (appName), the App Store listing, and the picture `public/og.jpg` if it has the name drawn on it.
 */
export const GAME_NAME = "Hue Leaves Home";

/** The name as the UI writes it: lowercase, like the rest of its text. */
export const WORDMARK = GAME_NAME.toLowerCase();

/** The name as a file name: the share card's picture is saved as `<this>.png`. */
export const FILE_SLUG = GAME_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
