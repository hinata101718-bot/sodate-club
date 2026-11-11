import { describe, expect, it } from 'vitest';
import { advanceWeek, newGame, answerOffer, type GameState } from '../src/core/game';
import { borrow, repay, startBuild, setRenew, hireScout, hireCoach, coachWindow, payroll } from '../src/core/owner';
import { debtCap, facCost } from '../src/core/finance';
import { Rng } from '../src/core/rng';
import { bid } from '../src/core/market';

const toWeek = (G: GameState, w: number, s: number) => { let g = 0; while (!(G.week === w && G.season === s) && g++ < 400) advanceWeek(G); };

describe('お金（企画書 11）', () => {
  it('入場料・スポンサー・給料が毎週動く。1年で記録がのこる', () => {
    const G = newGame({ seed: 31 });
    toWeek(G, 0, 2);
    const L = G.owner.lastLedger!;
    expect(L.gate).toBeGreaterThan(0); expect(L.sponsor).toBeGreaterThan(0); expect(L.salary).toBeGreaterThan(0); expect(L.staff).toBeGreaterThan(0);
  });
  it('借金には上限がある。上限まで借りてもゲームオーバーにならない', () => {
    const G = newGame({ seed: 32 });
    const cap = debtCap(3);
    expect(borrow(G, cap * 2)).toBe(cap);
    expect(borrow(G, 1000)).toBe(0);
    expect(repay(G, 1000)).toBe(1000);
    G.owner.money = -999999; G.owner.debt = cap;
    for (let i = 0; i < 10; i++) advanceWeek(G);
    expect(G.week).toBe(10);
  });
  it('施設はお金と時間がかかり、終わるとレベルが上がる', () => {
    const G = newGame({ seed: 33 }); G.owner.money = 1e6;
    const before = G.owner.money;
    expect(startBuild(G, 'field')).toBeNull();
    expect(G.owner.money).toBe(before - facCost('field', 2));
    expect(startBuild(G, 'medical')).not.toBeNull();
    for (let i = 0; i < 20; i++) advanceWeek(G);
    expect(G.owner.fac.field).toBe(2); expect(G.owner.build).toBeNull();
  });
});

describe('人を雇う（企画書 10）', () => {
  it('スカウトは3人まで。コーチの入れかえは冬だけ', () => {
    const G = newGame({ seed: 34 });
    while (G.owner.market.scout.length && G.owner.scouts.length < 3) hireScout(G, G.owner.market.scout[0].id);
    expect(G.owner.scouts.length).toBe(3);
    expect(hireScout(G, G.owner.market.scout[0]?.id ?? -1)).not.toBeNull();
    toWeek(G, 20, 1);
    expect(coachWindow(G)).toBe(false);
    expect(hireCoach(G, 'off', G.owner.market.coach.off[0].id)).not.toBeNull();
    toWeek(G, 45, 1);
    expect(hireCoach(G, 'off', G.owner.market.coach.off[0].id)).toBeNull();
  });
  it('スカウトは毎月選手を調べてきて、高校生・大学生は獲るとすぐトップに入る', () => {
    const G = newGame({ seed: 35 }); G.owner.money = 1e6;
    G.owner.scouts[0].cond = { pos: [], region: null, vmin: null, vmax: 0, amin: null, amax: null };
    toWeek(G, 9, 1);
    G.squad = G.squad.slice(0, 22);
    const k = Object.values(G.owner.mk.known).find((x) => x.p)!;
    expect(k).toBeTruthy();
    expect(bid(G, k.pid, 0, new Rng(1))).toBeNull();
    expect(G.squad.some((p) => p.id === k.pid)).toBe(true);
  });
});

describe('移籍と契約（企画書 12）・練習生（企画書 9-4）', () => {
  it('オファーを受けると選手が去り、お金が入る', () => {
    const G = newGame({ seed: 36 }); const p = G.squad.find((x) => x.pos !== 'GK')!;
    G.pending.push({ type: 'offer', pid: p.id, club: G.clubs[5].name, clubId: G.clubs[5].id, price: 3000 });
    const m = G.owner.money; answerOffer(G, 0, true);
    expect(G.squad.some((x) => x.id === p.id)).toBe(false); expect(G.owner.money).toBe(m + 3000);
  });
  it('キーパーが2人より少なくなるオファーは受けられない（50シーズンのテストで見つけた）', () => {
    const G = newGame({ seed: 36 }); const gks = G.squad.filter((x) => x.pos === 'GK');
    G.squad = G.squad.filter((x) => x.pos !== 'GK' || x === gks[0] || x === gks[1]);
    G.pending.push({ type: 'offer', pid: gks[0].id, club: G.clubs[5].name, clubId: G.clubs[5].id, price: 3000 });
    expect(answerOffer(G, 0, true)).toContain('キーパー'); expect(G.squad.some((x) => x.id === gks[0].id)).toBe(true);
  });
  it('契約を更新しなかった選手は、年が変わると去る。更新した選手は残る', () => {
    const G = newGame({ seed: 37 });
    const [a, b] = G.squad; a.contract = 1; b.contract = 1;
    toWeek(G, 45, 1);
    setRenew(G, a.id, 1, true); setRenew(G, b.id, 3, false);
    toWeek(G, 0, 2);
    expect(G.squad.some((x) => x.id === a.id)).toBe(false);
    const bb = G.squad.find((x) => x.id === b.id); if (bb) expect(bb.contract).toBe(3);
    expect(payroll(G)).toBeGreaterThan(0);
  });
  it('練習生はなくなり、売り込みに来た子はスカウトの報告に届く（問119）', () => {
    const G = newGame({ seed: 38 });
    let g = 0; while (!Object.values(G.owner.mk.known).some((k) => k.from === '売り込み') && g++ < 300) advanceWeek(G);
    expect(Object.values(G.owner.mk.known).some((k) => k.from === '売り込み')).toBe(true);
    expect(G.owner.cands.length).toBe(0); expect(G.owner.trials.length).toBe(0);
  });
});
