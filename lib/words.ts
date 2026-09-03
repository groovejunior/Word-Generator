import raw from "@/data/words.json";

export type Tier = "B2" | "C1" | "C2";
export type Mode = "single" | "chain" | "distinction";

export interface WordEntry {
  word: string;
  tier: Tier;
  category: string;
  abstractness: 1 | 2 | 3;
  gap?: string;
}

export interface DistinctionPair {
  a: string;
  b: string;
  tier: Tier;
  note?: string;
}

export interface Draw {
  mode: Mode;
  /** The words to display: one for single, three for chain, two for distinction. */
  words: string[];
  /** The instruction shown under the word. */
  prompt: string;
  entries: WordEntry[];
  pair?: DistinctionPair;
}

interface RawWord {
  word: string;
  tier: string;
  category: string;
  abstractness: number;
  gap?: string;
}

const data = raw as unknown as {
  core: RawWord[];
  germanGap: Omit<RawWord, "category">[];
  distinctions: { a: string; b: string; tier: string; note?: string }[];
};

export const GERMAN_GAP_CATEGORY = "german-gap";
export const TIERS: Tier[] = ["B2", "C1", "C2"];
export const DEFAULT_TIERS: Tier[] = ["C1"];

function clampAbstractness(value: number): 1 | 2 | 3 {
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return 2;
}

function normalise(entry: RawWord): WordEntry {
  return {
    word: entry.word,
    tier: entry.tier as Tier,
    category: entry.category,
    abstractness: clampAbstractness(entry.abstractness),
    gap: entry.gap,
  };
}

export const WORDS: WordEntry[] = [
  ...data.core.map(normalise),
  ...data.germanGap.map((entry) =>
    normalise({ ...entry, category: GERMAN_GAP_CATEGORY }),
  ),
];

export const DISTINCTIONS: DistinctionPair[] = data.distinctions.map((p) => ({
  a: p.a,
  b: p.b,
  tier: p.tier as Tier,
  note: p.note,
}));

/**
 * Words that resist being talked about sustain a 60-second round; concrete ones
 * run dry in fifteen. So bias the draw toward the abstract end without ever
 * excluding the concrete words outright.
 */
const ABSTRACTNESS_WEIGHT: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 4 };

const RECENT_LIMIT = 40;
/** Below this many fresh candidates, relax recency rather than deadlock. */
const MIN_POOL = 8;

const PROMPTS: Record<Mode, string> = {
  single: "Describe it. Keep talking until the timer runs out.",
  chain: "Tell one story that connects all three.",
  distinction:
    "Explain exactly how these differ, and when you would reach for each.",
};

function weightedPick(pool: WordEntry[]): WordEntry {
  const total = pool.reduce(
    (sum, entry) => sum + ABSTRACTNESS_WEIGHT[entry.abstractness],
    0,
  );
  let threshold = Math.random() * total;
  for (const entry of pool) {
    threshold -= ABSTRACTNESS_WEIGHT[entry.abstractness];
    if (threshold <= 0) return entry;
  }
  return pool[pool.length - 1];
}

function pairKey(pair: DistinctionPair): string {
  return `${pair.a}/${pair.b}`;
}

export interface Picker {
  draw(mode: Mode, tiers: Tier[]): Draw;
}

export function createPicker(): Picker {
  let recentWords: string[] = [];
  let recentPairs: string[] = [];

  function remember(words: string[]) {
    recentWords = [...words, ...recentWords].slice(0, RECENT_LIMIT);
  }

  function eligibleWords(tiers: Tier[]): WordEntry[] {
    const inTier = WORDS.filter((entry) => tiers.includes(entry.tier));
    const pool = inTier.length > 0 ? inTier : WORDS;
    const fresh = pool.filter((entry) => !recentWords.includes(entry.word));
    return fresh.length >= MIN_POOL ? fresh : pool;
  }

  function drawSingle(tiers: Tier[]): Draw {
    const entry = weightedPick(eligibleWords(tiers));
    remember([entry.word]);
    return {
      mode: "single",
      words: [entry.word],
      prompt: PROMPTS.single,
      entries: [entry],
    };
  }

  function drawChain(tiers: Tier[]): Draw {
    const pool = eligibleWords(tiers);
    const picked: WordEntry[] = [];
    const usedCategories = new Set<string>();

    while (picked.length < 3) {
      const unused = pool.filter(
        (entry) => !picked.some((p) => p.word === entry.word),
      );
      if (unused.length === 0) break;

      // Drawing across categories makes the connection harder and funnier.
      const crossCategory = unused.filter(
        (entry) => !usedCategories.has(entry.category),
      );
      const chosen = weightedPick(
        crossCategory.length > 0 ? crossCategory : unused,
      );
      picked.push(chosen);
      usedCategories.add(chosen.category);
    }

    remember(picked.map((entry) => entry.word));
    return {
      mode: "chain",
      words: picked.map((entry) => entry.word),
      prompt: PROMPTS.chain,
      entries: picked,
    };
  }

  function drawDistinction(tiers: Tier[]): Draw {
    const inTier = DISTINCTIONS.filter((pair) => tiers.includes(pair.tier));
    const pool = inTier.length > 0 ? inTier : DISTINCTIONS;
    const fresh = pool.filter((pair) => !recentPairs.includes(pairKey(pair)));
    const candidates = fresh.length > 0 ? fresh : pool;

    const pair = candidates[Math.floor(Math.random() * candidates.length)];
    recentPairs = [pairKey(pair), ...recentPairs].slice(0, RECENT_LIMIT);

    return {
      mode: "distinction",
      words: [pair.a, pair.b],
      prompt: pair.note ?? PROMPTS.distinction,
      entries: [],
      pair,
    };
  }

  return {
    draw(mode, tiers) {
      if (mode === "chain") return drawChain(tiers);
      if (mode === "distinction") return drawDistinction(tiers);
      return drawSingle(tiers);
    },
  };
}
