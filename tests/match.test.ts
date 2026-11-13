import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { makeSquad, teamStrength } from '../src/core/player';
import { simulateMatch, banned, type TeamIn } from '../src/core/match';
import { newGame } from '../src/core/game';
import { makeManager } from '../src/core/staff';

function team(r: Rng, ids: { n: number }, id: number, lvl: number): TeamIn {
  return { id, name: 'クラブ' + id, me: false, color: '#333333', squad: makeSquad(r, ids, lvl), mgr: makeManager(r, ids, r.next()) };
}

describe('試合のしくみ（企画書 13-2・問54）', () => {
  const r = new Rng(12345); const ids = { n: 1 };
  let goals = 0, n = 0, strong = 0, sn = 0, chances = 0;
  for (let i = 0; i < 600; i++) {
    const base = 50 + r.int(0, 25); const d = r.int(0, 8);
    const A = team(r, ids, 1, base + d), B = team(r, ids, 2, base);
    const diff = teamStrength(A.squad) - teamStrength(B.squad);
    const home = i % 2 === 0;
    const res = home ? simulateMatch(r, A, B) : simulateMatch(r, B, A);
    const [h, a] = res.score; goals += h + a; n++; chances += res.view.chances[0] + res.view.chances[1];
    const ag = home ? h : a, bg = home ? a : h;
    if (Math.abs(diff) >= 3 && Math.abs(diff) <= 6) { sn++; if (diff > 0 ? ag > bg : bg > ag) strong++; }
  }
  it('1試合の得点は平均2.0〜3.0点', () => { const g = goals / n; expect(g).toBeGreaterThanOrEqual(2.0); expect(g).toBeLessThanOrEqual(3.0); });
  it('力の差が3〜6の試合で、強いほうが6〜7割勝つ', () => { const w = strong / sn; expect(w).toBeGreaterThanOrEqual(0.6); expect(w).toBeLessThanOrEqual(0.7); });
  /* FM型：シュートで終わった場面の数（両チームあわせて、本物は約25本） */
  it('シュートは両チームあわせて18〜32本ほど', () => { const c = chances / n; expect(c).toBeGreaterThanOrEqual(18); expect(c).toBeLessThanOrEqual(32); });
});

describe('試合の文と見どころ', () => {
  it('同じシードなら同じ結果になる', () => {
    const mk = () => { const r = new Rng(7); const ids = { n: 1 }; const A = team(r, ids, 1, 60), B = team(r, ids, 2, 60); return simulateMatch(r, A, B).view; };
    expect(JSON.stringify(mk())).toBe(JSON.stringify(mk()));
  });
  it('ゴールの場面は見どころに必ず全部入る。結果の行は最後', () => {
    const r = new Rng(99); const ids = { n: 1 };
    for (let i = 0; i < 60; i++) {
      const A = team(r, ids, 1, 60), B = team(r, ids, 2, 60);
      const v = simulateMatch(r, A, B).view;
      const g = v.highlights.filter((x) => x.kind === 'goal').length;
      expect(g).toBe(v.score[0] + v.score[1]);
      for (const it of v.highlights) for (const l of it.lines) expect(l.length).toBeGreaterThan(0);
    }
  });
  it('GKの特殊能力が働いて入らなかったときは、GKが止めた文になる', () => {
    const r = new Rng(5); const ids = { n: 1 };
    let checked = 0;
    for (let i = 0; i < 150; i++) {
      const A = team(r, ids, 1, 62), B = team(r, ids, 2, 62);
      for (const sq of [A.squad, B.squad]) for (const p of sq) if (p.pos === 'GK') p.sp = ['ビッグセーブ', 'ハイボール処理', 'PKストッパー', '素早い飛び出し'];
      A.me = true;
      const gkNames = new Set([...A.squad, ...B.squad].filter((p) => p.pos === 'GK').map((p) => p.name));
      const v = simulateMatch(r, A, B).view;
      for (const it of v.full) {
        if (it.kind !== 'chance') continue;
        const idx = it.lines.findIndex((l) => l.some((t) => typeof t === 'object' && 'sp' in t && gkNames.has(t.t) && ['ビッグセーブ', 'ハイボール処理', 'PKストッパー'].includes(t.sp)));
        if (idx < 0 || idx !== it.lines.length - 2) continue;
        const last = it.lines[it.lines.length - 1];
        expect(last.some((t) => typeof t === 'object' && 't' in t && gkNames.has(t.t))).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
  it('天皇杯では、引き分けでもPK戦で勝ち負けが決まる', () => {
    const r = new Rng(3); const ids = { n: 1 };
    for (let i = 0; i < 40; i++) {
      const res = simulateMatch(r, team(r, ids, 1, 60), team(r, ids, 2, 60), { cup: true });
      expect(res.winner === 0 || res.winner === 1).toBe(true);
      if (res.score[0] === res.score[1]) expect(res.pk).not.toBeNull();
    }
  });
});

describe('試合のリアルさ（問133〜139）', () => {
  const G = newGame({ seed: 21 }); const r = new Rng(5);
  const cs = G.clubs.filter((c) => c.tier === 2 && !c.me);
  const ti = (c: typeof cs[0], me = false) => ({ id: c.id, name: c.name, me, color: c.color, squad: c.squad, mgr: c.mgr });
  /* 毎週の回復のかわりに、試合の前に疲れをもどす */
  const fresh = () => { for (const c of cs) for (const p of c.squad) { p.fat = 0; p.inj = 0; if (p.ban) p.ban = { L: 0, C: 0 }; } };
  const views = Array.from({ length: 120 }, (_, i) => { fresh(); return simulateMatch(r, ti(cs[i % 11], true), ti(cs[(i + 3) % 11]), { record: true }).view; });
  const avg = (f: (v: typeof views[0]) => number) => views.reduce((s, v) => s + f(v), 0) / views.length / 2;
  it('数字が本物に近い（パス・シュート・枠内・コーナー・ファウル・イエロー）', () => {
    expect(avg((v) => v.stats!.pa[0] + v.stats!.pa[1])).toBeGreaterThan(380); expect(avg((v) => v.stats!.pa[0] + v.stats!.pa[1])).toBeLessThan(520);
    const sh = avg((v) => v.stats!.sh[0] + v.stats!.sh[1]); expect(sh).toBeGreaterThan(9); expect(sh).toBeLessThan(15);
    const ot = avg((v) => v.stats!.ot[0] + v.stats!.ot[1]) / sh; expect(ot).toBeGreaterThan(0.28); expect(ot).toBeLessThan(0.45);
    expect(avg((v) => v.stats!.ck[0] + v.stats!.ck[1])).toBeGreaterThan(3.5);
    expect(avg((v) => v.stats!.fo[0] + v.stats!.fo[1])).toBeGreaterThan(9);
    expect(avg((v) => v.stats!.yc[0] + v.stats!.yc[1])).toBeGreaterThan(1);
  });
  it('試合のあとに、流れのグラフ・シュートの位置・交代・自分の選手の1対1・キッカーが出る', () => {
    const v = views[0]; expect(v.flowG!.pts.length).toBe(18); expect(v.shots!.length).toBeGreaterThan(0);
    expect(views.some((x) => (x.subs ?? []).length > 0)).toBe(true); expect(views.some((x) => (x.duels ?? []).length > 0)).toBe(true); expect(v.kick!.pk).not.toBe('');
  });
  it('イエローが4枚たまると、次の1試合に出られない（リーグと天皇杯は別）', () => {
    const p = cs[0].squad[3]; p.yc = { L: 0, C: 0 }; p.ban = { L: 1, C: 0 };
    expect(banned(p, 'L')).toBe(true); expect(banned(p, 'C')).toBe(false);
    simulateMatch(r, ti(cs[0]), ti(cs[1]), { record: true });
    expect(banned(p, 'L')).toBe(false);
  });
});
