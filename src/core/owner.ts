/* オーナーが決めること（企画書 4・9-2〜9-4・10・11・12）：人を雇う・お金・施設・移籍と契約 */
import { Rng, clamp } from './rng';
import { POS, type Pos } from './constants';
import { PREFS, prefByName, prefScale } from './data/prefs';
import { makePlayer, ovr, salaryFor, assignNumbers } from './player';
import { makeCoach, makeManager, makeScout, COACH_ROLES, type Coach, type CoachRole, type Scout } from './staff';
import { FAC_KEYS, debtCap, emptyLedger, facCost, facWeeks, gate, sponsorYear, INTEREST, MAX_FAC, type FacKey, type Ledger, type MoneyKey } from './finance';
import { growPlayer, DEFAULT_CTX, type GrowCtx } from './growth';
import { monthlyReport, type YouthReport } from './youth';
import type { Manager, Player } from './types';
import type { GameState } from './game';
import { TIER_LVL } from './world';

export interface Cand { id: number; p: Player; src: 'scout' | 'club' | 'trial'; fee: number; note: string; from: string; clubId?: number; scout?: string; until: number; }
export interface OwnerState {
  money: number; debt: number; ledger: Ledger; lastLedger: Ledger | null; pop: number; sponsor: number;
  fac: Record<FacKey, number>; build: { key: FacKey; weeks: number; total: number } | null;
  coaches: Record<CoachRole, Coach | null>; scouts: Scout[]; wish: { pos: Pos | null; maxAge: number | null };
  market: { mgr: Manager[]; coach: Record<CoachRole, Coach[]>; scout: Scout[] };
  cands: Cand[]; trials: Player[]; trialLog: YouthReport[]; renew: Record<number, { years: number; salary: number; no?: boolean }>;
  warnedDebt: boolean;
}
const tierOf = (G: GameState) => G.clubs.find((c) => c.me)!.tier;
const absWeek = (G: GameState) => G.season * 48 + G.week;

export function initOwner(r: Rng, ids: { n: number }, pref: string): OwnerState {
  const coaches = {} as Record<CoachRole, Coach | null>;
  for (const k of COACH_ROLES) coaches[k] = makeCoach(r, ids, k, 0.25 + r.next() * 0.2);
  const o: OwnerState = {
    money: Math.round((8000 + prefScale(pref) * 4000) / 100) * 100, debt: 0, ledger: emptyLedger(), lastLedger: null, pop: Math.round(15 + prefScale(pref) * 10), sponsor: 0,
    fac: { field: 1, youth: 1, stadium: 1, medical: 1, dorm: 0 }, build: null,
    coaches, scouts: [makeScout(r, ids, 0.35)], wish: { pos: null, maxAge: null },
    market: { mgr: [], coach: { off: [], def: [], gk: [], phys: [], youth: [] }, scout: [] },
    cands: [], trials: [], trialLog: [], renew: {}, warnedDebt: false,
  };
  refreshMarket(r, ids, o, 3);
  return o;
}
export function refreshMarket(r: Rng, ids: { n: number }, o: OwnerState, tier: number) {
  const q = tier === 1 ? 0.35 : tier === 2 ? 0.2 : 0;
  o.market.mgr = [0, 1, 2].map((i) => makeManager(r, ids, Math.min(1, r.next() * 0.7 + q + i * 0.08)));
  for (const k of COACH_ROLES) o.market.coach[k] = [0, 1, 2].map((i) => makeCoach(r, ids, k, Math.min(1, r.next() * 0.6 + q + i * 0.1)));
  o.market.scout = [0, 1, 2].map((i) => makeScout(r, ids, Math.min(1, r.next() * 0.6 + q + i * 0.1)));
}

/* ---------- 伸びの環境（コーチ・練習場・監督） ---------- */
const cf = (c: Coach | null) => (c ? 0.75 + c.skill * 0.6 : 0.65);
export function growCtx(G: GameState, camp: boolean): GrowCtx {
  const o = G.owner; const C = o.coaches;
  const off = cf(C.off), def = cf(C.def), phys = cf(C.phys);
  return {
    ...DEFAULT_CTX, mgrGrow: G.mgr.grow, style: G.mgr.style, camp,
    coach: [phys, off, off, off, phys, def, phys, def], field: 0.85 + o.fac.field * 0.15, medical: o.fac.medical,
    defCoach: C.def?.skill ?? 0, offCoach: C.off?.skill ?? 0, physCoach: C.phys?.skill ?? 0,
  };
}
/** GKの4項目はキーパーコーチが受け持つ */
export function gkCtx(G: GameState, base: GrowCtx): GrowCtx {
  const k = cf(G.owner.coaches.gk);
  const c = [...base.coach]; c[1] = k; c[2] = k; c[3] = k; c[5] = k;
  return { ...base, coach: c };
}
export const youthSkill = (G: GameState) => G.owner.coaches.youth?.skill ?? 0.2;

/* ---------- お金 ---------- */
export function pay(G: GameState, key: MoneyKey, amount: number) { G.owner.money -= amount; G.owner.ledger[key] += amount; }
export function earn(G: GameState, key: MoneyKey, amount: number) { G.owner.money += amount; G.owner.ledger[key] += amount; }
export const payroll = (G: GameState) => G.squad.reduce((s, p) => s + p.salary, 0);
export const staffPay = (G: GameState) => G.mgr.salary + COACH_ROLES.reduce((s, k) => s + (G.owner.coaches[k]?.salary ?? 0), 0) + G.owner.scouts.reduce((s, x) => s + x.salary, 0);
export function borrow(G: GameState, amount: number): number {
  const cap = debtCap(tierOf(G)); const can = Math.max(0, Math.min(amount, cap - G.owner.debt));
  G.owner.debt += can; G.owner.money += can; return can;
}
export function repay(G: GameState, amount: number): number {
  const a = Math.max(0, Math.min(amount, G.owner.debt, G.owner.money)); G.owner.debt -= a; G.owner.money -= a; return a;
}
/** 毎週のお金の出入り */
export function weekMoney(G: GameState, homeGate: { oppTier: number; cup: boolean } | null): string[] {
  const out: string[] = []; const o = G.owner;
  pay(G, 'salary', Math.round(payroll(G) / 48));
  pay(G, 'staff', Math.round(staffPay(G) / 48));
  earn(G, 'sponsor', Math.round(o.sponsor / 48));
  if (homeGate) { const g = gate(tierOf(G), G.club.pref, o.pop, o.fac.stadium, homeGate.oppTier, homeGate.cup); earn(G, 'gate', g.money); out.push(`ホームの試合に ${g.fans.toLocaleString()}人のお客さんが来た（入場料 ${g.money.toLocaleString()}万円）。`); }
  if (G.week % 4 === 3 && o.debt > 0) pay(G, 'interest', Math.round((o.debt * INTEREST) / 12));
  if (o.build) {
    o.build.weeks--;
    if (o.build.weeks <= 0) { o.fac[o.build.key]++; out.push(`施設の強化が終わった：${facLabel(o.build.key)}がレベル${o.fac[o.build.key]}になった。`); o.build = null; }
  }
  if (o.money < 0) {
    const need = Math.ceil(-o.money / 1000) * 1000; const got = borrow(G, need);
    if (got > 0) out.push(`お金が足りないので、銀行から ${got.toLocaleString()}万円を借りた。`);
    if (o.money < 0 && !o.warnedDebt) { o.warnedDebt = true; out.push('借金が上限に達した。選手を売るか、施設づくりをがまんしてお金をためよう。'); }
  } else o.warnedDebt = false;
  return out;
}
const facLabel = (k: FacKey) => ({ field: '練習場', youth: 'ユースの施設', stadium: 'スタジアム', medical: 'メディカル施設', dorm: '寮' }[k]);
export function startBuild(G: GameState, key: FacKey): string | null {
  const o = G.owner; if (o.build) return 'いまは別の施設を強化している。';
  const next = o.fac[key] + 1; if (next > MAX_FAC) return 'これ以上は強化できない。';
  const cost = facCost(key, next); if (o.money < cost) return 'お金が足りない。';
  pay(G, 'build', cost); o.build = { key, weeks: facWeeks(key, next), total: facWeeks(key, next) };
  return null;
}
/** 人気：勝つと上がり、負けると少し下がる */
export function popResult(G: GameState, gf: number, ga: number) { const o = G.owner; o.pop = clamp(o.pop + (gf > ga ? 0.7 : gf === ga ? 0.15 : -0.35), 0, 100); }

/* ---------- 人を雇う（企画書 10）。コーチの見直しは年に1回、冬（12月）にまとめて ---------- */
export const coachWindow = (G: GameState) => G.week >= 44 || G.season === 1 && G.week < 8;
export function hireManager(G: GameState, id: number): string | null {
  const m = G.owner.market.mgr.find((x) => x.id === id); if (!m) return '見つからない。';
  const fee = Math.round(G.mgr.salary / 2 / 10) * 10;
  pay(G, 'staff', fee);
  G.owner.market.mgr = G.owner.market.mgr.filter((x) => x !== m).concat([G.mgr]);
  G.mgr = m; for (const p of G.squad) p.req = false;
  return null;
}
export function hireCoach(G: GameState, role: CoachRole, id: number): string | null {
  if (!coachWindow(G)) return 'コーチの入れかえは、年に1回、冬（12月）にまとめて行う。';
  const list = G.owner.market.coach[role]; const c = list.find((x) => x.id === id); if (!c) return '見つからない。';
  const old = G.owner.coaches[role];
  G.owner.market.coach[role] = list.filter((x) => x !== c).concat(old ? [old] : []);
  G.owner.coaches[role] = c; return null;
}
export function fireCoach(G: GameState, role: CoachRole): string | null {
  if (!coachWindow(G)) return 'コーチの入れかえは、年に1回、冬（12月）にまとめて行う。';
  const old = G.owner.coaches[role]; if (!old) return null;
  G.owner.market.coach[role].push(old); G.owner.coaches[role] = null; return null;
}
export function hireScout(G: GameState, id: number): string | null {
  if (G.owner.scouts.length >= 3) return 'スカウトは3人までしか雇えない。';
  const s = G.owner.market.scout.find((x) => x.id === id); if (!s) return '見つからない。';
  G.owner.market.scout = G.owner.market.scout.filter((x) => x !== s); G.owner.scouts.push(s); return null;
}
export function fireScout(G: GameState, id: number) { const s = G.owner.scouts.find((x) => x.id === id); if (!s) return; G.owner.scouts = G.owner.scouts.filter((x) => x !== s); G.owner.market.scout.push(s); }

/* ---------- スカウトが毎月持ってくる候補（企画書 9-2） ---------- */
export function scoutMonth(G: GameState, r: Rng): string[] {
  const o = G.owner; const out: string[] = [];
  o.cands = o.cands.filter((c) => c.until > absWeek(G) && c.src !== 'scout');
  for (const s of o.scouts) {
    const n = 1 + (r.next() < s.skill ? 1 : 0) + (r.next() < s.skill * 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const pos = o.wish.pos ?? (s.pos && r.next() < 0.7 ? s.pos : r.pick(POS));
      const maxAge = o.wish.maxAge ?? 22;
      const age = r.int(17, Math.max(17, Math.min(22, maxAge)));
      const regionPrefs = PREFS.filter((p) => p.region === s.region).map((p) => p.name);
      const pref = r.next() < 0.7 ? r.pick(regionPrefs) : r.pick(PREFS).name;
      const lvl = 40 + r.int(0, 10) + (age - 17) * 1.5 + (tierOf(G) < 3 ? 4 : 0);
      const p = makePlayer(r, G.ids, lvl, pos, { age, nSp: r.next() < 0.3 ? 1 : 0, exp: age >= 20 ? 10 : 0, pref, origin: 'スカウト' });
      /* 腕のいいスカウトほど、隠れた原石を持ってくる（問30） */
      const gem = r.next() < 0.04 + s.skill * 0.16;
      p.pot = clamp(Math.round(ovr(p) + 6 + r.next() * 10 + s.skill * 10 + (gem ? r.int(8, 16) : 0)), 40, 88);
      if (p.gStart < age - 2) p.gStart = age - r.int(0, 2);
      p.contract = 3; p.salary = salaryFor(ovr(p));
      const fee = Math.round((100 + r.next() * 300 + (p.pot - 60) * 8) / 10) * 10;
      o.cands.push({ id: p.id, p, src: 'scout', fee: Math.max(50, fee), note: scoutNote(p, s.skill, r), from: age <= 18 ? '高校生' : '大学生', scout: s.name, until: absWeek(G) + 4 });
    }
  }
  if (o.scouts.length) out.push(`スカウトが候補を${o.cands.filter((c) => c.src === 'scout').length}人持ってきた。`);
  return out;
}
function scoutNote(p: Player, skill: number, r: Rng): string {
  const room = p.pot - ovr(p) + (r.next() > 0.45 + skill * 0.55 ? r.int(-10, 10) : 0);
  const g = p.sp.find((s) => ['練習の虫', 'キャンプで化ける', '実戦で伸びる', '吸収力', '学ぶ力', '衰えにくい'].includes(s));
  const base = room >= 25 ? '化けるかもしれない。ほかのクラブに取られる前に' : room >= 15 ? '伸びしろがある。数年かけて育てたい' : room >= 8 ? 'まじめな子。少しずつ伸びそうだ' : 'すぐに使えるが、上はそれほど高くないかもしれない';
  return g && skill >= 0.5 ? `${base}。${g === '練習の虫' ? 'あいつは練習の虫です' : `「${g}」の気配がある`}` : base;
}
/** 他のクラブで出番のない若手（企画書 9-3）：移籍の期間にだけ */
export function clubYoung(G: GameState, r: Rng): string[] {
  const o = G.owner; o.cands = o.cands.filter((c) => c.src !== 'club');
  const pool: { p: Player; c: (typeof G.clubs)[number] }[] = [];
  for (const c of G.clubs) if (!c.me && c.tier <= Math.max(1, tierOf(G) - 0) ) for (const p of c.squad) if (p.age <= 22 && p.seasonApps <= 4) pool.push({ p, c });
  r.shuffle(pool);
  for (const { p, c } of pool.slice(0, 5)) o.cands.push({ id: p.id, p, src: 'club', fee: Math.max(200, Math.round((Math.pow(Math.max(0, ovr(p) - 35), 2) * 1.2) / 100) * 100), note: `${c.tier}部の${c.name}で、出番がない`, from: c.name, clubId: c.id, until: absWeek(G) + (G.week >= 44 ? 48 - G.week : 32 - G.week) });
  return pool.length ? ['他のクラブで出番のない若手の情報が届いた。'] : [];
}
/** 自分から売り込みに来る子（企画書 9-4）：1シーズンに1〜3人ほど */
export function maybeWalkIn(G: GameState, r: Rng): string[] {
  if (r.next() > 0.045) return [];
  const pos = r.pick(POS); const age = r.int(17, 23);
  const p = makePlayer(r, G.ids, 38 + r.int(0, 12), pos, { age, nSp: 0, exp: 0, pref: r.next() < 0.5 ? G.club.pref : r.pick(PREFS).name, origin: '練習生' });
  p.pot = clamp(ovr(p) + r.int(4, 26), 40, 86); p.salary = salaryFor(ovr(p)); p.contract = 2;
  G.owner.cands.push({ id: p.id, p, src: 'trial', fee: 0, note: '「テストを受けさせてください」', from: `${p.pref}から`, until: absWeek(G) + 4 });
  return [`${p.name}（${age}歳・${pos}）が「テストを受けさせてください」とやってきた。`];
}
export function signCand(G: GameState, id: number, r: Rng): string | null {
  const o = G.owner; const c = o.cands.find((x) => x.id === id); if (!c) return '見つからない。';
  if (G.squad.length >= 25) return 'トップは25人まで。誰かを売りに出してから獲ろう。';
  if (c.src === 'club' && !inWindow(G)) return '他のクラブの選手は、移籍の期間にしか獲れない。';
  if (o.money < c.fee) return 'お金が足りない。';
  pay(G, 'buy', c.fee);
  if (c.src === 'club' && c.clubId != null) {
    const club = G.clubs.find((x) => x.id === c.clubId)!;
    const i = club.squad.indexOf(club.squad.find((x) => x.id === c.p.id)!);
    if (i >= 0) { const np = makePlayer(r, G.ids, TIER_LVL[club.tier] - 2, c.p.pos, { age: r.int(19, 28) }); np.num = c.p.num; club.squad[i] = np; }
    c.p.origin = '他クラブから'; c.p.contract = 3; c.p.salary = salaryFor(ovr(c.p));
  }
  c.p.num = 0; c.p.req = false; c.p.listed = false; c.p.hist = c.p.hist || [];
  G.squad.push(c.p); assignNumbers(G.squad);
  o.cands = o.cands.filter((x) => x !== c);
  return null;
}
export function dropCand(G: GameState, id: number) { G.owner.cands = G.owner.cands.filter((x) => x.id !== id); }
/** 練習生として1〜3か月預かる */
export function takeTrial(G: GameState, id: number, months: number): string | null {
  const o = G.owner; const c = o.cands.find((x) => x.id === id && x.src === 'trial'); if (!c) return '見つからない。';
  c.p.trialMonths = clamp(months, 1, 3); c.p.snap = c.p.a.map(Math.floor);
  o.trials.push(c.p); o.cands = o.cands.filter((x) => x !== c); return null;
}
export function decideTrial(G: GameState, id: number, sign: boolean): string | null {
  const o = G.owner; const p = o.trials.find((x) => x.id === id); if (!p) return '見つからない。';
  if (sign) { if (G.squad.length >= 25) return 'トップは25人まで。'; p.trialMonths = undefined; p.snap = undefined; p.origin = '練習生'; p.contract = 2; p.salary = salaryFor(ovr(p)); p.num = 0; G.squad.push(p); assignNumbers(G.squad); }
  o.trials = o.trials.filter((x) => x !== p); return null;
}
export function trialWeek(G: GameState, r: Rng, ctx: GrowCtx): string[] {
  const o = G.owner; const out: string[] = [];
  for (const p of o.trials) { p.played = r.next() < 0.4; growPlayer(r, p, ctx); p.inj = 0; }
  if (G.week % 4 === 0 && o.trials.length) {
    const rep = monthlyReport(r, o.trials.filter((p) => (p.trialMonths ?? 0) > 0), G.season, Math.floor(G.week / 4) + 1, youthSkill(G));
    for (const p of o.trials) if ((p.trialMonths ?? 0) > 0) p.trialMonths!--;
    o.trialLog.push(rep); if (o.trialLog.length > 4) o.trialLog.shift();
    if (rep.lines.length) out.push('練習生の報告があった。');
    const done = o.trials.filter((p) => p.trialMonths === 0);
    if (done.length) out.push(`${done.map((p) => p.name).join('、')} の練習の期間が終わった。取るか断るかを決めよう。`);
  }
  return out;
}

/* ---------- 移籍と契約（企画書 12） ---------- */
export const inWindow = (G: GameState) => (G.week >= 24 && G.week <= 31) || G.week >= 44;
export function listPlayer(G: GameState, id: number, on: boolean) { const p = G.squad.find((x) => x.id === id); if (p) p.listed = on; }
/** 契約更新の案（冬の契約更新の時期にまとめて決める）。更新すると給料が上がることがある */
export function renewalOffer(p: Player): { years: number; salary: number } {
  const want = salaryFor(ovr(p));
  return { years: p.age >= 31 ? 1 : p.age <= 23 ? 3 : 2, salary: Math.max(p.salary, Math.round((want * (want > p.salary ? 1.05 : 1)) / 10) * 10) };
}
export function setRenew(G: GameState, id: number, years: number, no: boolean) {
  const p = G.squad.find((x) => x.id === id); if (!p) return;
  const off = renewalOffer(p); G.owner.renew[id] = { years: clamp(years, 1, 4), salary: off.salary, no };
}
/** 新しいシーズン：契約を1年進め、更新しなかった選手は去る */
export function rollContracts(G: GameState): string[] {
  const out: string[] = []; const leave: Player[] = [];
  for (const p of G.squad) {
    p.contract--;
    if (p.contract <= 0) {
      const d = G.owner.renew[p.id] ?? { ...renewalOffer(p), no: false };
      if (d.no) leave.push(p); else { p.contract = d.years; p.salary = d.salary; }
    }
  }
  if (leave.length) { G.squad = G.squad.filter((p) => !leave.includes(p)); out.push(`契約が切れて、${leave.map((p) => p.name).join('、')} がクラブを去った。`); }
  G.owner.renew = {};
  return out;
}
export function newOwnerSeason(G: GameState, r: Rng): string[] {
  const o = G.owner;
  o.lastLedger = o.ledger; o.ledger = emptyLedger();
  o.sponsor = sponsorYear(tierOf(G), G.club.pref, o.pop);
  o.cands = o.cands.filter((c) => c.src === 'trial');
  void r; return [`今年のスポンサー収入は ${o.sponsor.toLocaleString()}万円の見こみ。`];
}
export { FAC_KEYS, prefByName };
