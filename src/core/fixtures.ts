/** 総当たり（ホーム・アウェイで年22試合） */
export function makeFixtures(n: number): [number, number][][] {
  const ids = [...Array(n).keys()]; const rounds: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) { const h = ids[i], a = ids[n - 1 - i]; pairs.push(r % 2 ? [a, h] : [h, a]); }
    rounds.push(pairs); ids.splice(1, 0, ids.pop()!);
  }
  return [...rounds, ...rounds.map((rd) => rd.map(([h, a]) => [a, h] as [number, number]))];
}
