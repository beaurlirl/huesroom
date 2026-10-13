/**
 * What the closet sells. Items are data: a garment model for Hue plus an entry here. Coins buy
 * items; coin packs (in-app purchase) buy coins. The real prices live on the server too, which is
 * the one that counts for a signed-in profile.
 */
export type Slot = "top" | "bottom" | "shoes" | "hat" | "chain";

export type Item = {
  id: string;
  name: string;
  slot: Slot;
  /** Price in coins. */
  price: number;
  /** Tied to a location: the level where it is sold ("clothes tied to each location"). */
  level: string;
  /** Not for sale yet: shown only with ?debug. */
  draft?: boolean;
};

/** Empty until the first garments are modeled and rigged in Blender. */
export const ITEMS: readonly Item[] = [];

export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

/** Coin packs sold through the App Store. The ids must match the products in App Store Connect. */
export const COIN_PACKS: readonly { productId: string; coins: number }[] = [
  { productId: "hue.coins.small", coins: 100 },
  { productId: "hue.coins.medium", coins: 300 },
  { productId: "hue.coins.large", coins: 800 },
];
