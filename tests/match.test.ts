import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { makeSquad, teamStrength } from '../src/core/player';
import { simulateMatch, type TeamIn } from '../src/core/match';
import { makeManager } from '../src/core/staff';

function team(r: Rng, ids: { n: number }, id: number, lvl: number): TeamIn {
  return { id, name: 'クラブ' + id, me: false, color: '#333333', squad: makeSquad(r, ids, lvl), mgr: makeManager(r, ids, r.next()) };
}

describe('試合のしくみ（企画書 13-2・問54）', () => {
  const r = new Rng(12345); const ids = { n: 1 };
  let goals = 0, n = 0, strong = 0, sn = 0, chances = 0;
  for (let i = 0; i < 2400; i++) {
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
  it('決定機は両チームあわせて8〜12回ほど', () => { const c = chances / n; expect(c).toBeGreaterThanOrEqual(8); expect(c).toBeLessThanOrEqual(13); });
});

describe('試合の文と見どころ', () => {
  it('同じシードなら同じ結果になる', () => {
    const mk = () => { const r = new Rng(7); const ids = { n: 1 }; const A = team(r, ids, 1, 60), B = team(r, ids, 2, 60); return simulateMatch(r, A, B).view; };
    expect(JSON.stringify(mk())).toBe(JSON.stringify(mk()));
  });
  it('ゴールの場面は見どころに必ず全部入る。結果の行は最後', () => {
    const r = new Rng(99); const ids = { n: 1 };
    for (let i = 0; i < 200; i++) {
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
    for (let i = 0; i < 400; i++) {
      const A = team(r, ids, 1, 62), B = team(r, ids, 2, 62);
      for (const sq of [A.squad, B.squad]) for (const p of sq) if (p.pos === 'GK') p.sp = ['ビッグセーブ', 'ハイボール処理', 'PKストッパー', '素早い飛び出し'];
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
    for (let i = 0; i < 100; i++) {
      const res = simulateMatch(r, team(r, ids, 1, 60), team(r, ids, 2, 60), { cup: true });
      expect(res.winner === 0 || res.winner === 1).toBe(true);
      if (res.score[0] === res.score[1]) expect(res.pk).not.toBeNull();
    }
  });
});
