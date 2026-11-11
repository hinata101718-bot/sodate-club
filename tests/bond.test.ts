import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { newGame, advanceWeek, teamIn, clubById, ME, SAVE_VERSION } from '../src/core/game';
import { pickLineup, simulateMatch } from '../src/core/match';
import { setOrder, compat, tacticFit, monthBond, answerWantOut, youthBonus, obeyChance, ORDER_LIMIT, loveOf } from '../src/core/bond';
import { ovr } from '../src/core/player';
import { Rng } from '../src/core/rng';
import { AUTO_KEY, loadFrom, memoryKV } from '../src/core/save';

const best = (G: ReturnType<typeof newGame>) => [...G.squad].sort((a, b) => ovr(b) - ovr(a));

describe('オーナーから監督への頼み（問93）', () => {
  it('素直な監督は「使わないで」を聞き、その選手は先発にもベンチにも入らない', () => {
    const G = newGame({ seed: 61 }); G.mgr.obey = 1;
    const star = best(G)[0]; expect(setOrder(G, star.id, { kind: 'bench' })).toBeNull();
    const { lineup, bench } = pickLineup(new Rng(1), teamIn(G, clubById(G, ME)), G.mgr.forms[0]);
    expect(lineup.some((x) => x.p.id === star.id)).toBe(false);
    expect(bench.some((p) => p.id === star.id)).toBe(false);
  });
  it('「途中からでも」を聞くと、先発ではなく交代で出る', () => {
    const G = newGame({ seed: 62 }); G.mgr.obey = 1;
    const kid = [...G.squad].filter((p) => p.pos !== 'GK').sort((a, b) => ovr(a) - ovr(b))[0];
    setOrder(G, kid.id, { kind: 'sub' });
    let subIn = 0;
    for (let i = 0; i < 6; i++) {
      const res = simulateMatch(new Rng(10 + i), teamIn(G, clubById(G, ME)), teamIn(G, G.clubs.find((c) => !c.me)!), {});
      const me = res.view.played.find((x) => x.id === kid.id);
      if (me) { expect(me.sub).toBe(true); subIn++; }
    }
    expect(subIn).toBeGreaterThan(3);
  });
  it('「このポジションで」を聞くと、そのポジションで使う', () => {
    const G = newGame({ seed: 63 }); G.mgr.obey = 1;
    const cb = best(G).find((p) => p.pos === 'CB')!; setOrder(G, cb.id, { kind: 'pos', pos: 'SB' });
    const { lineup } = pickLineup(new Rng(2), teamIn(G, clubById(G, ME)), '4-3-3');
    expect(lineup.find((x) => x.p.id === cb.id)?.pos).toBe('SB');
  });
  it('頼みは5人まで。多いほど聞いてもらいにくい', () => {
    const G = newGame({ seed: 64 });
    for (const p of G.squad.slice(0, ORDER_LIMIT)) expect(setOrder(G, p.id, { kind: 'start' })).toBeNull();
    expect(setOrder(G, G.squad[ORDER_LIMIT].id, { kind: 'start' })).not.toBeNull();
    expect(obeyChance(0.8, 5)).toBeLessThan(obeyChance(0.8, 3));
  });
});

describe('監督の見方と選手の気持ち（問94・問95）', () => {
  it('若手のおまけは年齢で少しずつ減り、24歳で0になる', () => {
    expect(youthBonus(19, 2)).toBeGreaterThan(youthBonus(21, 2));
    expect(youthBonus(21, 2)).toBeGreaterThan(youthBonus(22, 2));
    expect(youthBonus(22, 2)).toBeGreaterThan(0);
    expect(youthBonus(24, 2)).toBe(0);
  });
  it('相性は選手と監督の組み合わせで決まり、戦術に合うかは能力で決まる', () => {
    const G = newGame({ seed: 65 });
    const vals = G.squad.map((p) => compat(p, G.mgr));
    expect(new Set(vals).size).toBeGreaterThan(1);
    expect(compat(G.squad[0], G.mgr)).toBe(compat(G.squad[0], G.mgr));
    const p = { ...G.squad.find((x) => x.pos !== 'GK')! }; p.a = [...p.a]; p.a[0] += 20;
    expect(tacticFit(p, 'ロングカウンター')).toBe(1);
  });
  it('主力のつもりの選手が出られないと不満がたまり、「移籍したい」と言ってくる', () => {
    const G = newGame({ seed: 66 });
    const p = best(G)[1]; setOrder(G, p.id, { kind: 'bench' }); G.mgr.obey = 1; p.ord = undefined;
    p.unrest = 80;
    const news = monthBond(G);
    expect(news.join('')).toContain(p.name);
    expect(p.wantOut).toBe(true);
    const msg = answerWantOut(G, p.id, true, 0.5);
    expect(p.listed).toBe(true); expect(msg).toContain('売りに出した');
  });
  it('試合に出ると信頼が上がる。シーズンをこすと愛着が育つ', () => {
    const G = newGame({ seed: 67 });
    let g = 0; while (G.week < 20 && g++ < 40) advanceWeek(G);
    const regular = G.squad.filter((p) => p.seasonApps >= 5);
    expect(regular.some((p) => (p.trust ?? 50) > 50)).toBe(true);
    const before = new Map(G.squad.map((p) => [p.id, loveOf(p)]));
    g = 0; while (G.season < 2 && g++ < 60) advanceWeek(G);
    const grown = G.squad.filter((p) => before.has(p.id) && loveOf(p) > before.get(p.id)!);
    expect(grown.length).toBeGreaterThan(G.squad.length / 2);
  });
  it('古いセーブ（版4）も版6になり、「使ってほしい」は「先発で」に変わる', () => {
    const kv = memoryKV(); const raw = JSON.parse(readFileSync(__dirname + '/fixtures/save-v4.json', 'utf8'));
    raw.state.squad[0].req = true; kv.setItem(AUTO_KEY, JSON.stringify(raw));
    const G = loadFrom(kv, AUTO_KEY)!;
    expect(G.version).toBe(SAVE_VERSION); expect(SAVE_VERSION).toBe(6);
    expect(G.squad[0].ord?.kind).toBe('start');
    expect(G.squad.every((p) => typeof p.love === 'number' && typeof p.trust === 'number')).toBe(true);
  });
});
