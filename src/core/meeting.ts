/* 経営会議（問113〜116）とメッセージ（問112）と、年の目標（問115・116）
   - 月の終わり（3〜11月）：経理・監督・コーチ・ユースコーチ・スカウトが1人ずつ報告する
   - 12月（表彰式のあと）：年に1回の経営会議。去年のふり返り・営業の報告・目標（監督が3つ出してオーナーが選ぶ）・
     補強の予算・チームの強化方針・いまの不足・コーチの伸びしろの報告（問120）
   - 目標に届いたか：監督の評価・人気・スポンサーが上下する（大きく外れると監督の解任の話） */
import { ensureReg } from './squad';
import { BREAK_WEEKS, SEASON_END } from './calendar';
import { clamp, Rng } from './rng';
import { ovr, teamStrength } from './player';
import { POS, type Pos } from './constants';
import { INCOME_KEYS, EXPENSE_KEYS, sponsorYear, type Ledger } from './finance';
import { STAFF_SUR, STAFF_GIV } from './data/names';
import { monthOf } from './calendar';
import type { Policy } from './match';
import type { GameState } from './game';
import type { Player } from './types';

export type Level = 'むずかしい' | 'ちょうどいい' | 'かんたん';
export interface Goal { tier: number; rank: number; text: string; level: Level; season: number }
export interface MeetItem { role: string; who: string; lines: string[]; ask?: 'goal' | 'budget' | 'policy' }
export interface Meeting { kind: 'month' | 'year'; title: string; items: MeetItem[]; goals?: Goal[]; budgets?: number[]; pick: { goal: number; budget: number; policy: Policy } }
export interface MonthSnap { money: number; led: Ledger; rank: number; w: number; d: number; l: number; a: Record<number, number>; ord: [number, number]; awake: string[]; pop: number; fans: [number, number] }
export interface Msg { id: number; from: string; who: string; title: string; body: string; at: string; read: boolean; pid?: number; kind?: 'wantOut' }

/* ---------- メッセージ（問112） ---------- */
export function mail(G: GameState, from: string, who: string, title: string, body: string, extra: Partial<Msg> = {}) {
  const box = (G.inbox ??= []);
  box.unshift({ id: (G.ids.n++), from, who, title, body, at: `${G.season}年目 ${monthOf(G.week)}月`, read: false, ...extra });
  if (box.length > 60) box.length = 60;
}
export const unread = (G: GameState) => (G.inbox ?? []).filter((m) => !m.read).length;

/* ---------- 報告する人 ---------- */
function staffName(seed: number) { return `${STAFF_SUR[seed % STAFF_SUR.length]} ${STAFF_GIV[(seed * 7 + 3) % STAFF_GIV.length]}`; }
export function ensureMeta(G: GameState) {
  ensureReg(G); fixBreak(G);
  G.front ??= { acct: staffName(G.club.name.length * 13 + 5), sales: staffName(G.club.name.length * 29 + 11) };
  G.mgrEval ??= 60;
  if (!G.goal || G.goal.season !== G.season) G.goal = goalOptions(G, myTierOf(G), G.season)[1];
  if (!G.snap) G.snap = snapshot(G);
}
const myTierOf = (G: GameState) => G.clubs.find((c) => c.me)!.tier;
const sumA = (p: Player) => p.a.reduce((s, v) => s + v, 0) / p.a.length;
const ledSum = (l: Ledger, keys: (keyof Ledger)[]) => keys.reduce((s, k) => s + l[k], 0);
const man = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}億円` : `${Math.round(v).toLocaleString()}万円`);

export function snapshot(G: GameState): MonthSnap {
  const row = G.leagues[myTierOf(G)].table[0];
  const rank = rankOf(G);
  return { money: G.owner.money, led: { ...G.owner.ledger }, rank, w: row.w, d: row.d, l: row.l, a: Object.fromEntries(G.squad.map((p) => [p.id, sumA(p)])), ord: [0, 0], awake: [], pop: G.owner.pop, fans: [0, 0] };
}
function rankOf(G: GameState): number {
  const t = myTierOf(G); const L = G.leagues[t];
  const rows = L.ids.map((id) => ({ id, ...L.table[id] })).sort((a, b) => b.p - a.p || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.id - b.id);
  const pl = rows[0] ? rows[0].w + rows[0].d + rows[0].l : 0;
  return pl ? rows.findIndex((x) => x.id === 0) + 1 : 0;
}

/* ---------- 目標（問115・116） ---------- */
export function goalText(tier: number, rank: number): string {
  if (tier === 1 && rank === 1) return '1部で優勝';
  if (tier > 1 && rank <= 2) return `${tier}部で2位以内に入って昇格`;
  if (tier < 3 && rank >= 10) return `${tier}部に残る（10位以内）`;
  return `${tier}部で${rank}位以内`;
}
/** 監督の見立て：その段で、自分のクラブは力が何番目くらいか */
export function expectedRank(G: GameState, tier: number): number {
  const me = teamStrength(G.squad);
  const others = G.clubs.filter((c) => !c.me && c.tier === tier).map((c) => teamStrength(c.squad)).sort((a, b) => b - a).slice(0, 11);
  return 1 + others.filter((s) => s > me + 0.5).length;
}
/** ahead：12月に来年の目標を出すときは、冬の補強・キャンプ・若手の伸びのぶん、少し上を見る（10シーズンの確かめで合わせた） */
export function goalOptions(G: GameState, tier: number, season: number, ahead = 0): Goal[] {
  const e = expectedRank(G, tier) - ahead; const cap = tier < 3 ? 10 : 12;
  let hard = clamp(e - 3, 1, cap), just = clamp(e, 1, cap), easy = clamp(e + 3, 1, cap);
  if (tier > 1 && hard <= 2) hard = tier === 1 ? hard : 2;
  if (just <= hard) just = Math.min(cap, hard + 2);
  if (easy <= just) easy = Math.min(cap, just + 2);
  if (just <= hard) hard = Math.max(1, just - 1);
  if (easy <= just) just = Math.max(hard + 1, easy - 1);
  const mk = (rank: number, level: Level): Goal => ({ tier, rank, text: goalText(tier, rank), level, season });
  return [mk(hard, 'むずかしい'), mk(just, 'ちょうどいい'), mk(easy, 'かんたん')];
}
/** 年末：今年の目標に届いたか。監督の評価・人気・来年のスポンサーが動く */
export function judgeGoal(G: GameState, tier: number, rank: number): string[] {
  const g = G.goal; if (!g || g.season !== G.season) return [];
  const ok = tier === g.tier ? rank <= g.rank : tier < g.tier;
  const out: string[] = [];
  const o = G.owner;
  if (ok) {
    const [ev, pop, sp] = g.level === 'むずかしい' ? [25, 6, 1.1] : g.level === 'ちょうどいい' ? [15, 4, 1.05] : [8, 2, 1.02];
    G.mgrEval = clamp((G.mgrEval ?? 60) + ev, 0, 100); o.pop = Math.min(100, o.pop + pop); G.spMul = sp;
    out.push(`目標「${g.text}」に届いた！ 監督の評価が上がり、人気とスポンサーの評判も上がった。`);
  } else {
    const d = tier === g.tier ? rank - g.rank : 4;
    G.mgrEval = clamp((G.mgrEval ?? 60) - Math.min(40, 8 + d * 4), 0, 100); o.pop = Math.max(0, o.pop - Math.min(6, 2 + d)); G.spMul = Math.max(0.85, 0.97 - d * 0.02);
    out.push(`目標「${g.text}」に届かなかった（${tier}部 ${rank}位）。監督の評価が下がり、人気とスポンサーの評判も少し下がった。`);
  }
  G.goalLog = [...(G.goalLog ?? []), { season: G.season, text: g.text, level: g.level, ok }];
  return out;
}
export const evalWord = (v: number) => (v >= 80 ? 'とても高い' : v >= 60 ? 'ふつうより上' : v >= 40 ? 'ふつう' : v >= 25 ? '低い' : 'とても低い（解任の話も出ている）');

/** 来年いる段の見こみ（昇格・降格をふまえて） */
function nextTier(G: GameState): number {
  const t = myTierOf(G); const r = rankOf(G) || 6;
  return t > 1 && r <= 2 ? t - 1 : t < 3 && r >= 11 ? t + 1 : t;
}
/** いまの不足：ポジションごとに、先発を任せられる選手が足りないところ */
function gaps(G: GameState): string[] {
  const need: Record<string, [Pos[], number]> = { キーパー: [['GK'], 1], センターバック: [['CB'], 2], サイドバック: [['SB'], 2], 守備的な中盤: [['DM'], 1], 中盤: [['CM', 'AM'], 2], ウイング: [['WG'], 2], フォワード: [['ST'], 1] };
  const top = [...G.squad].map(ovr).sort((a, b) => b - a); const line = top[10] ?? 0;
  const out: string[] = [];
  for (const [k, [ps, n]] of Object.entries(need)) {
    const good = G.squad.filter((p) => ps.includes(p.pos) && ovr(p) >= line - 2 && !p.retiring).length;
    const old = G.squad.filter((p) => ps.includes(p.pos) && (p.age >= 32 || p.retiring)).length;
    if (good < n) out.push(`${k}（先発を任せられる選手が${good}人）`);
    else if (old >= n) out.push(`${k}（ベテランが多い）`);
  }
  void POS; return out;
}

/* ---------- 月の経営会議（問113・114） ---------- */
export function monthMeeting(G: GameState): Meeting {
  const s = G.snap ?? snapshot(G); const o = G.owner;
  const inc = ledSum(o.ledger, INCOME_KEYS) - ledSum(s.led, INCOME_KEYS); const exp = ledSum(o.ledger, EXPENSE_KEYS) - ledSum(s.led, EXPENSE_KEYS);
  const mon = monthOf(G.week);
  const items: MeetItem[] = [];
  items.push({ role: '経理', who: G.front!.acct, lines: [`${mon}月の収支です。入ってきたお金 ${man(inc)}、出ていったお金 ${man(exp)}。差し引き ${inc - exp >= 0 ? '+' : '−'}${man(Math.abs(inc - exp))}。`, `いまのお金は ${man(o.money)}${o.debt ? `、借金が ${man(o.debt)}` : ''}です。${inc - exp < 0 && o.money < 3000 ? '少し苦しくなってきました。' : ''}`] });
  const row = G.leagues[myTierOf(G)].table[0]; const w = row.w - s.w, d = row.d - s.d, l = row.l - s.l; const rk = rankOf(G);
  const nextMatches = G.sched.league.filter((x) => x >= G.week + 1 && x < G.week + 5).length;
  const gl = G.goal;
  const mg: string[] = [];
  mg.push(w + d + l ? `${mon}月のリーグ戦は ${w}勝${d}分${l}敗。順位は${s.rank ? `${s.rank}位から ` : ''}${rk}位${s.rank && rk < s.rank ? 'に上がりました' : s.rank && rk > s.rank ? 'に下がりました' : 'です'}。` : `${mon}月はリーグ戦がありませんでした。`);
  if (s.ord[0]) mg.push(`オーナーの頼みは、${s.ord[0]}つのうち${s.ord[1]}つ聞きました。`);
  if (gl && rk) mg.push(rk <= gl.rank ? `目標の「${gl.text}」には、いまのところ届いています。` : `目標の「${gl.text}」まで、あと${rk - gl.rank}つ順位を上げたい。`);
  if (nextMatches) mg.push(`来月はリーグ戦が${nextMatches}試合あります。${l > w ? '立て直します。' : 'このまま行きます。'}`);
  items.push({ role: '監督', who: G.mgr.name, lines: mg });
  const ups = G.squad.map((p) => ({ p, d: sumA(p) - (s.a[p.id] ?? sumA(p)) })).filter((x) => x.d >= 0.6).sort((a, b) => b.d - a.d).slice(0, 3);
  const cl: string[] = [];
  cl.push(ups.length ? `今月よく伸びたのは ${ups.map((x) => x.p.name).join('、')}。` : '今月は、大きく伸びた選手はいませんでした。');
  if (s.awake.length) cl.push(`${s.awake.join('、')} が覚醒しました！`);
  const inj = G.squad.filter((p) => p.inj);
  cl.push(inj.length ? `ケガ人は ${inj.map((p) => `${p.name}（あと${p.inj}週）`).join('、')}。` : 'ケガ人はいません。');
  const ch = G.owner.coaches.phys ?? G.owner.coaches.off;
  items.push({ role: 'コーチ', who: ch?.name ?? G.mgr.name, lines: cl });
  const yl = G.youthLog[G.youthLog.length - 1];
  if (yl && yl.season === G.season && yl.month === mon) {
    const best = [...yl.lines].sort((a, b) => b.stars - a.stars).slice(0, 2).map((x) => { const p = G.youth.find((y) => y.id === x.pid); return p ? `${p.name}（${p.grade}年）は「${x.words} ${x.arrow}」` : ''; }).filter(Boolean);
    items.push({ role: 'ユースコーチ', who: G.owner.coaches.youth?.name ?? '（いない）', lines: [yl.coach, ...(best.length ? [`目立っているのは ${best.join('、')}。`] : []), 'くわしくは チーム → ユース で見られます。'] });
  }
  const sc = G.owner.scouts[0];
  if (sc) {
    const now = G.season * 48 + G.week;
    const fresh = Object.values(G.owner.mk.known).filter((k) => k.src === 'scout' && k.p && k.season * 48 + k.week >= now - 4).sort((a, b) => ((b.p!.pot ?? 0) - ovr(b.p!)) - ((a.p!.pot ?? 0) - ovr(a.p!))).slice(0, 2);
    items.push({ role: 'スカウト', who: sc.name, lines: fresh.length ? [`今月のおすすめは ${fresh.map((k) => `${k.p!.name}（${k.p!.age}歳・${k.p!.pos}）`).join('、')}。`, ...fresh.filter((k) => k.note).map((k) => `${k.p!.name}：「${k.note}」`), 'チーム → 移籍 → スカウトで見られます。'] : ['今月は、強くおすすめできる選手は見つかりませんでした。'] });
  }
  return { kind: 'month', title: `${mon}月の経営会議`, items, pick: { goal: 1, budget: 1, policy: G.policy } };
}

/* ---------- 年に1回の経営会議（問116・120） ---------- */
export function yearMeeting(G: GameState, judged: string[]): Meeting {
  const o = G.owner; const items: MeetItem[] = [];
  const inc = ledSum(o.ledger, INCOME_KEYS), exp = ledSum(o.ledger, EXPENSE_KEYS);
  const t = myTierOf(G), rk = rankOf(G);
  items.push({ role: '経理', who: G.front!.acct, lines: [`${G.season}年目の収支です。入ってきたお金 ${man(inc)}、出ていったお金 ${man(exp)}。差し引き ${inc - exp >= 0 ? '+' : '−'}${man(Math.abs(inc - exp))}。`, `いまのお金は ${man(o.money)}${o.debt ? `、借金が ${man(o.debt)}` : ''}です。`] });
  const s0 = G.yearStart ?? { pop: o.pop, fans: [0, 0] as [number, number] };
  const avgFans = s0.fans[1] ? Math.round(s0.fans[0] / s0.fans[1]) : 0;
  const nt = nextTier(G);
  items.push({ role: '営業', who: G.front!.sales, lines: [`クラブの人気は ${Math.round(s0.pop)} から ${Math.round(o.pop)} に${o.pop >= s0.pop ? '上がりました' : '下がりました'}。`, avgFans ? `ホームの試合には、1試合 平均 ${avgFans.toLocaleString()}人のお客さんが来ました。` : 'ホームの試合のお客さんの記録は、来年からとります。', `今年のスポンサー収入は ${man(o.sponsor)}。来年は ${man(Math.round(sponsorYear(nt, G.club.pref, o.pop) * (G.spMul ?? 1)))} くらいの見こみです。`] });
  const opts = goalOptions(G, nt, G.season + 1, 2);
  const ml = [`今年は ${t}部 ${rk}位でした。`, ...judged, `監督の評価：${evalWord(G.mgrEval ?? 60)}`];
  if ((G.mgrEval ?? 60) < 25) ml.push('結果を出せず、申し訳ありません。監督を代えるなら、経営 → スタッフ から入れかえられます。');
  ml.push(`来年（${nt}部）の目標を3つ考えました。オーナーが選んでください。`);
  items.push({ role: '監督', who: G.mgr.name, lines: ml, ask: 'goal' });
  const gp = gaps(G);
  items.push({ role: '監督', who: G.mgr.name, lines: [gp.length ? `いま足りないのは ${gp.join('、')} です。` : 'いまのところ、大きく足りないポジションはありません。', 'チームの強化方針を決めてください（若手を使うか、勝ちを優先するか）。'], ask: 'policy' });
  const budgets = [0.25, 0.45, 0.65].map((f) => Math.max(0, Math.round((o.money * f) / 100) * 100));
  items.push({ role: '経理', who: G.front!.acct, lines: [`補強の予算（冬と来年の夏の移籍金の上限）を決めてください。いまのお金は ${man(o.money)} です。`], ask: 'budget' });
  const notes = G.yearNotes ?? [];
  const down = notes.filter((n) => (n.d ?? 0) < 0), up = notes.filter((n) => (n.d ?? 0) > 0);
  const cl: string[] = [];
  if (down.length) cl.push(...down.map((n) => `↓ ${n.name}（${n.why}）：「${n.text}」`));
  if (up.length) cl.push(...up.map((n) => `${(n.d ?? 0) >= 3 ? '↑↑' : '↑'} ${n.name}（${n.why}）：「${n.text}」`));
  items.push({ role: 'コーチ', who: (G.owner.coaches.phys ?? G.owner.coaches.off)?.name ?? G.mgr.name, lines: cl.length ? ['今年1年の、選手の伸びしろの見立てです。', ...cl] : ['今年は、伸びしろが大きく動いた選手はいませんでした。'] });
  return { kind: 'year', title: `${G.season}年目の年に1回の経営会議`, items, goals: opts, budgets, pick: { goal: 1, budget: 1, policy: G.policy } };
}
/** 会議を閉じる：年の会議なら、選んだ目標・予算・方針を決める（決めずに閉じても、おすすめ＝まん中になる） */
export function closeMeeting(G: GameState) {
  const m = G.meet; if (!m) return;
  if (m.kind === 'year') {
    G.nextGoal = m.goals![m.pick.goal];
    G.budget = { cap: m.budgets![m.pick.budget], spent: 0 };
    G.policy = m.pick.policy;
  }
  G.meet = null;
}
/** 問120：伸びしろの見立ての言い回し（話すコーチと、選手の年齢・ポジションで変える） */
export function potNote(r: Rng, p: Player, d: number): string {
  const young = p.age <= 21, vet = p.age >= 28;
  const fw = ['ST', 'WG', 'AM'].includes(p.pos), df = ['CB', 'SB', 'DM'].includes(p.pos), gk = p.pos === 'GK';
  const pool: string[] = d >= 3 ? [
    young ? 'この年で、ここまでやれるとは。まだまだ伸びます' : vet ? 'ベテランになっても、まだ上を目指せる体です' : '試合に出続けて、一段上の選手になりました',
    fw ? 'ゴール前での落ち着きが見違えた。伸びしろが広がりました' : df ? '守りの読みが一段深くなった。まだ伸びます' : gk ? 'ゴールを守る自信がついた。まだ伸びるキーパーです' : '試合の流れが見えるようになってきた。まだ伸びます',
    '1年間の経験が、しっかり身についています',
  ] : d > 0 ? [
    '試合に出て、少し上が見えてきました', young ? '出番をもらって、自信がついてきた様子です' : 'もうひと伸びできそうです', fw ? '点を取る形が増えてきました' : df ? '守りで頼れる場面が増えました' : 'プレーに迷いが減ってきました',
  ] : [
    young ? '出番が少なくて、伸びが止まりかけています。試合で使ってあげたい' : '出番が少なく、体のキレが落ちてきています', '練習だけでは、なかなか伸びません。試合の経験がほしいところです', vet ? '年齢もあって、ここから大きく伸びるのは難しいかもしれません' : 'ほかのクラブで試合に出るほうが、本人のためかもしれません',
  ];
  return r.pick(pool);
}

/** 問117：夏の中断期間。古いセーブの今のシーズンも、まだ来ていないリーグ戦を中断期間の外へ動かす */
export function fixBreak(G: GameState) {
  if (G.breakFix) return; G.breakFix = true;
  const L = G.sched.league; if (!L.some((w) => BREAK_WEEKS.includes(w))) return;
  const done = L.filter((w) => w < G.week); const n = L.length - done.length;
  const cand: number[] = []; for (let w = Math.max(G.week, 8); w <= SEASON_END; w++) if (!G.sched.cup.includes(w) && !BREAK_WEEKS.includes(w)) cand.push(w);
  if (cand.length < n || !n) return;
  const rest = n === 1 ? [cand[0]] : Array.from({ length: n }, (_, i) => cand[Math.round((i * (cand.length - 1)) / (n - 1))]);
  G.sched.league = [...done, ...rest];
}
