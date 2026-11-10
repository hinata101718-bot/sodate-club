/** シード付きの乱数（mulberry32）。状態は1つの数なので、セーブに入れて再現できる */
export class Rng {
  s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number): number { return a + Math.floor(this.next() * (b - a + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  wpick<T>(items: [T, number][]): T {
    let t = 0; for (const it of items) t += Math.max(0, it[1]);
    let r = this.next() * t;
    for (const it of items) { r -= Math.max(0, it[1]); if (r <= 0) return it[0]; }
    return items[items.length - 1][0];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const sig = (x: number) => 1 / (1 + Math.exp(-x));
