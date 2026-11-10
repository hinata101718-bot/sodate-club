/* セーブの版の変換。MIGRATIONS[n] は、版 n のセーブを 版 n+1 に変える */
import { Rng } from './rng';
import { prefByName, PREFS } from './data/prefs';
import { makeWorld, type Club } from './world';
import { seasonSchedule, AWARD_WEEK } from './calendar';
import { emptyRow, setupSeason, ME, type GameState } from './game';
import { simulateMatch } from './match';
import { defaultEmblem } from './emblem';

export const MIGRATIONS: Record<number, (s: any) => any> = {
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
    const G: GameState = {
      version: 2, rng: 0, ids: s.ids, season: s.season, week: 0,
      club: { name: s.club.name, color: s.club.color, pref, city: s.club.city ?? prefByName(pref).city, emblem: s.club.emblem ?? defaultEmblem(s.club.color) },
      clubs, squad: s.squad, mgr: s.mgr, policy: s.policy ?? 'ふつう', leagues: {}, sched: seasonSchedule(), cup: { round: 0, rounds: [], champion: null },
      lastMatch: s.lastMatch ?? null, lastReport: s.lastReport ?? [], pending: s.pending ?? [], history: [], goals: [], news: ['セーブを新しい版に変換しました。'],
    };
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
