/* セーブの版の変換。MIGRATIONS[n] は、版 n のセーブを 版 n+1 に変える */
import { Rng } from './rng';
import { prefByName, PREFS } from './data/prefs';
import { makeWorld, type Club } from './world';
import { seasonSchedule, AWARD_WEEK } from './calendar';
import { emptyRow, setupSeason, ME, type GameState } from './game';
import { simulateMatch } from './match';
import { defaultEmblem } from './emblem';

import { startYouth } from './youth';
import { initOwner } from './owner';
import { sponsorYear } from './finance';
import { initMarket, anyCond } from './market';
import { ovr } from './player';
export const MIGRATIONS: Record<number, (s: any) => any> = {
  /* 版6 → 版7（1年間のプレイのあとの直し）。対戦で見ただけの選手は、候補リストの人だけ残す（問100）。練習生は帰ってもらう（問119） */
  6: (s: any) => {
    const mk = s.owner?.mk;
    if (mk) { const keep = new Set(mk.short ?? []); for (const k of Object.values(mk.known ?? {}) as any[]) if (k.src === 'match' && !keep.has(k.pid)) delete mk.known[k.pid]; }
    if (s.owner) { s.owner.cands = []; s.owner.trials = []; }
    return s;
  },
  /* 版5 → 版6（問93〜95：監督への頼み・信頼・愛着）。「使ってほしい」の頼みは「先発で使ってほしい」に変える */
  5: (s: any) => {
    for (const p of s.squad ?? []) {
      if (p.req) p.ord = { kind: 'start' };
      p.trust ??= 50; p.love ??= p.origin === 'ユース出身' ? 65 : 40 + Math.min(20, Math.round((p.apps ?? 0) / 4)); p.unrest ??= 0;
    }
    return s;
  },
  /* 版4（夜1）→ 版5（夜2：移籍市場）。「ほしい選手の希望」はスカウトの条件に、スカウトの候補は「知っている選手」に変える */
  4: (s: any) => {
    const o = s.owner; o.mk = initMarket();
    const wish = o.wish ?? { pos: null, maxAge: null };
    for (const sc of o.scouts ?? []) sc.cond = { ...anyCond(), pos: wish.pos ? [wish.pos] : [], amax: wish.maxAge ?? null };
    for (const sc of o.market?.scout ?? []) sc.cond ??= anyCond();
    for (const c of o.cands ?? []) {
      if (c.src === 'scout') o.mk.known[c.p.id] = { pid: c.p.id, full: true, season: s.season, week: s.week, src: 'scout', ovr: ovr(c.p), a: c.p.a.map((v: number) => Math.floor(v)), age: c.p.age, club: c.from === '高校生' ? '高校' : '大学', note: c.note, scout: c.scout, p: c.p, from: c.from, fee: c.fee };
      else if (c.src === 'club') o.mk.known[c.p.id] = { pid: c.p.id, full: true, season: s.season, week: s.week, src: 'scout', ovr: ovr(c.p), a: c.p.a.map((v: number) => Math.floor(v)), age: c.p.age, club: c.from, note: c.note };
    }
    o.cands = (o.cands ?? []).filter((c: any) => c.src === 'trial');
    delete o.wish;
    return s;
  },
  /* 版3（段階3）→ 版4（お金・施設・人・移籍と契約） */
  3: (s: any) => {
    const r = new Rng((s.rng ^ 0x27d4eb2d) >>> 0);
    s.owner = initOwner(r, s.ids, s.club.pref);
    const tier = s.clubs.find((c: any) => c.me)?.tier ?? 3;
    s.owner.sponsor = sponsorYear(tier, s.club.pref, s.owner.pop);
    for (const p of s.squad) { p.contract ??= 2; p.salary ??= 300; }
    return s;
  },
  /* 版2（段階2）→ 版3（ユース・引退・ポテンシャルの上下） */
  2: (s: any) => {
    const r = new Rng((s.rng ^ 0x5bd1e995) >>> 0);
    s.youth = startYouth(r, s.ids, { pref: s.club.pref, facility: 1, dorm: 0, coachSkill: 0.5 });
    s.youthLog = []; s.promo = null; s.yearNotes = [];
    if (s.week === 4) s.promo = { open: true, rec: [] };
    return s;
  },
  /* 版1（段階1：3部12クラブだけ・22節）→ 版2（36クラブ・48週の1年・大会） */
  1: (s: any) => {
    const r = new Rng(s.rng >>> 0);
    const pref = s.club?.pref ?? '静岡県';
    const tier = s.tier ?? 3;
    const used = new Set<string>([pref]);
    const others = PREFS.map((p) => p.name).filter((n) => n !== pref);
    r.shuffle(others);
    /* 版1の11の相手クラブは、自分と同じ段のクラブとして残す */
    const keep: Club[] = [];
    const me: Club = { id: ME, name: s.club.name, color: s.club.color, pref, tier, lvl: 53, squad: [], mgr: s.mgr, emblem: s.club.emblem ?? defaultEmblem(s.club.color), me: true, prevRank: 0 };
    keep.push(me);
    const idMap = new Map<number, number>();
    idMap.set(0, ME);
    (s.clubs as any[]).filter((c) => !c.me).forEach((c, i) => {
      const p = others.find((x) => !used.has(x))!; used.add(p);
      const id = i + 1; idMap.set(c.id, id);
      keep.push({ id, name: c.name, color: c.color, pref: p, tier, lvl: c.lvl, squad: c.squad, mgr: c.mgr, emblem: defaultEmblem(c.color), me: false, prevRank: 0 });
    });
    const clubs = makeWorld(r, s.ids, pref, tier, keep);
    const G = {
      version: 2, rng: 0, ids: s.ids, season: s.season, week: 0,
      club: { name: s.club.name, color: s.club.color, pref, city: s.club.city ?? prefByName(pref).city, emblem: s.club.emblem ?? defaultEmblem(s.club.color) },
      clubs, squad: s.squad, mgr: s.mgr, policy: s.policy ?? 'ふつう', leagues: {}, sched: seasonSchedule(), cup: { round: 0, rounds: [], champion: null },
      lastMatch: s.lastMatch ?? null, lastReport: s.lastReport ?? [], pending: s.pending ?? [], history: [], goals: [], news: ['セーブを新しい版に変換しました。'],
    } as unknown as GameState;
    for (const p of [...G.squad, ...G.clubs.flatMap((c) => c.squad)]) { p.decl ??= 30; p.aptXp ??= {}; p.hist ??= []; p.seasonPerf ??= 0; p.contract ??= 2; p.salary ??= 300; p.num ??= 0; p.injNew ??= false; p.played ??= false; }
    setupSeason(G, r);
    /* 自分の段は、版1の日程と順位をそのまま引き継ぐ */
    const L = G.leagues[tier];
    L.fixtures = (s.fixtures as [number, number][][]).map((rd) => rd.map(([h, a]) => [idMap.get(s.clubs[h].id)!, idMap.get(s.clubs[a].id)!] as [number, number]));
    L.ids = [...idMap.values()];
    L.table = {}; for (const [old, nw] of idMap) L.table[nw] = { ...(s.table?.[old] ?? emptyRow()) };
    const played: number = Math.min(22, s.week ?? 0);
    if (played >= 22) G.week = AWARD_WEEK;
    else G.week = played === 0 ? 0 : G.sched.league[played - 1] + 1;
    /* ほかの段は、同じところまで試合を進めておく（記録はしない） */
    for (const t of [1, 2, 3]) {
      if (t === tier) continue;
      const LL = G.leagues[t];
      for (let i = 0; i < played; i++) for (const [h, a] of LL.fixtures[i]) {
        const hc = G.clubs.find((c) => c.id === h)!, ac = G.clubs.find((c) => c.id === a)!;
        const res = simulateMatch(r, { id: h, name: hc.name, me: false, color: hc.color, squad: hc.squad, mgr: hc.mgr }, { id: a, name: ac.name, me: false, color: ac.color, squad: ac.squad, mgr: ac.mgr });
        const [x, y] = res.score; const th = LL.table[h], ta = LL.table[a];
        th.gf += x; th.ga += y; ta.gf += y; ta.ga += x;
        if (x > y) { th.w++; th.p += 3; ta.l++; } else if (x < y) { ta.w++; ta.p += 3; th.l++; } else { th.d++; ta.d++; th.p++; ta.p++; }
      }
    }
    /* その年の大会は、変換した週より前の回戦をとばして、今年は開かない */
    if (G.week > G.sched.cup[0]) G.sched.cup = [];
    G.rng = r.s;
    return G;
  },
};
