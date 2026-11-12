import { describe, expect, it } from 'vitest';
import { newGame, advanceWeek } from '../src/core/game';
import * as clubfin from '../src/core/clubfin';
import { askScout } from '../src/core/market';
import { hireScout } from '../src/core/owner';
import { finWord, clubPayroll, clubPayCap, STYLES } from '../src/core/clubfin';
import { clubMin } from '../src/core/nego';
import { playerIndex } from '../src/core/market';

describe('ほかのクラブのお金（問126〜129）', () => {
  it('ほかのクラブはみんな、お金と性格を持ち、毎週お金が動く', () => {
    const G = newGame({ seed: 5 });
    const ai = G.clubs.filter((c) => !c.me);
    expect(ai.every((c) => c.fin && STYLES.includes(c.fin.style))).toBe(true);
    const before = ai.map((c) => c.fin!.money);
    for (let i = 0; i < 12; i++) advanceWeek(G);
    expect(ai.some((c, i) => c.fin!.money !== before[i])).toBe(true);
    expect(ai.every((c) => c.fin!.ledger.sponsor > 0 && c.fin!.ledger.salary > 0)).toBe(true);
    expect(ai.every((c) => ['裕福', 'ふつう', '苦しい'].includes(finWord(c)))).toBe(true);
  });
  it('給料の上限の決まりはない：収入をこえる給料でも契約できる（経理は止めない）', () => {
    expect(typeof (clubfin as Record<string, unknown>).payCapCheck).toBe('undefined');
  });
  it('ほかのクラブは、性格で決めた割合までしか給料に使わない', () => {
    const G = newGame({ seed: 7 });
    for (const c of G.clubs.filter((x) => !x.me)) expect(clubPayroll(c)).toBeLessThanOrEqual(clubPayCap(c) * 1.05);
  });
  it('お金に苦しいクラブは、安く売ってくれる', () => {
    const G = newGame({ seed: 8 });
    const c = G.clubs.find((x) => !x.me)!; const p = c.squad[0];
    const w = playerIndex(G).get(p.id)!;
    c.fin!.money = 1e7; c.fin!.debt = 0; const rich = clubMin(G, w);
    c.fin!.money = -100; c.fin!.debt = 1e9; const poor = clubMin(G, w);
    expect(poor).toBeLessThan(rich);
  });
});

describe('相手のクラブの画面（問130）', () => {
  it('調べてもらうよう頼んだ選手は、次の月にスカウトが調べてくる', () => {
    const G = newGame({ seed: 9 }); hireScout(G, G.owner.market.scout[0].id);
    const c = G.clubs.find((x) => !x.me)!; const p = c.squad[0];
    expect(askScout(G, p.id)).toBe(true);
    for (let i = 0; i < 5 && !G.owner.mk.known[p.id]?.full; i++) advanceWeek(G);
    expect(G.owner.mk.known[p.id]?.full).toBe(true);
  });
  it('自分との対戦成績と、年ごとの成績が残る', () => {
    const G = newGame({ seed: 10 });
    const S = G.season; while (G.season === S) advanceWeek(G);
    const ai = G.clubs.filter((x) => !x.me);
    expect(ai.every((c) => (c.hist ?? []).length === 1)).toBe(true);
    const n = ai.reduce((s, c) => s + (c.vs ? c.vs.w + c.vs.d + c.vs.l : 0), 0);
    expect(n).toBeGreaterThanOrEqual(22);
  });
});
