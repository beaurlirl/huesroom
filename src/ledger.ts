import { settleRun, type Par, type Reward } from "./economy";

/**
 * Everything a player owns, as one small record that merges without conflicts. The device keeps it
 * as a guest; a signed-in profile keeps the same record on the server. Merging two copies (guest
 * into profile, web into app) takes the larger value per key and the union of purchases, so
 * merging twice, or in either order, never pays or charges anything twice.
 *
 * The wallet is not stored. It is worked out: what the levels have paid, plus coin packs bought,
 * minus what the owned items cost.
 */
export type LevelState = {
  /** The level's coins, paid on the first completion (0 until then). */
  coins: number;
  /** Speed-bonus coins paid so far (only ever goes up). */
  bonus: number;
};

export type Ledger = {
  v: 1;
  levels: Record<string, LevelState>;
  /** Owned items: id -> coins paid. */
  items: Record<string, number>;
  /** Coin packs bought: store transaction id -> coins. */
  iap: Record<string, number>;
  /** What Hue wears: slot -> item id. */
  equipped: Record<string, string>;
};

export const EMPTY_LEDGER: Ledger = { v: 1, levels: {}, items: {}, iap: {}, equipped: {} };

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export function walletOf(l: Ledger): number {
  const earned = Object.values(l.levels).reduce((a, s) => a + s.coins + s.bonus, 0);
  return earned + sum(l.iap) - sum(l.items);
}

/** Pays a finished run into the ledger. Returns the new ledger and what this run paid. */
export function applyRun(l: Ledger, levelId: string, time: number, levelCoins: number, par: Par): { ledger: Ledger; reward: Reward } {
  const cur = l.levels[levelId] ?? { coins: 0, bonus: 0 };
  const { reward } = settleRun({ baseBanked: cur.coins > 0, bonusPaid: cur.bonus }, time, levelCoins, par);
  const next: LevelState = { coins: cur.coins + reward.base, bonus: cur.bonus + reward.bonus };
  return { ledger: { ...l, levels: { ...l.levels, [levelId]: next } }, reward };
}

export type BuyResult = { ok: true; ledger: Ledger } | { ok: false; reason: "owned" | "short" | "unknown" };

export function buyItem(l: Ledger, item: { id: string; price: number } | undefined): BuyResult {
  if (!item) return { ok: false, reason: "unknown" };
  if (item.id in l.items) return { ok: false, reason: "owned" };
  if (walletOf(l) < item.price) return { ok: false, reason: "short" };
  return { ok: true, ledger: { ...l, items: { ...l.items, [item.id]: item.price } } };
}

/** A coin pack the store has confirmed. The transaction id makes a repeat harmless. */
export function addPack(l: Ledger, txnId: string, coins: number): Ledger {
  return txnId in l.iap ? l : { ...l, iap: { ...l.iap, [txnId]: coins } };
}

/** Wear an owned item in its slot, or take the slot off with `null`. */
export function equip(l: Ledger, slot: string, itemId: string | null): Ledger {
  if (itemId !== null && !(itemId in l.items)) return l;
  const equipped = { ...l.equipped };
  if (itemId === null) delete equipped[slot];
  else equipped[slot] = itemId;
  return { ...l, equipped };
}

/** Two copies of the same player's ledger into one. `b` wins what Hue is wearing. */
export function mergeLedgers(a: Ledger, b: Ledger): Ledger {
  const levels: Record<string, LevelState> = {};
  for (const id of new Set([...Object.keys(a.levels), ...Object.keys(b.levels)])) {
    const x = a.levels[id], y = b.levels[id];
    levels[id] = { coins: Math.max(x?.coins ?? 0, y?.coins ?? 0), bonus: Math.max(x?.bonus ?? 0, y?.bonus ?? 0) };
  }
  const items = { ...a.items, ...b.items };
  const equipped = Object.fromEntries(Object.entries({ ...a.equipped, ...b.equipped }).filter(([, id]) => id in items));
  return { v: 1, levels, items, iap: { ...a.iap, ...b.iap }, equipped };
}

/** Reads a stored ledger defensively; anything malformed is an empty one. */
export function parseLedger(raw: unknown): Ledger {
  const o = (raw ?? {}) as Partial<Ledger>;
  const nums = (r: unknown) => Object.fromEntries(Object.entries((r ?? {}) as object).filter(([, v]) => typeof v === "number" && v >= 0)) as Record<string, number>;
  const levels: Record<string, LevelState> = {};
  for (const [id, s] of Object.entries((o.levels ?? {}) as object)) {
    const st = s as Partial<LevelState>;
    if (typeof st?.coins === "number" && typeof st?.bonus === "number" && st.coins >= 0 && st.bonus >= 0) levels[id] = { coins: st.coins, bonus: st.bonus };
  }
  const equipped = Object.fromEntries(Object.entries((o.equipped ?? {}) as object).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  return { v: 1, levels, items: nums(o.items), iap: nums(o.iap), equipped };
}
