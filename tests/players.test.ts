import { describe, expect, it } from 'vitest';
import { advanceWeek, newGame, decidePromo, type GameState } from '../src/core/game';
import { SPECIALS, GOOD_NAMES, BAD_NAMES } from '../src/core/data/specials';
import { makePlayer, makeSquad, ovr } from '../src/core/player';
import { Rng } from '../src/core/rng';
import { POS } from '../src/core/constants';

describe('特殊能力（企画書 8-8）', () => {
  it('良い50・悪い8（ロングスローは問133で追加）', () => { expect(GOOD_NAMES.length).toBe(50); expect(BAD_NAMES.length).toBe(8); expect(new Set(SPECIALS.map((s) => s.name)).size).toBe(58); });
  it('どれにも説明がある', () => { for (const s of SPECIALS) expect(s.desc.length).toBeGreaterThan(5); });
  it('1人0〜5つ。GKはフィールドのしくみの特殊能力を持たない', () => {
    const r = new Rng(2); const ids = { n: 1 };
    for (let i = 0; i < 400; i++) {
      const p = makePlayer(r, ids, 50 + r.int(0, 35), r.pick(POS));
      expect(p.sp.length).toBeLessThanOrEqual(5);
      if (p.pos === 'GK') for (const s of p.sp) expect(['スーパーサブ', '吸収力']).not.toContain(s);
    }
  });
});

describe('能力・適性（企画書 8-2・8-3）', () => {
  it('能力は1〜99（100はない）、◎は多くて4つ、ポテンシャルは88まで', () => {
    const r = new Rng(9); const ids = { n: 1 };
    let dbl = 0, n = 0;
    for (let i = 0; i < 60; i++) for (const p of makeSquad(r, ids, 50 + r.int(0, 30))) {
      for (const v of p.a) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThan(100); }
      const d = POS.filter((x) => p.apt[x] === 3).length; expect(d).toBeLessThanOrEqual(4); dbl += d; n++;
      expect(p.pot).toBeLessThanOrEqual(88);
    }
    expect(dbl / n).toBeGreaterThanOrEqual(1); expect(dbl / n).toBeLessThanOrEqual(2);
  });
});

const toWeek = (G: GameState, w: number, s: number) => { let g = 0; while (!(G.week === w && G.season === s) && g++ < 400) advanceWeek(G); };

describe('ユース（企画書 9-1）', () => {
  const G = newGame({ seed: 21, pref: '福岡県' });
  it('1学年4〜6人×3学年', () => {
    for (const g of [1, 2, 3]) { const n = G.youth.filter((p) => p.grade === g).length; expect(n).toBeGreaterThanOrEqual(4); expect(n).toBeLessThanOrEqual(6); }
  });
  it('2月はじめに春の昇格会議が開き、上げた子はトップへ、上げなかった3年は去り、新しい1年が入る', () => {
    toWeek(G, 4, 1);
    expect(G.promo?.open).toBe(true);
    const g3 = G.youth.filter((p) => p.grade === 3); const g1 = G.youth.filter((p) => p.grade === 1).length;
    const up = g3[0]; const size = G.squad.length;
    decidePromo(G, [up.id]);
    expect(G.promo).toBeNull();
    expect(G.squad.length).toBe(size + 1);
    const moved = G.squad.find((p) => p.id === up.id)!;
    expect(moved.origin).toBe('ユース出身'); expect(moved.grade).toBeUndefined();
    for (const p of g3.slice(1)) expect(G.youth.some((x) => x.id === p.id)).toBe(false);
    expect(G.youth.filter((p) => p.grade === 2).length).toBe(g1);
    expect(G.youth.filter((p) => p.grade === 1).length).toBeGreaterThanOrEqual(4);
  });
  it('毎月の報告会議は、数字ではなく言葉と矢印', () => {
    toWeek(G, 9, 1);
    const rep = G.youthLog[G.youthLog.length - 1];
    expect(rep.month).toBe(3);
    for (const l of rep.lines) { expect(['↑↑', '↑', '→']).toContain(l.arrow); expect(l.words).not.toMatch(/\d/); }
  });
});

describe('年末：引退とポテンシャル', () => {
  it('引退は12月に知らされ、シーズンが変わるときにクラブを去る。ポテンシャルは88をこえない', () => {
    const G = newGame({ seed: 4 });
    for (const p of G.squad.slice(0, 3)) { p.age = 36; p.decl = 30; }
    toWeek(G, 45, 1);
    const ret = G.squad.filter((p) => p.retiring);
    expect(ret.length).toBeGreaterThan(0);
    toWeek(G, 0, 2);
    for (const p of ret) expect(G.squad.some((x) => x.id === p.id)).toBe(false);
    for (const p of G.squad) expect(p.pot).toBeLessThanOrEqual(88);
  });
});

describe('若手の伸び（感想 4：インフレしない）', () => {
  it('16〜18歳の若手が5年で大きく伸びすぎない（85をこえない）', () => {
    const G = newGame({ seed: 8 });
    const kids = G.squad.filter((p) => p.age <= 18).map((p) => p.id);
    const start = kids.map((id) => ovr(G.squad.find((p) => p.id === id)!));
    toWeek(G, 0, 6);
    const end = kids.map((id) => G.squad.find((p) => p.id === id)).filter(Boolean).map((p) => ovr(p!));
    expect(end.length).toBeGreaterThan(0);
    for (const v of end) expect(v).toBeLessThanOrEqual(85);
    expect(Math.max(...end)).toBeGreaterThan(Math.max(...start));
  });
});
