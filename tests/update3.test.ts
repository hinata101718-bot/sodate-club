import { describe, expect, it } from 'vitest';
import { newGame, advanceWeek, type GameState } from '../src/core/game';
import { seasonSchedule, BREAK_WEEKS } from '../src/core/calendar';
import { regd, REG_SIZE, matchSquad, applyReg } from '../src/core/squad';
import { startNego, negoTurn, isBlocked, type Nego } from '../src/core/nego';
import { playerIndex } from '../src/core/market';
import { goalOptions } from '../src/core/meeting';
import { Rng } from '../src/core/rng';

const toWeek = (G: GameState, w: number) => { let g = 0; while (G.week !== w && g++ < 100) advanceWeek(G); };

describe('アップデート3', () => {
  it('試合の数字：評価点は10点満点・0.1きざみで、MOMがいる', () => {
    const G = newGame({ seed: 3 }); let m = null; let g = 0;
    while (!m && g++ < 30) m = advanceWeek(G).match;
    expect(m).toBeTruthy();
    for (const p of m!.played) { expect(p.rt).toBeGreaterThanOrEqual(3); expect(p.rt).toBeLessThanOrEqual(10); expect(Math.round(p.rt! * 10)).toBeCloseTo(p.rt! * 10, 5); expect(p.st!.pa).toBeGreaterThanOrEqual(p.st!.pc); }
    expect(m!.mom).toBeTruthy();
  });
  it('夏の中断期間にはリーグ戦がない', () => {
    const s = seasonSchedule(); expect(s.league.length).toBe(22);
    for (const w of BREAK_WEEKS) expect(s.league.includes(w)).toBe(false);
  });
  it('選手登録：会議は開幕前に開き、試合に出られるのは登録した23人まで', () => {
    const G = newGame({ seed: 4 });
    toWeek(G, 7); expect(G.regm?.open).toBe(true);
    applyReg(G, G.regm!.sel);
    expect(regd(G).length).toBeLessThanOrEqual(REG_SIZE);
    expect(matchSquad(G).every((p) => p.reg)).toBe(true);
  });
  it('目標は3つで、むずかしいほど順位が高い', () => {
    const G = newGame({ seed: 5 }); const o = goalOptions(G, 3, 1);
    expect(o.length).toBe(3); expect(o[0].rank).toBeLessThan(o[1].rank); expect(o[1].rank).toBeLessThan(o[2].rank);
  });
  it('交渉：安すぎると打ち切られ、その期間はもう申し込めない。じゅうぶんな条件ならまとまる', () => {
    const G = newGame({ seed: 6 }); toWeek(G, 24); G.owner.money = 1e6;
    const idx = playerIndex(G);
    const pros = [...idx.values()].filter((w) => w.kind === 'pro' && w.club!.tier === 3);
    const a = pros[0], b = pros[5];
    G.owner.mk.known[a.p.id] = { pid: a.p.id, full: true, season: 1, week: 24, src: 'scout', ovr: 50, age: a.p.age, club: a.club!.name } as never;
    G.owner.mk.known[b.p.id] = { pid: b.p.id, full: true, season: 1, week: 24, src: 'scout', ovr: 50, age: b.p.age, club: b.club!.name } as never;
    const r = new Rng(1);
    const n1 = startNego(G, a.p.id) as Nego; n1.fee = 100; negoTurn(G, n1, r);
    expect(n1.end).toBe('fail'); expect(isBlocked(G, a.p.id)).toBe(true);
    const n2 = startNego(G, b.p.id) as Nego; n2.fee = n2.fee * 3; negoTurn(G, n2, r);
    expect(n2.side).toBe('player'); n2.salary = n2.salary * 3; n2.years = 3; negoTurn(G, n2, r);
    expect(n2.end).toBe('ok'); expect(G.squad.some((p) => p.id === b.p.id)).toBe(true);
  });
});
