import { describe, expect, it } from 'vitest';
import { newGame, playWeek, matchPlan, teamIn, myClub, type GameState } from '../src/core/game';
import { setForm, autoXI, pickSponsor, answerEvent, releasePlayer, releaseCost, potRange, ACH, DIFFS, applyTrain } from '../src/core/gm';
import { FORM } from '../src/core/constants';
import { growCtx } from '../src/core/owner';
import { closeMeeting } from '../src/core/meeting';

const run = (G: GameState, n: number) => { for (let i = 0; i < n; i++) { if (G.gm.offers) pickSponsor(G, 0); if (G.gm.event) answerEvent(G, 0); if (G.meet) closeMeeting(G); playWeek(G); } };

describe('PC版：GM兼監督', () => {
  it('難易度で、はじめのお金が変わる', () => {
    const e = newGame({ seed: 7, diff: 'easy' }), h = newGame({ seed: 7, diff: 'legend' });
    expect(e.owner.money).toBeGreaterThan(h.owner.money * 3);
    expect(DIFFS.legend.fire).toBe(true); expect(DIFFS.easy.fire).toBe(false);
  });
  it('GMが決めた並び方と先発で試合をする', () => {
    const G = newGame({ seed: 11 });
    setForm(G, '5-3-2'); G.gm.tac.auto = false; autoXI(G);
    const xi = G.gm.tac.xi.slice();
    expect(xi.length).toBe(FORM['5-3-2'].length);
    const plan = matchPlan(G);
    expect(plan.form).toBe('5-3-2');
    expect(plan.lineup.map((x) => x.p.id).sort()).toEqual(xi.filter((x) => x != null).sort());
    const t = teamIn(G, myClub(G));
    expect(t.fixed?.style).toBe(G.gm.tac.style);
  });
  it('練習のテーマと強さが、伸びの環境に入る', () => {
    const G = newGame({ seed: 12 });
    G.gm.train = { theme: 'attack', inten: 'hard' };
    const ctx = growCtx(G, false);
    expect(ctx.theme![1]).toBeGreaterThan(1.5);
    expect(ctx.inten).toBeGreaterThan(1.2);
    G.gm.train = { theme: 'rest', inten: 'hard' };
    expect(applyTrain(G, ctx).recov).toBeGreaterThan(20);
  });
  it('スポンサーを選ぶと、その額になる', () => {
    const G = newGame({ seed: 13 });
    const s = G.gm.offers![1]; pickSponsor(G, 1);
    expect(G.owner.sponsor).toBe(s.base); expect(G.gm.offers).toBeNull();
  });
  it('契約を切ると、のこりの給料の半分を払う', () => {
    const G = newGame({ seed: 14 });
    const p = G.squad.find((x) => x.pos === 'ST')!; const m0 = G.owner.money; const c = releaseCost(p);
    expect(releasePlayer(G, p.id)).toBeNull();
    expect(G.owner.money).toBe(m0 - c);
    expect(G.squad.includes(p)).toBe(false);
  });
  it('潜在の★は1〜5で、幅がある', () => {
    const G = newGame({ seed: 15 });
    for (const p of G.squad) { const [lo, hi] = potRange(G, p); expect(lo).toBeGreaterThanOrEqual(1); expect(hi).toBeLessThanOrEqual(5); expect(hi).toBeGreaterThanOrEqual(lo); }
  });
  it('1年進めると、実績・ミッション・記録が動き、お金が数字のまま', () => {
    const G = newGame({ seed: 16 });
    run(G, 48);
    expect(G.season).toBe(2);
    expect(Number.isFinite(G.owner.money)).toBe(true);
    expect(Object.keys(G.gm.ach).length).toBeGreaterThan(0);
    expect(G.gm.missions.length).toBe(3);
    expect(G.gm.log.length).toBe(1);
    expect(ACH.length).toBeGreaterThan(40);
  });
});
