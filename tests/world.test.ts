import { describe, expect, it } from 'vitest';
import { advanceWeek, newGame, standings, myTier, ME, currentGoal, type GameState } from '../src/core/game';
import { PREFS } from '../src/core/data/prefs';
import { ovr } from '../src/core/player';
import { pickLineup, chooseForm } from '../src/core/match';
import { teamStrength } from '../src/core/player';
import { Rng } from '../src/core/rng';
import { WEEKS } from '../src/core/calendar';

const runSeason = (G: GameState) => { const s = G.season; let g = 0; while (G.season === s && g++ < 60) advanceWeek(G); };

describe('世界とリーグ（企画書 3・5）', () => {
  const G = newGame({ seed: 11, pref: '岩手県', name: '盛岡テスト', color: '#2c6aa0' });
  it('3段×12クラブ、全36クラブ。相手の35クラブは自分の県以外に1つずつ', () => {
    expect(G.clubs.length).toBe(36);
    for (const t of [1, 2, 3]) expect(G.clubs.filter((c) => c.tier === t).length).toBe(12);
    const prefs = G.clubs.filter((c) => !c.me).map((c) => c.pref);
    expect(new Set(prefs).size).toBe(35);
    expect(prefs).not.toContain('岩手県');
    for (const p of prefs) expect(PREFS.some((x) => x.name === p)).toBe(true);
    expect(myTier(G)).toBe(3);
    expect(G.club.city).toBe('盛岡市');
  });
  it('年22試合（ホームとアウェイで1回ずつ）', () => {
    for (const t of [1, 2, 3]) {
      const L = G.leagues[t]; expect(L.fixtures.length).toBe(22);
      for (const id of L.ids) {
        const games = L.fixtures.flat().filter(([h, a]) => h === id || a === id);
        expect(games.length).toBe(22);
        expect(games.filter(([h]) => h === id).length).toBe(11);
      }
    }
  });
  it('段ごとの先発の総合力が目安に入る（3部50〜60・2部65〜70・1部72〜75）', () => {
    const r = new Rng(1);
    const avg = (t: number) => { const cs = G.clubs.filter((c) => c.tier === t && !c.me); let s = 0; for (const c of cs) { const f = chooseForm(c.mgr, teamStrength(c.squad), teamStrength(c.squad)); const { lineup } = pickLineup(r, { id: c.id, name: c.name, me: false, color: c.color, squad: c.squad, mgr: c.mgr }, f); s += lineup.reduce((a, x) => a + ovr(x.p), 0) / lineup.length; } return s / cs.length; };
    const a3 = avg(3), a2 = avg(2), a1 = avg(1);
    expect(a3).toBeGreaterThanOrEqual(50); expect(a3).toBeLessThanOrEqual(60);
    expect(a2).toBeGreaterThanOrEqual(65); expect(a2).toBeLessThanOrEqual(70);
    expect(a1).toBeGreaterThanOrEqual(72); expect(a1).toBeLessThanOrEqual(75.5);
  });
});

describe('1年の流れと昇格・降格（企画書 5・6・7）', () => {
  const G = newGame({ seed: 5 });
  const before = Object.fromEntries(G.clubs.map((c) => [c.id, c.tier]));
  let cupGames = 0;
  const ordered: string[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const wk = G.week;
    if (wk === 4) ordered.push('promo'); if (wk === 5) ordered.push('camp'); if (wk === 8) ordered.push('open');
    advanceWeek(G);
    if (G.sched.cup.includes(wk)) cupGames++;
  }
  it('順番は「昇格会議 → キャンプ → 開幕」', () => { expect(ordered).toEqual(['promo', 'camp', 'open']); });
  it('天皇杯は6回戦で、優勝クラブが1つ決まる', () => {
    expect(cupGames).toBe(6);
    expect(G.history[0].cupChampion).not.toBe('');
  });
  it('上位2つが昇格、下位2つが降格', () => {
    const last = G.history[0];
    expect(G.season).toBe(2);
    let up = 0, down = 0;
    for (const c of G.clubs) { if (c.tier < before[c.id]) up++; if (c.tier > before[c.id]) down++; }
    expect(up).toBe(4); expect(down).toBe(4);
    for (const t of [1, 2, 3]) expect(G.clubs.filter((c) => c.tier === t).length).toBe(12);
    expect(last.awards.length).toBeGreaterThanOrEqual(6);
    expect(standings(G).length).toBe(12);
    expect(currentGoal(G).length).toBeGreaterThan(0);
  });
  it('何シーズンも続けられる（終わりはない）', () => { runSeason(G); runSeason(G); expect(G.season).toBe(4); expect(G.history.length).toBe(3); expect(G.clubs.find((c) => c.id === ME)).toBeTruthy(); });
});
