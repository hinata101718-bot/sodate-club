import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { newGame, advanceWeek, advanceToDecision, SAVE_VERSION, type GameState } from '../src/core/game';
import { marketValue, sellChance, joinChance, bid, isStarter, playerIndex, scoutMonth, isStale, toggleShort, inShort, shortList, type ScoutCond } from '../src/core/market';
import { makePlayer, ovr } from '../src/core/player';
import { TIER_LVL } from '../src/core/world';
import { Rng } from '../src/core/rng';
import { AUTO_KEY, loadFrom, memoryKV, saveTo, slotKey } from '../src/core/save';

const toWeek = (G: GameState, w: number, s: number) => { let g = 0; while (!(G.week === w && G.season === s) && g++ < 400) advanceWeek(G); };
const cond = (c: Partial<ScoutCond>): ScoutCond => ({ pos: [], region: null, vmin: null, vmax: null, amin: null, amax: null, ...c });

describe('移籍市場の相場', () => {
  it('能力が高いほど、若いほど高い。契約が残り1年だと安い。上の段ほど高い', () => {
    const r = new Rng(5); const ids = { n: 1 };
    const p = makePlayer(r, ids, 66, 'CM', { age: 25 }); p.contract = 3;
    const base = marketValue(p, 2);
    const strong = { ...p, a: p.a.map((v) => v + 8) };
    expect(marketValue(strong, 2)).toBeGreaterThan(base);
    expect(marketValue({ ...p, age: 20 }, 2)).toBeGreaterThan(base);
    expect(marketValue({ ...p, age: 31 }, 2)).toBeLessThan(base);
    expect(marketValue({ ...p, contract: 1 }, 2)).toBeLessThan(base);
    expect(marketValue(p, 1)).toBeGreaterThan(base);
    expect(marketValue(p, null)).toBe(0);
  });
});

describe('売る・来る', () => {
  it('主力（先発の上位）は売られにくく、控えは売られやすい', () => {
    const G = newGame({ seed: 51 });
    const c = G.clubs.find((x) => !x.me && x.tier === 2)!;
    const sorted = [...c.squad].sort((a, b) => ovr(b) - ovr(a));
    const star = sorted[0]; star.contract = 3;
    const bench = sorted.find((p) => !isStarter(c, p) && sorted.indexOf(p) >= 16)!; bench.contract = 3;
    expect(sellChance(c, star)).toBeLessThan(0.1);
    expect(sellChance(c, bench)).toBeGreaterThan(0.6);
    bench.contract = 1; expect(sellChance(c, bench)).toBeGreaterThan(0.9);
  });
  it('上の段の選手ほど、下の段のクラブには来にくい。給料を上乗せすると来やすくなる', () => {
    expect(joinChance(1, 3, 0)).toBeLessThan(joinChance(2, 3, 0));
    expect(joinChance(2, 3, 0)).toBeLessThan(joinChance(3, 3, 0));
    expect(joinChance(1, 3, 50)).toBeGreaterThan(joinChance(1, 3, 0));
    expect(joinChance(1, 3, 20)).toBeGreaterThan(joinChance(1, 3, 0));
  });
});

describe('知っている選手', () => {
  it('知らない選手には申し込めない', () => {
    const G = newGame({ seed: 52 }); toWeek(G, 24, 1); G.owner.money = 1e7;
    const c = G.clubs.find((x) => !x.me)!; const p = c.squad[0];
    delete G.owner.mk.known[p.id];
    expect(bid(G, p.id, 0, new Rng(1))).not.toBeNull();
    expect(G.owner.mk.bids.length).toBe(0);
  });
  it('スカウトは条件に合う選手だけを調べてくる。合う選手がいないと知らせる', () => {
    const G = newGame({ seed: 53 });
    G.owner.scouts[0].cond = cond({ pos: ['CB'], vmin: 1000, amin: 24, amax: 30 });
    const r = new Rng(9); scoutMonth(G, r);
    const idx = playerIndex(G);
    const got = Object.values(G.owner.mk.known).filter((k) => k.src === 'scout');
    expect(got.length).toBeGreaterThan(0);
    for (const k of got) { const w = idx.get(k.pid)!; expect(w.p.pos).toBe('CB'); expect(w.p.age).toBeGreaterThanOrEqual(24); expect(w.p.age).toBeLessThanOrEqual(30); expect(w.kind).toBe('pro'); }
    G.owner.scouts[0].cond = cond({ vmin: 999999 });
    expect(scoutMonth(G, r).join('')).toContain('見つからなかった');
  });
  it('対戦した相手の先発は、だいたいの強さだけわかる。情報は1シーズンで古くなる', () => {
    const G = newGame({ seed: 54 });
    toWeek(G, 12, 1);
    const seen = Object.values(G.owner.mk.known).filter((k) => k.src === 'match');
    expect(seen.length).toBeGreaterThanOrEqual(11);
    expect(seen.every((k) => !k.full && !k.a)).toBe(true);
    const k = seen[0]; k.season = 0; expect(isStale(G, k)).toBe(true);
  });
  it('移籍の期間に申し込むと、次の週に結果が届き、「次に決めることまで進む」が止まる', () => {
    const G = newGame({ seed: 55 }); toWeek(G, 24, 1); G.owner.money = 1e7;
    G.squad = G.squad.slice(0, 20);
    const c = G.clubs.find((x) => !x.me && x.tier === 3)!;
    const p = [...c.squad].sort((a, b) => ovr(a) - ovr(b))[0]; p.contract = 1;
    G.owner.mk.known[p.id] = { pid: p.id, full: true, season: G.season, week: G.week, src: 'scout', ovr: ovr(p), age: p.age, club: c.name };
    G.pending = [];
    expect(bid(G, p.id, 50, new Rng(1))).toBeNull();
    const res = advanceToDecision(G, 8);
    expect(res.weeks).toBe(1);
    expect(res.news.some((l) => l.startsWith('移籍の結果'))).toBe(true);
  });
  it('他のクラブ同士の移籍があっても、段ごとの強さの目安がくずれない', () => {
    const G = newGame({ seed: 56 });
    toWeek(G, 0, 3);
    for (const t of [1, 2, 3]) {
      const cs = G.clubs.filter((c) => !c.me && c.tier === t);
      const xi = cs.map((c) => [...c.squad].sort((a, b) => ovr(b) - ovr(a)).slice(0, 11).reduce((s, p) => s + ovr(p), 0) / 11);
      const avg = xi.reduce((s, x) => s + x, 0) / xi.length;
      expect(Math.abs(avg - TIER_LVL[t])).toBeLessThan(5);
    }
    expect(G.owner.mk.free.length).toBeGreaterThan(0);
  });
});

describe('版4（夜1）のセーブの変換', () => {
  it('ほしい選手の希望がスカウトの条件に、候補が知っている選手になり、そのまま続けて遊べる', () => {
    const kv = memoryKV(); kv.setItem(AUTO_KEY, readFileSync(__dirname + '/fixtures/save-v4.json', 'utf8'));
    const raw = JSON.parse(kv.getItem(AUTO_KEY)!);
    expect(raw.state.version).toBe(4);
    const G = loadFrom(kv, AUTO_KEY)!;
    expect(G.version).toBe(SAVE_VERSION);
    expect(G.week).toBe(raw.state.week);
    expect(G.squad.length).toBe(raw.state.squad.length);
    expect(G.owner.money).toBe(raw.state.owner.money);
    expect(G.owner.scouts.every((s) => s.cond!.pos.join() === 'ST' && s.cond!.amax === 20)).toBe(true);
    expect((G.owner as any).wish).toBeUndefined();
    expect(Object.keys(G.owner.mk.known).length).toBe(raw.state.owner.cands.filter((c: any) => c.src !== 'trial').length);
    expect(G.owner.cands.every((c) => c.src === 'trial')).toBe(true);
    for (let i = 0; i < 40; i++) advanceWeek(G);
    expect(G.season).toBe(2);
    expect(saveTo(kv, slotKey(3), G)).toBe(true);
    expect(loadFrom(kv, slotKey(3))!.season).toBe(2);
  });
});

describe('候補リスト（感想24）', () => {
  it('知っている選手だけ入れられ、獲れたらリストから消える。古いセーブにリストがなくても動く', () => {
    const G = newGame({ seed: 57 }); toWeek(G, 24, 1); G.owner.money = 1e7; G.squad = G.squad.slice(0, 20);
    delete (G.owner.mk as any).short;
    const c = G.clubs.find((x) => !x.me && x.tier === 3)!; const p = [...c.squad].sort((a, b) => ovr(a) - ovr(b))[0];
    expect(toggleShort(G, p.id)).toBe(false);
    G.owner.mk.known[p.id] = { pid: p.id, full: true, season: G.season, week: G.week, src: 'scout', ovr: ovr(p), age: p.age, club: c.name };
    expect(toggleShort(G, p.id)).toBe(true); expect(inShort(G, p.id)).toBe(true);
    p.contract = 1; G.pending = [];
    for (let i = 0; i < 5 && inShort(G, p.id); i++) { if (!G.owner.mk.bids.length) bid(G, p.id, 50, new Rng(i)); advanceWeek(G); }
    if (G.squad.some((x) => x.id === p.id)) expect(shortList(G).includes(p.id)).toBe(false);
  });
});
