/* PRESS START の仕組み。画面には触らない。状態（state）を受け取って、進めたり変えたりする。
   お金の単位は「万円」。時間の単位は「tick」（1週＝4tick）。 */
import * as D from "./data.js";

const TPW = D.TICKS_PER_WEEK;
const TPM = TPW * D.WEEKS_PER_MONTH;
const TPY = TPM * D.MONTHS;
const START_OFFSET = 3 * TPM; // 1980年4月1週から始める

/* ===== 乱数（保存できるように、状態の中に種を持つ） ===== */
export function rand(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = (s) => (s.nextId = (s.nextId || 1) + 1);

/* ===== 日付 ===== */
export function dateOf(t) {
  const a = t + START_OFFSET;
  const year = D.START_YEAR + Math.floor(a / TPY);
  const month = Math.floor((a % TPY) / TPM) + 1;
  const week = Math.floor((a % TPM) / TPW) + 1;
  return { year, month, week, yf: D.START_YEAR + a / TPY };
}
export const dateText = (t) => { const d = dateOf(t); return `${d.year}年 ${d.month}月 ${d.week}週`; };
export const shortDate = (t) => { const d = dateOf(t); return `${d.year}年${d.month}月`; };
export function yen(man) {
  const v = Math.round(man);
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 10000) return `${sign}¥${(a / 10000).toFixed(a >= 100000 ? 0 : 1)}億`;
  return `${sign}¥${a.toLocaleString("ja-JP")}万`;
}
export const units = (n) => {
  n = Math.round(n);
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万本`;
  return `${n.toLocaleString("ja-JP")}本`;
};

/* ===== ゲーム機 ===== */
export function installed(c, yf) {
  const s = yf - c.year;
  if (s < 0) return 0;
  if (s < c.rise) return c.peak * Math.pow(Math.max(s, 0.25) / c.rise, 1.4);
  if (s < c.life) return c.peak * (1 - 0.55 * Math.pow((s - c.rise) / (c.life - c.rise), 2));
  return c.peak * 0.45 * Math.exp(-(s - c.life) * 1.2);
}
export function consolesOn(t) {
  const yf = dateOf(t).yf;
  return D.CONSOLES.filter((c) => yf >= c.year && installed(c, yf) >= 3);
}
export const consoleOf = (k) => D.CONSOLES.find((c) => c.key === k);

/* ===== 時代が求める出来 ===== */
export const eraNeed = (yf) => 1 + 0.15 * (yf - D.START_YEAR) + 0.006 * Math.pow(yf - D.START_YEAR, 2);

/* ===== 社員を作る ===== */
const LOOKS = { skin: 3, hair: 7, shirt: 7, style: 6 };
function makeLook(s) {
  return { skin: ri(s, 0, 2), hair: ri(s, 0, 6), shirt: ri(s, 0, 6), style: ri(s, 0, 5), face: pick(s, ["smile", "smile", "neutral", "smileeye"]), glasses: rand(s) < 0.2 ? 1 : 0 };
}
export function makePerson(s, opt = {}) {
  const role = opt.role || pick(s, D.ROLES.slice(0, 4)).key;
  const main = D.roleOf(role).stat;
  const yf = dateOf(s.t).yf;
  const lvl = opt.level ?? 18;
  const stats = {};
  for (const st of D.STATS) stats[st.key] = clamp(Math.round(3 + rand(s) * lvl * 0.55), 1, 99);
  stats[main] = clamp(Math.round(lvl + rand(s) * 22 - 4), 5, 95);
  // たまに、本職以外にも得意なものがある（「実は絵もうまい」）
  if (rand(s) < 0.3) { const k = pick(s, D.STATS).key; if (k !== main) stats[k] = clamp(Math.round(lvl * 0.8 + rand(s) * 18), 5, 90); }
  const age = opt.age ?? ri(s, 21, 38);
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const salary = Math.round(8 + stats[main] * 0.22 + total * 0.02 + (age - 20) * 0.15 + (yf - D.START_YEAR) * 0.4);
  // 同じ名前の人が重ならないようにする
  const taken = new Set([...(s.staff || []), ...(s.candidates || [])].map((x) => x.fam + x.given));
  let fam, given, k = 0;
  do { fam = pick(s, D.FAMILY); given = pick(s, D.GIVEN); } while (taken.has(fam + given) && ++k < 20);
  return {
    id: uid(s), fam, given, age, role, stats, salary,
    stamina: 100, mood: 70, trait: pick(s, D.TRAITS).key, exp: 0, rank: 0,
    pot: +(0.75 + rand(s) * 0.7).toFixed(2), look: makeLook(s), team: null, rest: false, low: 0, awake: 0, hiredT: s.t,
  };
}
export const fullName = (p) => `${p.fam} ${p.given}`;
// お知らせでの呼び方：ふつうは名字だけ。同じ名字の社員がいるときは下の名前まで
export const callName = (s, p) => (s.staff.some((q) => q !== p && q.fam === p.fam) ? `${p.fam}${p.given}` : p.fam);

/* ===== はじめる ===== */
export function newGame(company, boss, seed = Date.now() >>> 0) {
  const s = {
    v: 1, seed, nextId: 1, t: 0, company, boss, money: 300, fame: 0, office: 0,
    staff: [], teams: [{ id: 1, name: "第1チーム", leader: null, delegate: false }], projects: [], contracts: [], offers: [],
    games: [], rivalGames: [], candidates: [], log: [], pending: [], fx: [],
    loan: 0, loanDue: null, warned: false, goalIdx: 0, goalsDone: [], award: [], trend: null,
    year: { revenue: 0, expense: 0, start: 0 }, months: [], ranking: [], rivals: D.RIVALS.map((r) => ({ key: r.key, name: r.name, power: r.power, rev: [], next: 0 })),
    gameCount: 0, sound: true, myRev: [],
  };
  s.nextId = 2;
  s.rivals.forEach((r) => (r.next = ri(s, 4, 26)));
  newTrend(s);
  s.candidates = recruitPool(s, 3, true);
  return s;
}

/* ===== 記録とお知らせ（問67・問71） ===== */
export function note(s, text, opt = {}) {
  s.log.unshift({ t: s.t, text, big: !!opt.big });
  if (s.log.length > 300) s.log.length = 300;
  s.unread = (s.unread || 0) + 1;
  if (opt.bubble !== false) s.fx.push({ kind: "bubble", text, who: opt.who ?? null });
}
const popFx = (s, who, text, color) => s.fx.push({ kind: "pop", who, text, color });

/* ===== 募集（問21） ===== */
export const recruitCost = (s) => 20 * (s.office + 1);
function hrPower(s) { return Math.max(0, ...s.staff.filter((p) => p.role === "hr").map((p) => p.stats.hire)); }
function prPower(s) { return Math.max(0, ...s.staff.filter((p) => p.role === "pr").map((p) => p.stats.pr)); }
function salesPower(s) { return Math.max(0, ...s.staff.filter((p) => p.role === "sales").map((p) => p.stats.sales)); }
function recruitPool(s, n, first = false) {
  const yf = dateOf(s.t).yf;
  const lvl = 16 + s.fame * 0.35 + hrPower(s) * 0.2 + (yf - D.START_YEAR) * 1.2;
  const out = [];
  const roles = first ? ["planner", "programmer", "designer"] : null;
  for (let i = 0; i < n; i++) {
    const role = roles ? roles[i] : rand(s) < 0.75 ? pick(s, D.ROLES.slice(0, 4)).key : pick(s, D.ROLES.slice(4)).key;
    const p = makePerson(s, { role, level: lvl + rand(s) * 8 });
    p.until = s.t + 6 * TPW;
    out.push(p);
  }
  return out;
}
export function recruit(s) {
  const cost = recruitCost(s);
  if (s.money < cost) return { ok: false, why: `お金が足りません。あと${yen(cost - s.money)}です` };
  spend(s, cost, "募集");
  const n = 3 + (hrPower(s) >= 40 ? 1 : 0) + (hrPower(s) >= 70 ? 1 : 0);
  s.candidates = recruitPool(s, n);
  note(s, `求人を出した。${n}人から応募があった`, { bubble: false });
  return { ok: true };
}
export const capLeft = (s) => D.OFFICES[s.office].cap - s.staff.length;
export function hire(s, id) {
  const p = s.candidates.find((c) => c.id === id);
  if (!p) return { ok: false, why: "この人はもういません" };
  if (capLeft(s) <= 0) return { ok: false, why: "机が空いていません。引っ越すと増えます" };
  s.candidates = s.candidates.filter((c) => c.id !== id);
  delete p.until;
  p.hiredT = s.t;
  p.team = D.roleOf(p.role).dev ? s.teams[0].id : null;
  s.staff.push(p);
  note(s, `${callName(s, p)}が入社した（${D.roleOf(p.role).name}）`, { who: p.id });
  return { ok: true };
}

/* ===== お金 ===== */
function spend(s, man, what) { s.money -= man; s.year.expense += man; s.monthOut = (s.monthOut || 0) + man; }
function earn(s, man) { s.money += man; s.year.revenue += man; s.monthIn = (s.monthIn || 0) + man; }
export const loanLimit = (s) => D.LOAN_LIMIT[s.office] + Math.floor(s.fame * 20);
export function borrow(s, man) {
  man = Math.min(man, loanLimit(s) - s.loan);
  if (man <= 0) return { ok: false, why: "これ以上は借りられません" };
  s.loan += man; s.money += man; s.loanDue = s.t + 24 * TPM;
  note(s, `銀行から${yen(man)}借りた。返す期限は${shortDate(s.loanDue)}`, { bubble: false });
  return { ok: true };
}
export function repay(s, man) {
  man = Math.min(man, s.loan, s.money);
  if (man <= 0) return { ok: false, why: "返せるお金がありません" };
  s.loan -= man; s.money -= man;
  if (s.loan <= 0.5) { s.loan = 0; s.loanDue = null; note(s, "借金を全部返した", { bubble: false }); }
  return { ok: true };
}
export const monthlyCost = (s) => s.staff.reduce((a, p) => a + p.salary, 0) + D.OFFICES[s.office].rent + s.loan * D.LOAN_RATE / 12;

/* ===== 引っ越し（問36） ===== */
export function canMove(s) {
  const n = s.office + 1;
  if (n >= D.OFFICES.length) return { ok: false, why: "この先の事務所は、つぎの版で足します" };
  const o = D.OFFICES[n];
  if (s.money < o.move) return { ok: false, why: `お金が足りません。あと${yen(o.move - s.money)}です` };
  return { ok: true, office: o };
}
export function move(s) {
  const c = canMove(s);
  if (!c.ok) return c;
  spend(s, c.office.move, "引っ越し");
  s.office++;
  note(s, `${c.office.name}に引っ越した`, { big: true });
  return { ok: true };
}

/* ===== チーム（問45・問54） ===== */
export const teamCanAdd = (s) => s.staff.length >= 8 && s.teams.length < 3;
export function addTeam(s) {
  if (!teamCanAdd(s)) return { ok: false, why: "社員が8人になると、チームを増やせます" };
  const id = Math.max(...s.teams.map((t) => t.id)) + 1;
  s.teams.push({ id, name: `第${s.teams.length + 1}チーム`, leader: null, delegate: false });
  return { ok: true, id };
}
export const teamMembers = (s, teamId) => s.staff.filter((p) => p.team === teamId && D.roleOf(p.role).dev);
export const teamBusy = (s, teamId) => s.projects.some((x) => x.team === teamId) || s.contracts.some((x) => x.team === teamId);
export function setLeader(s, teamId, pid) {
  const tm = s.teams.find((t) => t.id === teamId);
  const p = s.staff.find((x) => x.id === pid);
  if (!tm) return { ok: false };
  if (pid == null) { tm.leader = null; tm.delegate = false; return { ok: true }; }
  if (!p || p.rank < D.LEADER_RANK) return { ok: false, why: "リーダーになれるのは課長からです" };
  s.teams.forEach((t) => { if (t.leader === pid) t.leader = null; });
  tm.leader = pid;
  if (D.roleOf(p.role).dev) p.team = teamId;
  note(s, `${callName(s, p)}が${tm.name}のリーダーになった`, { who: pid });
  return { ok: true };
}
export function transfer(s, pid, teamId) {
  const p = s.staff.find((x) => x.id === pid);
  if (!p || !D.roleOf(p.role).dev) return { ok: false, why: "チームに入れるのは、作る職種の社員だけです" };
  if (p.team === teamId) return { ok: true };
  if (s.projects.some((x) => x.members.includes(pid)) || s.contracts.some((x) => x.members.includes(pid))) return { ok: false, why: "いまの仕事が終わってからにしてください" };
  s.teams.forEach((t) => { if (t.leader === pid) t.leader = null; });
  p.team = teamId;
  return { ok: true };
}
export function changeRole(s, pid, role) {
  const p = s.staff.find((x) => x.id === pid);
  if (!p) return { ok: false };
  if (s.projects.some((x) => x.members.includes(pid)) || s.contracts.some((x) => x.members.includes(pid))) return { ok: false, why: "いまの仕事が終わってからにしてください" };
  p.role = role;
  p.team = D.roleOf(role).dev ? (p.team ?? s.teams[0].id) : null;
  s.teams.forEach((t) => { if (t.leader === pid && !D.roleOf(role).dev) t.leader = null; });
  note(s, `${callName(s, p)}が${D.roleOf(role).name}になった`, { who: pid, bubble: false });
  return { ok: true };
}

/* ===== 流行り・相性 ===== */
function newTrend(s) {
  const yf = dateOf(s.t).yf;
  const gs = D.GENRES.filter((g) => g.from <= yf);
  s.trend = { genre: pick(s, gs).key, theme: pick(s, D.THEMES).key, year: dateOf(s.t).year };
}
export function compat(s, g, th) {
  const T = D.THEMES.find((x) => x.key === th);
  let v = T.good.includes(g) ? 3 : T.bad.includes(g) ? 0 : ((g.charCodeAt(0) * 7 + th.charCodeAt(1) * 3 + g.length) % 2) + 1;
  if (s.trend?.genre === g) v += 0.6;
  if (s.trend?.theme === th) v += 0.6;
  return v;
}
export const genresOn = (s) => D.GENRES.filter((g) => g.from <= dateOf(s.t).yf);

/* ===== 企画（問16） ===== */
const MITATE_LINE = {
  "◎": ["これは当たる気がします", "{genre}と{theme}、合うと思うんです", "自信あります"],
  "○": ["手堅くいけると思います", "悪くないはずです", "無難ですが、外さないです"],
  "△": ["当たれば大きい。かも……", "ちょっと冒険です", "正直、読めません"],
};
const TREND_LINE = ["{x}は今、来てます", "{x}、流行りかけです"];
export function planner(s, teamId) {
  const ms = teamMembers(s, teamId);
  return ms.sort((a, b) => b.stats.plan - a.stats.plan)[0] || null;
}
export function proposals(s, teamId) {
  const pl = planner(s, teamId);
  const skill = pl ? pl.stats.plan : 15;
  const gs = genresOn(s);
  const out = [];
  const seen = new Set();
  while (out.length < 3) {
    const g = pick(s, gs).key, th = pick(s, D.THEMES).key;
    if (seen.has(g + th)) continue;
    seen.add(g + th);
    const real = compat(s, g, th);
    const err = (rand(s) - 0.5) * 3 * (1 - skill / 110);
    const seen2 = real + err;
    const mark = seen2 >= 2.6 ? "◎" : seen2 >= 1.4 ? "○" : "△";
    const G = D.GENRES.find((x) => x.key === g), T = D.THEMES.find((x) => x.key === th);
    let line = pick(s, MITATE_LINE[mark]);
    if (mark !== "△" && (s.trend.genre === g || s.trend.theme === th) && rand(s) < 0.7) line = pick(s, TREND_LINE).replace("{x}", s.trend.theme === th ? T.name : G.name);
    out.push({ genre: g, theme: th, mark, line: line.replace("{genre}", G.name).replace("{theme}", T.name) });
  }
  return { planner: pl ? pl.id : null, ideas: out };
}
export function makeTitle(s, g, th) {
  const T = D.THEMES.find((x) => x.key === th);
  const used = new Set([...s.games, ...s.rivalGames].map((x) => x.title));
  for (let i = 0; i < 30; i++) {
    const t = pick(s, T.words) + pick(s, D.GENRE_TAIL[g]);
    if (!used.has(t)) return t;
  }
  return pick(s, T.words) + pick(s, D.GENRE_TAIL[g]) + (s.gameCount + 2);
}

/* ===== 開発（問12・問18） ===== */
export function startProject(s, o) {
  // o: {genre, theme, size, console, team, members, title}
  const size = D.SIZES.find((x) => x.key === o.size), con = consoleOf(o.console);
  const cost = size.cost + con.fee;
  if (s.money < cost) return { ok: false, why: `お金が足りません。あと${yen(cost - s.money)}です` };
  if (!o.members.length) return { ok: false, why: "担当を選んでください" };
  if (teamBusy(s, o.team)) return { ok: false, why: "このチームは仕事中です" };
  spend(s, cost, "開発費");
  const nBr = size.key === "small" ? 2 : 3;
  const at = nBr === 2 ? [0.35, 0.7] : [0.25, 0.5, 0.78];
  const pj = {
    id: uid(s), title: o.title, genre: o.genre, theme: o.theme, size: o.size, console: o.console, team: o.team, members: o.members.slice(),
    ticks: size.weeks * TPW, done: 0, pts: { fun: 0, gfx: 0, snd: 0, vol: 0 }, mult: { fun: 1, gfx: 1, snd: 1, vol: 1 },
    brAt: at, brDone: 0, choices: [], startT: s.t, cost,
  };
  s.projects.push(pj);
  note(s, `『${pj.title}』を作りはじめた`, { bubble: false });
  return { ok: true, id: pj.id };
}
export const progress = (pj) => clamp(pj.done / pj.ticks, 0, 1);
function workPower(s, p) {
  const tr = D.traitOf(p.trait);
  let w = tr.work;
  if (tr.swing) w *= 1 + (rand(s) - 0.5) * 2 * tr.swing;
  const st = p.stamina < 20 ? 0.45 : p.stamina < 45 ? 0.8 : 1;
  const md = 0.75 + p.mood / 200;
  return p.rest ? 0 : w * st * md;
}
function leaderBonus(s, teamId) {
  const tm = s.teams.find((t) => t.id === teamId);
  const L = tm && tm.leader ? s.staff.find((p) => p.id === tm.leader) : null;
  return L ? 1 + L.stats.plan / 500 + L.rank * 0.02 : 1;
}
const CHAN = { plan: "fun", prog: "fun", design: "gfx", sound: "snd" };
function contribute(s, pj, p) {
  const w = workPower(s, p);
  if (w <= 0) return;
  const r = D.roleOf(p.role);
  const lb = leaderBonus(s, pj.team);
  const n = pj.members.length;
  const eff = 1 / (1 + 0.14 * (n - 1)); // 人が増えるほど、話し合いに時間をとられる
  const main = (p.stats[r.stat] / 10) * w * lb * eff;
  const add = (ch, v) => (pj.pts[ch] += v);
  if (r.key === "planner") { add("fun", main); add("vol", main * 0.35); }
  else if (r.key === "programmer") { add("fun", main * 0.65); add("vol", main * 0.55); }
  else if (r.key === "designer") add("gfx", main);
  else if (r.key === "sounder") add("snd", main);
  // 本職以外の腕も少し効く
  for (const k of ["plan", "prog", "design", "sound"]) if (k !== r.stat) add(CHAN[k], (p.stats[k] / 10) * w * eff * 0.22);
  const q = D.traitOf(p.trait).quality;
  if (q) for (const ch in pj.pts) pj.pts[ch] *= 1 + (q - 1) / pj.ticks;
  // ときどき、頭の上に数字を出す（問60）
  if (rand(s) < 0.12) {
    const lbl = r.key === "designer" ? "絵" : r.key === "sounder" ? "音" : r.key === "programmer" && rand(s) < 0.4 ? "量" : "面白さ";
    popFx(s, p.id, `${lbl}+${Math.max(1, Math.round(main * 2))}`, r.key === "designer" || r.key === "sounder" ? "b" : "");
  }
}
export function expected(s, pj) {
  const size = D.SIZES.find((x) => x.key === pj.size);
  const need = eraNeed(dateOf(pj.startT).yf) * size.pts;
  return { fun: 175 * need, gfx: 112 * need, snd: 77 * need, vol: 80 * need };
}
export function quality(s, pj) {
  const e = expected(s, pj), q = {};
  for (const k in e) q[k] = (pj.pts[k] * pj.mult[k]) / e[k];
  return q;
}
function branchOptions(s, pj) {
  const pool = D.BRANCHES.filter((b) => !pj.choices.includes(b.key));
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand(s) * pool.length), 1)[0]);
  if (pj.brDone === pj.brAt.length - 1 && !out.some((b) => b.key === "fast") && !pj.choices.includes("fast")) out[2] = D.BRANCHES.find((b) => b.key === "fast");
  return out.map((b) => b.key);
}
export function chooseBranch(s, pjId, key, auto = false) {
  const pj = s.projects.find((x) => x.id === pjId);
  if (!pj) return;
  const b = D.BRANCHES.find((x) => x.key === key);
  for (const k in b.effect) pj.mult[k] *= b.effect[k];
  pj.ticks = Math.max(pj.done + TPW, pj.ticks + b.weeks * TPW);
  pj.choices.push(key);
  pj.brDone++;
  pj.waiting = false;
  if (auto) {
    const tm = s.teams.find((t) => t.id === pj.team);
    const L = s.staff.find((p) => p.id === tm.leader);
    note(s, `${L ? callName(s, L) : "リーダー"}が「${b.label}」を選んだ`, { bubble: false });
  }
}
function autoBranch(s, pj, opts) {
  const q = quality(s, pj);
  const weakest = ["fun", "gfx", "snd", "vol"].sort((a, b) => q[a] - q[b])[0];
  const pickKey = opts.find((k) => D.BRANCHES.find((b) => b.key === k).effect[weakest] > 1) || opts.find((k) => k === "polish") || opts[0];
  chooseBranch(s, pj.id, pickKey, true);
}

/* ===== 発売とレビュー（問15・問41・問73） ===== */
const f10 = (q) => 10 * (1 - Math.exp(-0.72 * Math.max(0, q)));
export function review(s, pj) {
  const q = quality(s, pj);
  const c = compat(s, pj.genre, pj.theme);
  const cm = [0.78, 0.95, 1.08, 1.2, 1.28, 1.34][Math.min(5, Math.round(c))];
  const qa = { fun: f10(q.fun), gfx: f10(q.gfx), snd: f10(q.snd), vol: f10(q.vol), combo: 10 * (cm - 0.5) / 0.84 };
  const G = D.GENRES.find((x) => x.key === pj.genre), T = D.THEMES.find((x) => x.key === pj.theme);
  const fill = (tx) => tx.replace("{gbit}", G.bit).replace("{tbit}", T.bit).replace("{theme}", T.name).replace("{genre}", G.name);
  // 少し前に使った言い回しは避ける（同じ文のくり返しはAIっぽく見える）
  s.recentLines = s.recentLines || [];
  const fresh = (arr) => { const ok = arr.filter((x) => !s.recentLines.includes(x)); const v = pick(s, ok.length ? ok : arr); s.recentLines.push(v); if (s.recentLines.length > 30) s.recentLines.shift(); return v; };
  return D.CRITICS.map((cr) => {
    let sum = 0, wsum = 0;
    for (const k of ["fun", "gfx", "snd", "vol"]) { sum += cr.look[k] * qa[k]; wsum += cr.look[k]; }
    let v = (sum / wsum) * Math.pow(cm, cr.look.combo) + (rand(s) - 0.5) * 1.6;
    const score = clamp(Math.round(v), 1, 10);
    // 感想：いちばん良いところと、いちばん惜しいところ
    const ranked = Object.keys(qa).map((k) => ({ k, v: qa[k] * cr.look[k] / 1.2 + (rand(s) - 0.5) })).sort((a, b) => b.v - a.v);
    const best = ranked[0].k, worst = ranked[ranked.length - 1].k;
    let text;
    if (score >= 9) text = fill(fresh(cr.lines[best].good)) + fresh(cr.top);
    else if (score <= 3) text = fill(fresh(cr.lines[worst].bad)) + fresh(cr.low);
    else text = fill(fresh(cr.lines[best].good)) + fill(fresh(cr.lines[worst].bad));
    return { name: cr.name, score, text };
  });
}
export function hypeOf(s, pj) {
  const size = D.SIZES.find((x) => x.key === pj.size);
  const v = 1 + s.fame / 25 + prPower(s) / 28 + (size.key === "big" ? 0.8 : size.key === "mid" ? 0.3 : 0) + (pj.series ? 0.5 : 0);
  return clamp(Math.round(v), 1, 5);
}
function firstWeek(s, g, yf) {
  const con = consoleOf(g.console);
  const B = installed(con, yf) * 10000;
  const size = D.SIZES.find((x) => x.key === g.size);
  const Q = g.total / 40;
  const G = D.GENRES.find((x) => x.key === g.genre);
  const appeal = Math.pow(Q, 2.2) * 1.4 * size.sales * (1 + g.hype * 0.12) * (1 + s.fame / 250) * G.size;
  return B * 0.004 * appeal;
}
function release(s, pj) {
  s.projects = s.projects.filter((x) => x !== pj);
  const revs = review(s, pj);
  const total = revs.reduce((a, r) => a + r.score, 0);
  const g = {
    id: uid(s), title: pj.title, genre: pj.genre, theme: pj.theme, size: pj.size, console: pj.console, team: pj.team, members: pj.members,
    reviews: revs, total, releaseT: s.t, weekly: [], sold: 0, revenue: 0, active: true, hype: hypeOf(s, pj), cost: pj.cost, mine: true,
  };
  const yf = dateOf(s.t).yf;
  g.preorder = Math.round(firstWeek(s, { ...g, total: 24 }, yf) * 0.5 * (1 + g.hype * 0.1));
  s.games.unshift(g);
  s.gameCount++;
  s.fame = clamp(s.fame + (total - 22) / 6, 0, 100);
  // 社員が伸びる（問22）・覚醒（問26）
  const size = D.SIZES.find((x) => x.key === pj.size);
  let awake = null;
  for (const id of pj.members) {
    const p = s.staff.find((x) => x.id === id);
    if (!p) continue;
    const main = D.roleOf(p.role).stat;
    const ageF = p.age < 25 ? 1.3 : p.age < 35 ? 1 : p.age < 45 ? 0.7 : 0.4;
    const tr = D.traitOf(p.trait);
    const gain = size.exp * (1.5 + total / 12) * p.pot * ageF * (0.6 + rand(s) * 0.8) * (tr.grow || 1) * (1 - p.stats[main] / 115);
    p.stats[main] = clamp(Math.round(p.stats[main] + gain), 1, 99);
    for (const k of ["plan", "prog", "design", "sound"]) if (k !== main && rand(s) < 0.35) p.stats[k] = clamp(p.stats[k] + 1, 1, 99);
    gainExp(s, p, 25 * size.exp + total);
    p.mood = clamp(p.mood + (total - 20) * 0.8, 0, 100);
    const ch = 0.05 * p.pot * (total / 22) * (p.stats[main] < 88 ? 1 : 0) * (s.t - p.awake > TPY ? 1 : 0);
    if (!awake && rand(s) < ch) {
      const before = p.stats[main];
      p.stats[main] = clamp(before + ri(s, 8, 15), 1, 99);
      p.awake = s.t;
      awake = { kind: "awake", pid: p.id, stat: main, before, after: p.stats[main] };
    }
  }
  s.pending.push({ kind: "review", gid: g.id });
  if (awake) s.pending.push(awake);
}
function gainExp(s, p, v) {
  p.exp += v;
  const next = D.RANKS[p.rank + 1];
  if (next && p.exp >= next.exp) {
    p.rank++;
    p.salary = Math.round(p.salary * next.pay / D.RANKS[p.rank - 1].pay);
    note(s, `${callName(s, p)}が${next.name}になった`, { who: p.id });
  }
}

/* ===== 売れ行き（毎週） ===== */
function weeklySales(s) {
  const yf = dateOf(s.t).yf;
  const decayBase = 0.78 + salesPower(s) / 1000;
  for (const g of s.games) {
    if (!g.active) continue;
    const wk = g.weekly.length;
    let n;
    if (wk === 0) n = firstWeek(s, g, yf) * (0.85 + rand(s) * 0.3);
    else n = g.weekly[wk - 1] * Math.min(0.94, decayBase + (g.total >= 32 ? 0.05 : 0)) * (0.92 + rand(s) * 0.16);
    n = Math.round(n);
    const before = g.sold;
    g.weekly.push(n);
    g.sold += n;
    const con = consoleOf(g.console);
    const money = n * D.CONSOLE_PRICE[con.kind];
    g.revenue += money;
    earn(s, money);
    s.myRev.push({ t: s.t, v: money });
    if (wk === 0) note(s, `『${g.title}』の初週は${units(n)}`);
    for (const m of [10000, 100000, 1000000]) if (before < m && g.sold >= m) note(s, `『${g.title}』が${units(m)}を超えた！`, { big: true });
    if ((n < 30 && wk > 3) || wk > 104) { g.active = false; note(s, `『${g.title}』の売れ行きが止まった。合わせて${units(g.sold)}`, { bubble: false }); }
  }
  // ライバル
  for (const g of s.rivalGames) {
    if (!g.active) continue;
    const wk = g.weekly.length;
    const n = Math.round(wk === 0 ? firstWeek(s, g, yf) * (0.8 + rand(s) * 0.4) : g.weekly[wk - 1] * (0.84 + rand(s) * 0.08));
    g.weekly.push(n);
    g.sold += n;
    const r = s.rivals.find((x) => x.key === g.rival);
    r.rev.push({ t: s.t, v: n * D.CONSOLE_PRICE[consoleOf(g.console).kind] });
    if (n < 30 && wk > 3) g.active = false;
  }
  const all = [...s.games, ...s.rivalGames].filter((g) => g.active && g.weekly.length);
  s.ranking = all.map((g) => ({ id: g.id, title: g.title, who: g.mine ? s.company : s.rivals.find((r) => r.key === g.rival).name, mine: !!g.mine, n: g.weekly[g.weekly.length - 1] }))
    .sort((a, b) => b.n - a.n).slice(0, 10);
  s.rivalGames = s.rivalGames.filter((g) => g.active || s.t - g.releaseT < TPY);
  const cut = s.t - TPY;
  s.myRev = s.myRev.filter((x) => x.t > cut);
  for (const r of s.rivals) r.rev = r.rev.filter((x) => x.t > cut);
}
function rivalTurn(s) {
  const yf = dateOf(s.t).yf;
  for (const r of s.rivals) {
    if (--r.next > 0) continue;
    const R = D.RIVALS.find((x) => x.key === r.key);
    const gs = genresOn(s).filter((g) => R.genres.includes(g.key));
    const genre = (gs.length ? pick(s, gs) : pick(s, genresOn(s))).key;
    const theme = pick(s, D.THEMES).key;
    const cons = consolesOn(s.t).sort((a, b) => installed(b, yf) - installed(a, yf));
    const con = cons[0];
    const size = rand(s) < 0.15 * r.power ? "big" : rand(s) < 0.5 ? "mid" : "small";
    const total = clamp(Math.round(14 + r.power * 9 + (rand(s) - 0.5) * 16 + compat(s, genre, theme) * 1.2), 6, 39);
    const g = { id: uid(s), title: makeTitle(s, genre, theme), genre, theme, size, console: con.key, total, hype: clamp(Math.round(r.power * 2.5), 1, 5), weekly: [], sold: 0, active: true, rival: r.key, releaseT: s.t };
    s.rivalGames.push(g);
    if (rand(s) < 0.6) note(s, `${r.name}が新作『${g.title}』を出した`, { bubble: rand(s) < 0.5 });
    r.next = ri(s, 14, 30);
    r.power = Math.min(2.2, r.power * (1 + (rand(s) - 0.35) * 0.03));
  }
}
export function industry(s) {
  const from = s.t - TPY;
  const mine = s.myRev.filter((x) => x.t > from).reduce((a, b) => a + b.v, 0);
  const list = s.rivals.map((r) => ({ name: r.name, v: r.rev.filter((x) => x.t > from).reduce((a, b) => a + b.v, 0) + 200 * r.power, mine: false }));
  list.push({ name: s.company, v: mine, mine: true });
  return list.sort((a, b) => b.v - a.v);
}
export const myRank = (s) => industry(s).findIndex((x) => x.mine) + 1;

/* ===== 受託の仕事（問31） ===== */
function maybeOffer(s) {
  s.offers = s.offers.filter((o) => o.until > s.t);
  const sp = salesPower(s);
  const chance = 0.06 + sp / 600;
  if (s.offers.length >= 2 || rand(s) > chance) return;
  const yf = dateOf(s.t).yf;
  const weeks = ri(s, 4, 10);
  const o = {
    id: uid(s), title: pick(s, D.CONTRACTS).replace("{c}", pick(s, D.CLIENTS)), weeks,
    pay: Math.round(weeks * (7 + rand(s) * 5) * eraNeed(yf) * (1 + sp / 150)), until: s.t + 5 * TPW,
  };
  s.offers.push(o);
  note(s, `受託の仕事が来た。${o.title}`, { bubble: true });
}
export function takeOffer(s, oid, teamId) {
  const o = s.offers.find((x) => x.id === oid);
  if (!o) return { ok: false, why: "もう締め切られました" };
  if (teamBusy(s, teamId)) return { ok: false, why: "このチームは仕事中です" };
  const ms = teamMembers(s, teamId);
  if (!ms.length) return { ok: false, why: "チームに作る職種の社員がいません" };
  s.offers = s.offers.filter((x) => x !== o);
  s.contracts.push({ id: o.id, title: o.title, pay: o.pay, team: teamId, members: ms.map((p) => p.id), ticks: o.weeks * TPW, done: 0 });
  note(s, `受託の仕事を受けた。${o.title}`, { bubble: false });
  return { ok: true };
}

/* ===== 1tickすすめる ===== */
export function tick(s) {
  if (s.over) return;
  s.t++;
  const busy = new Set();
  for (const pj of s.projects) {
    if (pj.waiting) continue;
    for (const id of pj.members) { const p = s.staff.find((x) => x.id === id); if (p) { busy.add(p.id); contribute(s, pj, p); gainExp(s, p, 0.25); } }
    pj.done++;
    if (pj.brDone < pj.brAt.length && progress(pj) >= pj.brAt[pj.brDone]) {
      const opts = branchOptions(s, pj);
      const tm = s.teams.find((t) => t.id === pj.team);
      if (tm.delegate && tm.leader) autoBranch(s, pj, opts);
      else { pj.waiting = true; s.pending.push({ kind: "branch", pid: pj.id, opts }); }
    }
    if (pj.done >= pj.ticks && !pj.waiting) release(s, pj);
  }
  for (const c of s.contracts) {
    for (const id of c.members) { const p = s.staff.find((x) => x.id === id); if (p) { busy.add(p.id); gainExp(s, p, 0.15); } }
    c.done++;
    if (c.done >= c.ticks) {
      earn(s, c.pay);
      note(s, `受託の仕事が終わった。${yen(c.pay)}が入った`);
      for (const id of c.members) { const p = s.staff.find((x) => x.id === id); if (p) { const m = D.roleOf(p.role).stat; if (rand(s) < 0.5) p.stats[m] = clamp(p.stats[m] + 1, 1, 99); } }
    }
  }
  s.contracts = s.contracts.filter((c) => c.done < c.ticks);
  // 体力（問27）
  for (const p of s.staff) {
    const tr = D.traitOf(p.trait);
    const working = busy.has(p.id) || (!D.roleOf(p.role).dev && (s.projects.length > 0));
    if (p.rest) { p.stamina = Math.min(100, p.stamina + 4); if (p.stamina >= 70) p.rest = false; }
    else if (working) { p.stamina = Math.max(0, p.stamina - 0.55 * tr.tire); if (p.stamina < 8) { p.rest = true; note(s, `${callName(s, p)}が疲れて休んでいる`, { who: p.id }); } }
    else p.stamina = Math.min(100, p.stamina + 1.6);
    // ひらめき（問26）
    if (busy.has(p.id) && rand(s) < 0.0025 * (tr.spark || 1)) {
      const k = D.roleOf(p.role).stat;
      p.stats[k] = clamp(p.stats[k] + ri(s, 1, 2), 1, 99);
      s.fx.push({ kind: "spark", who: p.id });
      note(s, `${callName(s, p)}がひらめいた。${D.STATS.find((x) => x.key === k).name}が上がった`, { who: p.id });
    }
  }
  if (s.t % TPW === 0) weekly(s);
}
function weekly(s) {
  const d = dateOf(s.t);
  weeklySales(s);
  rivalTurn(s);
  maybeOffer(s);
  s.candidates = s.candidates.filter((c) => c.until > s.t);
  // やる気
  for (const p of [...s.staff]) {
    const tr = D.traitOf(p.trait);
    const kind = s.staff.some((q) => q !== p && D.traitOf(q.trait).team) ? 0.4 : 0;
    const fair = p.salary - (6 + p.stats[D.roleOf(p.role).stat] * 0.25);
    p.mood = clamp(p.mood + (62 - p.mood) * 0.04 + kind + (fair < 0 ? -0.5 : 0) + (p.stamina < 20 ? -0.8 : 0), 0, 100);
    p.low = p.mood < 18 ? p.low + 1 : 0;
    if (p.low >= 8 && rand(s) < 0.25 - hrPower(s) / 500) quit(s, p, `${callName(s, p)}が会社を辞めた`);
  }
  const m = d.week === 1;
  if (m) monthly(s, d);
  if (d.month === 12 && d.week === 4) yearEnd(s, d);
  if (d.month === 1 && d.week === 1) { newTrend(s); const G = D.GENRES.find((x) => x.key === s.trend.genre), T = D.THEMES.find((x) => x.key === s.trend.theme); note(s, `今年は${G.name}と${T.name}が流行っているらしい`, { bubble: false }); for (const p of s.staff) p.age++; }
  if (d.month === 4 && d.week === 1 && s.t > 2) entrance(s, d);
  // 新しいゲーム機
  if (d.month === 1 && d.week === 1) for (const c of D.CONSOLES) if (c.year === d.year) note(s, `新しいゲーム機「${c.name}」が出た`, { big: true });
  // 借金の期限
  if (s.loanDue && s.t >= s.loanDue) {
    if (s.money >= s.loan) { s.money -= s.loan; s.loan = 0; s.loanDue = null; note(s, "借金を期限どおりに返した"); }
    else bankrupt(s, "借金を期限までに返せませんでした。");
  } else if (s.loanDue && s.loanDue - s.t === 3 * TPM) note(s, `借金を返す期限まで、あと3か月。${yen(s.loan)}`, { big: true });
  checkGoals(s);
}
function monthly(s, d) {
  const cost = monthlyCost(s);
  spend(s, cost, "給料と家賃");
  s.months.push({ t: s.t, in: s.monthIn || 0, out: s.monthOut || 0, money: s.money });
  if (s.months.length > 36) s.months.shift();
  s.monthIn = 0; s.monthOut = 0;
  note(s, `給料と家賃を払った。${yen(cost)}`, { bubble: false });
  if (s.money < 0) {
    const need = -s.money + cost * 0.5;
    if (s.loan + need <= loanLimit(s)) { borrow(s, Math.ceil(need)); note(s, "お金が足りないので、銀行から借りた", { big: true }); s.warned = false; }
    else if (!s.warned) { s.warned = true; s.pending.push({ kind: "warn" }); note(s, "お金が足りない。来月も払えないと倒産する", { big: true }); }
    else bankrupt(s, "給料を払えなくなりました。");
  } else s.warned = false;
}
function bankrupt(s, why) { s.over = { why, t: s.t }; s.pending.push({ kind: "bankrupt", why }); }
function quit(s, p, text) {
  s.staff = s.staff.filter((x) => x !== p);
  s.teams.forEach((t) => { if (t.leader === p.id) { t.leader = null; t.delegate = false; } });
  for (const pj of s.projects) pj.members = pj.members.filter((id) => id !== p.id);
  for (const c of s.contracts) c.members = c.members.filter((id) => id !== p.id);
  note(s, text, { big: true });
}
function entrance(s, d) {
  for (const p of [...s.staff]) if (p.age >= 60) quit(s, p, `${callName(s, p)}が定年で会社を去った`);
  if (capLeft(s) <= 0) { note(s, "入社式の季節。机が空いていないので、新卒は採らなかった", { bubble: false }); return; }
  const n = ri(s, 2, 3) + (s.office >= 2 ? 1 : 0);
  const yf = dateOf(s.t).yf;
  const grads = [];
  for (let i = 0; i < n; i++) {
    const p = makePerson(s, { level: 10 + s.fame * 0.2 + (yf - D.START_YEAR) * 0.9 + hrPower(s) * 0.1, age: ri(s, 22, 24) });
    p.salary = Math.round(p.salary * 0.75);
    p.pot = +(p.pot + 0.15).toFixed(2);
    p.until = s.t + TPW;
    grads.push(p);
  }
  s.candidates = [...grads, ...s.candidates];
  s.pending.push({ kind: "entrance", ids: grads.map((g) => g.id) });
}
function yearEnd(s, d) {
  const yearStart = s.t - TPY;
  const mine = s.games.filter((g) => g.releaseT > yearStart);
  const rival = s.rivalGames.filter((g) => g.releaseT > yearStart);
  const all = [...mine, ...rival].sort((a, b) => b.total - a.total || b.sold - a.sold);
  let award = null;
  if (all.length) {
    const w = all[0];
    award = { title: w.title, who: w.mine ? s.company : s.rivals.find((r) => r.key === w.rival).name, mine: !!w.mine, total: w.total, year: d.year };
    s.award.push(award);
    if (award.mine) { s.fame = clamp(s.fame + 10, 0, 100); s.staff.forEach((p) => (p.mood = clamp(p.mood + 12, 0, 100))); }
  }
  const sum = { year: d.year, revenue: s.year.revenue, expense: s.year.expense, games: mine.length, rank: myRank(s) };
  s.lastYear = sum;
  s.year = { revenue: 0, expense: 0, start: s.t };
  s.pending.push({ kind: "yearEnd", award, sum });
}
export function payBonus(s, level) {
  const months = [0, 0.5, 1.5][level];
  const cost = s.staff.reduce((a, p) => a + p.salary, 0) * months;
  if (cost > 0) { spend(s, cost, "ボーナス"); note(s, `ボーナスを払った。${yen(cost)}`, { bubble: false }); }
  const up = [-6, 6, 15][level];
  s.staff.forEach((p) => (p.mood = clamp(p.mood + up, 0, 100)));
}

/* ===== 節目の目標（問37） ===== */
function goalDone(s, key) {
  const best = Math.max(0, ...s.games.map((g) => g.sold));
  const bestRev = Math.max(0, ...s.games.map((g) => g.total));
  switch (key) {
    case "firstRelease": return s.games.length > 0;
    case "staff3": return s.staff.length >= 3;
    case "sell1": return best >= 10000;
    case "office1": return s.office >= 1;
    case "review30": return bestRev >= 30;
    case "year5000": return s.year.revenue >= 5000 || (s.lastYear && s.lastYear.revenue >= 5000);
    case "staff8": return s.staff.length >= 8;
    case "office2": return s.office >= 2;
    case "sell10": return best >= 100000;
    case "rank5": return myRank(s) <= 5 && s.games.length > 0;
    case "award": return s.award.some((a) => a.mine);
    case "sell100": return best >= 1000000;
    case "review40": return bestRev >= 40;
    case "rank1": return myRank(s) === 1 && s.games.length > 0;
  }
  return false;
}
export const currentGoal = (s) => D.GOALS[s.goalIdx] || null;
function checkGoals(s) {
  const g = currentGoal(s);
  if (!g || !goalDone(s, g.key)) return;
  s.goalIdx++;
  s.goalsDone.push({ key: g.key, t: s.t });
  s.money += g.reward;
  s.fame = clamp(s.fame + 2, 0, 100);
  s.pending.push({ kind: "goal", key: g.key, reward: g.reward });
  note(s, `目標「${g.text}」を達成した`, { bubble: false });
}

/* ===== 保存 ===== */
export function serialize(s) { const c = { ...s, fx: [] }; return JSON.stringify(c); }
export function deserialize(txt) {
  const s = JSON.parse(txt);
  if (!s || s.v !== 1 || !Array.isArray(s.staff)) throw new Error("PRESS START の保存ファイルではない");
  s.fx = [];
  return s;
}
