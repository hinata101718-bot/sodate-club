import { describe, expect, it } from 'vitest';
import { newGame, advanceWeek } from '../src/core/game';
import { finWord, myPayCap, myPayroll, payCapCheck, clubPayroll, clubPayCap, STYLES } from '../src/core/clubfin';
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
  it('給料の合計が収入の7割をこえる契約は、経理が止める', () => {
    const G = newGame({ seed: 6 });
    expect(payCapCheck(G, 1)).toBeNull();
    const room = myPayCap(G) - myPayroll(G);
    expect(payCapCheck(G, room + 1000)).toMatch(/リーグの決まり/);
  });
  it('ほかのクラブの給料も、7割の決まりの中にある', () => {
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
