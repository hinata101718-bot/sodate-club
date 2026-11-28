// @ts-nocheck
/* PRESS START の仕組みのテスト。自動で遊ぶ「お試しの社長」で何年か回し、早すぎず遅すぎず大きくなるかを見る */
import { describe, it, expect } from "vitest";
import * as S from "../public/press-start/js/sim.js";
import * as D from "../public/press-start/js/data.js";

export function bot(s, opt = {}) {
  // ふつうの人がしそうな遊び方
  while (s.pending.length) {
    const e = s.pending.shift();
    if (e.kind === "branch") {
      const pj = s.projects.find((x) => x.id === e.pid);
      const q = S.quality(s, pj);
      const weak = ["gfx", "snd", "fun", "vol"].sort((a, b) => q[a] - q[b])[0];
      const k = e.opts.find((o) => D.BRANCHES.find((b) => b.key === o).effect[weak] > 1) || e.opts[0];
      S.chooseBranch(s, e.pid, k);
    }
    if (e.kind === "yearEnd") S.payBonus(s, s.money > S.monthlyCost(s) * 6 ? 1 : 0);
    if (e.kind === "entrance") for (const id of e.ids) if (S.capLeft(s) > 0) S.hire(s, id);
  }
  // 雇う
  if (S.capLeft(s) > 0 && s.money > S.monthlyCost(s) * 4 + 60) {
    if (!s.candidates.length && s.money > S.recruitCost(s) + 200) S.recruit(s);
    const devs = s.staff.filter((p) => D.roleOf(p.role).dev).length;
    const want = s.candidates.filter((c) => devs < 4 || D.roleOf(c.role).dev === false || s.staff.length > 6).sort((a, b) => b.stats[D.roleOf(b.role).stat] - a.stats[D.roleOf(a.role).stat]);
    if (want[0]) S.hire(s, want[0].id);
  }
  // 引っ越す
  const c = S.canMove(s);
  if (c.ok && S.capLeft(s) <= 0 && s.money > c.office.move + S.monthlyCost(s) * 6) S.move(s);
  // 作る
  for (const tm of s.teams) {
    if (S.teamBusy(s, tm.id) || !S.teamMembers(s, tm.id).length) continue;
    const pr = S.proposals(s, tm.id);
    const best = pr.ideas.find((i) => i.mark === "◎") || pr.ideas.find((i) => i.mark === "○") || pr.ideas[0];
    const cons = S.consolesOn(s.t).sort((a, b) => S.installed(b, S.dateOf(s.t).yf) - S.installed(a, S.dateOf(s.t).yf));
    const size = s.money > 2500 && s.staff.length >= 7 ? "big" : s.money > 500 ? "mid" : "small";
    const con = cons.find((x) => D.SIZES.find((z) => z.key === size).cost + x.fee <= s.money - 50) || cons[cons.length - 1];
    const r = S.startProject(s, { genre: best.genre, theme: best.theme, size, console: con.key, team: tm.id, members: S.teamMembers(s, tm.id).map((p) => p.id), title: S.makeTitle(s, best.genre, best.theme) });
    if (!r.ok && s.offers.length) S.takeOffer(s, s.offers[0].id, tm.id);
  }
  if (s.money > 800 && s.loan > 0) S.repay(s, s.loan);
}
export function run(years, seed) {
  const s = S.newGame("テスト社", "ヒナタ", seed);
  S.hire(s, s.candidates[0].id);
  const rows = [];
  const T = 4 * 4 * 12;
  for (let y = 0; y < years; y++) {
    for (let i = 0; i < T; i++) { bot(s); S.tick(s); s.fx.length = 0; if (s.over) break; }
    const d = S.dateOf(s.t);
    rows.push({ year: d.year, money: Math.round(s.money), staff: s.staff.length, office: s.office, games: s.games.length, best: Math.max(0, ...s.games.map((g) => g.sold)), top: Math.max(0, ...s.games.map((g) => g.total)), rank: S.myRank(s), loan: Math.round(s.loan), fame: Math.round(s.fame), goal: s.goalIdx, avgStat: Math.round(s.staff.reduce((a, p) => a + p.stats[D.roleOf(p.role).stat], 0) / Math.max(1, s.staff.length)) });
    if (s.over) break;
  }
  return { s, rows };
}

describe("PRESS START", () => {
  it("はじめると、候補が3人いて、お金は300万", () => {
    const s = S.newGame("A", "B", 1);
    expect(s.candidates.length).toBe(3);
    expect(s.money).toBe(300);
    expect(S.dateText(0)).toBe("1980年 4月 1週");
  });
  it("保存して読みこめる", () => {
    const { s } = run(2, 7);
    const t = S.deserialize(S.serialize(s));
    expect(t.staff.length).toBe(s.staff.length);
    expect(t.t).toBe(s.t);
  });
  it("レビューの点数は1〜10、感想に穴埋めの印が残らない", () => {
    const { s } = run(6, 3);
    for (const g of s.games) for (const r of g.reviews) {
      expect(r.score).toBeGreaterThanOrEqual(1);
      expect(r.score).toBeLessThanOrEqual(10);
      expect(r.text).not.toMatch(/[{}]/);
    }
  });
  it("お試しの社長で15年回すと、会社が大きくなる（たいていは倒産しない）", () => {
    let alive = 0;
    for (const seed of [11, 22, 33, 44, 55, 66]) {
      const { s, rows } = run(15, seed);
      console.log("seed", seed, s.over ? "倒産:" + s.over.why : "");
      console.table(rows.filter((_, i) => i % 2 === 0 || i === rows.length - 1));
      if (!s.over) alive++;
    }
    expect(alive).toBeGreaterThanOrEqual(4);
  });
});
