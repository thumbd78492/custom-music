/** FNV-1a over a JSON tuple avoids ambiguous seed concatenation. */
export function deriveSeed(
  rootSeed: string,
  bar: number,
  id: string,
  purpose: string,
): number {
  let hash = 2166136261;
  for (const character of JSON.stringify([rootSeed, bar, id, purpose])) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32, deterministic across JS engines. No global random state. */
export class SeededRandom {
  constructor(private value: number) {}
  next(): number {
    let value = (this.value += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  integer(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}
