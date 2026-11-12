/* 経営会議（問113〜116）とメッセージ（問112）と、年の目標（問115・116）
   - 月の終わり（3〜11月）：経理・監督・コーチ・ユースコーチ・スカウトが1人ずつ報告する
   - 12月（表彰式のあと）：年に1回の経営会議。去年のふり返り・営業の報告・目標（監督が3つ出してオーナーが選ぶ）・
     補強の予算・チームの強化方針・いまの不足・コーチの伸びしろの報告（問120）
   - 目標に届いたか：監督の評価・人気・スポンサーが上下する（大きく外れると監督の解任の話） */
import { ensureFin } from './clubfin';
import { ensureReg } from './squad';
import { BREAK_WEEKS, SEASON_END } from './calendar';
import { clamp, Rng } from './rng';
import { ovr, teamStrength } from './player';
import { POS, type Pos } from './constants';
import { INCOME_KEYS, EXPENSE_KEYS, MONEY_NAME, sponsorYear, type Ledger } from './finance';
import { STAFF_SUR, STAFF_GIV } from './data/names';
import { monthOf } from './calendar';
import type { Policy } from './match';
import type { GameState } from './game';
import type { Player } from './types';

export type Level = 'むずかしい' | 'ちょうどいい' | 'かんたん';
export interface Goal { tier: number; rank: number; text: string; level: Level; season: number }
/** 報告する人が持ってくる報告書（収支報告書・試合報告書・成長報告書など）。行は「項目・値」 */
export interface DocRow { k: string; v: string; cls?: 'good' | 'bad' | 'sum' | 'net' | 'netbad' }
export interface Doc { title: string; stamp: string; secs: { h?: string; rows: DocRow[] }[] }
export interface MeetItem { role: string; who: string; lines: string[]; ask?: 'goal' | 'budget' | 'policy'; doc?: Doc }
export interface Meeting { kind: 'month' | 'year'; title: string; items: MeetItem[]; goals?: Goal[]; budgets?: number[]; pick: { goal: number; budget: number; policy: Policy } }
export interface MonthSnap { money: number; led: Ledger; rank: number; w: number; d: number; l: number; gf?: number; ga?: number; o?: Record<number, number>; a: Record<number, number>; ord: [number, number]; awake: string[]; pop: number; fans: [number, number] }
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
  ensureReg(G); fixBreak(G); ensureFin(G);
  /* 表彰歴をつける前のセーブ：自分の選手の分だけ、リーグの歴史から埋めておく */
  if (!G.honorFix) { G.honorFix = true; for (const p of G.squad) if (!p.honors) { const h = G.history.flatMap((r) => [...r.awards, ...(r.xi ?? [])].filter((a) => a.me && a.name === p.name).map((a) => ({ y: r.season, title: a.title, tier: a.tier, club: a.club }))); if (h.length) p.honors = h; } }
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
  return { money: G.owner.money, led: { ...G.owner.ledger }, rank, w: row.w, d: row.d, l: row.l, gf: row.gf, ga: row.ga, o: Object.fromEntries(G.squad.map((p) => [p.id, ovr(p)])), a: Object.fromEntries(G.squad.map((p) => [p.id, sumA(p)])), ord: [0, 0], awake: [], pop: G.owner.pop, fans: [0, 0] };
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
  if (just <= hard) just = Math.min(cap, hard + 1);
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

/** お金の書き方（画面の yen と同じ：1億2,000万円） */
export const yenText = (v: number) => { const neg = v < 0; const m = Math.abs(Math.round(v)); const t = m >= 10000 ? `${Math.floor(m / 10000)}億${m % 10000 ? (m % 10000).toLocaleString() + '万' : ''}円` : `${m.toLocaleString()}万円`; return (neg ? '−' : '') + t; };
function statement(title: string, now: Ledger, base: Ledger | null, money: number, debt: number, prev?: number): Doc {
  const d = (k: keyof Ledger) => now[k] - (base ? base[k] : 0);
  const inc = INCOME_KEYS.reduce((t, k) => t + d(k), 0), exp = EXPENSE_KEYS.reduce((t, k) => t + d(k), 0), net = inc - exp;
  const r = (k: keyof Ledger): DocRow => ({ k: MONEY_NAME[k], v: d(k) ? yenText(d(k)) : '—' });
  return { title, stamp: '経理', secs: [
    { h: '入ってきたお金', rows: [...INCOME_KEYS.map(r), { k: '合計', v: yenText(inc), cls: 'sum' }] },
    { h: '出ていったお金', rows: [...EXPENSE_KEYS.map(r), { k: '合計', v: yenText(exp), cls: 'sum' }] },
    { rows: [{ k: '差し引き', v: `${net >= 0 ? '+' : ''}${yenText(net)}`, cls: net >= 0 ? 'net' : 'netbad' }, ...(prev != null ? [{ k: '前の月のお金', v: yenText(prev) }] : []), { k: 'いまのお金', v: yenText(money), cls: 'sum' as const }, ...(debt ? [{ k: '借金', v: yenText(debt), cls: 'bad' as const }] : [])] },
  ] };
}
/* ---------- 月の経営会議（問113・114） ---------- */
export function monthMeeting(G: GameState): Meeting {
  const s = G.snap ?? snapshot(G); const o = G.owner;
  const inc = ledSum(o.ledger, INCOME_KEYS) - ledSum(s.led, INCOME_KEYS); const exp = ledSum(o.ledger, EXPENSE_KEYS) - ledSum(s.led, EXPENSE_KEYS);
  const mon = monthOf(G.week);
  const items: MeetItem[] = [];
  const net = inc - exp;
  items.push({ role: '経理', who: G.front!.acct, lines: [`${mon}月の収支報告書です。差し引きは ${net >= 0 ? `${man(net)}の黒字` : `${man(-net)}の赤字`}でした。`, net < 0 && o.money < 3000 ? '少し苦しくなってきました。選手の給料と施設づくりには気をつけてください。' : o.debt ? '借金の返済も、少しずつ進めましょう。' : 'お金のまわりは、いまのところ順調です。'], doc: statement(`${mon}月の収支報告書`, o.ledger, s.led, o.money, o.debt, s.money) });
  const row = G.leagues[myTierOf(G)].table[0]; const w = row.w - s.w, d = row.d - s.d, l = row.l - s.l; const rk = rankOf(G);
  const gf = row.gf - (s.gf ?? row.gf), ga = row.ga - (s.ga ?? row.ga);
  const nextMatches = G.sched.league.filter((x) => x >= G.week + 1 && x < G.week + 5).length;
  const gl = G.goal;
  const mg: string[] = [];
  mg.push(w + d + l ? (w > l ? `${mon}月は勝ちが先に立ちました。` : w < l ? `${mon}月は苦しい月でした。` : `${mon}月は五分の成績でした。`) : `${mon}月はリーグ戦がありませんでした。`);
  if (gl && rk) mg.push(rk <= gl.rank ? `目標の「${gl.text}」には、いまのところ届いています。` : `目標の「${gl.text}」まで、あと${rk - gl.rank}つ順位を上げたい。`);
  if (nextMatches) mg.push(l > w ? '来月は、ここで立て直します。' : '来月も、この調子で行きます。');
  items.push({ role: '監督', who: G.mgr.name, lines: mg, doc: { title: `${mon}月の試合報告書`, stamp: '監督', secs: [
    { h: 'リーグ戦', rows: [{ k: '成績', v: w + d + l ? `${w}勝${d}分${l}敗` : 'なし' }, { k: '取った点・取られた点', v: w + d + l ? `${gf} − ${ga}` : '—' }, { k: '順位', v: rk ? `${s.rank ? `${s.rank}位 → ` : ''}${rk}位` : '開幕前', cls: s.rank && rk < s.rank ? 'good' : s.rank && rk > s.rank ? 'bad' : undefined }] },
    { h: 'オーナーの頼み', rows: [{ k: '聞いた数', v: s.ord[0] ? `${s.ord[1]} / ${s.ord[0]}` : '頼みなし' }] },
    { h: '来月', rows: [{ k: 'リーグ戦', v: `${nextMatches}試合` }, ...(gl ? [{ k: '今年の目標', v: gl.text }] : [])] },
  ] } });
  const ups = G.squad.map((p) => ({ p, d: ovr(p) - (s.o?.[p.id] ?? ovr(p)), a: sumA(p) - (s.a[p.id] ?? sumA(p)) })).filter((x) => x.d > 0 || x.a >= 0.6).sort((a, b) => b.d - a.d || b.a - a.a).slice(0, 5);
  const cl: string[] = [];
  cl.push(ups.length ? `今月いちばん伸びたのは ${ups[0].p.name} です。${ups.length > 1 ? 'ほかの選手も、報告書にまとめました。' : ''}` : '今月は、大きく伸びた選手はいませんでした。');
  if (s.awake.length) cl.push(`それに、${s.awake.join('、')} が覚醒しました！`);
  const inj = G.squad.filter((p) => p.inj);
  cl.push(inj.length ? (inj.some((p) => p.inj >= 4) ? '長いケガ人がいます。無理はさせません。' : 'ケガ人は、すぐにもどれそうです。') : 'ケガ人はいません。');
  const ch = G.owner.coaches.phys ?? G.owner.coaches.off;
  items.push({ role: 'コーチ', who: ch?.name ?? G.mgr.name, lines: cl, doc: { title: `${mon}月の成長報告書`, stamp: 'コーチ', secs: [
    { h: 'よく伸びた選手', rows: ups.length ? ups.map((x) => ({ k: `${x.p.name}（${x.p.pos}）`, v: x.d ? `総合 ${ovr(x.p) - x.d} → ${ovr(x.p)}` : '少し伸びた', cls: x.d ? 'good' as const : undefined })) : [{ k: 'なし', v: '—' }] },
    ...(s.awake.length ? [{ h: '覚醒', rows: s.awake.map((n) => ({ k: n, v: '覚醒！', cls: 'good' as const })) }] : []),
    { h: 'ケガ', rows: inj.length ? inj.map((p) => ({ k: `${p.name}（${p.pos}）`, v: `あと${p.inj}週`, cls: p.inj >= 4 ? 'bad' as const : undefined })) : [{ k: 'なし', v: '—' }] },
  ] } });
  const yl = G.youthLog[G.youthLog.length - 1];
  if (yl && yl.season === G.season && yl.month === mon) {
    const lines = [...yl.lines].sort((a, b) => b.stars - a.stars).slice(0, 5).map((x) => ({ x, p: G.youth.find((y) => y.id === x.pid) })).filter((z) => z.p);
    items.push({ role: 'ユースコーチ', who: G.owner.coaches.youth?.name ?? '（いない）', lines: [yl.coach, '一人ひとりの様子は、ユースの報告書にまとめてあります。'].filter(Boolean), doc: { title: `${mon}月のユース報告書`, stamp: 'ユース', secs: [
      { h: '目立っている子', rows: lines.map(({ x, p }) => ({ k: `${p!.name}（${p!.grade}年・${p!.pos}）${'★'.repeat(x.stars)}`, v: `${x.words} ${x.arrow}` })) },
    ] } });
  }
  const sc = G.owner.scouts[0];
  if (sc) {
    const now = G.season * 48 + G.week;
    const fresh = Object.values(G.owner.mk.known).filter((k) => k.src === 'scout' && k.p && k.season * 48 + k.week >= now - 4).sort((a, b) => ((b.p!.pot ?? 0) - ovr(b.p!)) - ((a.p!.pot ?? 0) - ovr(a.p!))).slice(0, 3);
    items.push({ role: 'スカウト', who: sc.name, lines: fresh.length ? [`今月のいちばんのおすすめは ${fresh[0].p!.name} です。`, fresh[0].note ? `「${fresh[0].note}」` : '', 'ほかにも何人か、気になる選手の報告を上げてあります。'].filter(Boolean) : ['今月は、強くおすすめできる選手は見つかりませんでした。'],
      doc: fresh.length ? { title: `${mon}月のスカウト報告書`, stamp: 'スカウト', secs: [{ h: 'おすすめの選手', rows: fresh.map((k) => ({ k: `${k.p!.name}（${k.p!.age}歳・${k.p!.pos}）`, v: k.club ?? '' })) }] } : undefined });
  }
  /* 感想：それぞれが「今月の不足」と「来月からの動き」を話す。監督の方針とコーチの練習の強さは、来月の試合に本当に効く */
  const games = w + d + l; const gp = gaps(G);
  let tilt: 'def' | 'atk' | null = null; let care = false;
  const add = (role: string, short: string[], act: string) => {
    const it = items.find((x) => x.role === role); if (!it) return;
    it.lines.push(short.length ? `今月の不足は、${short.join('、')}です。` : '今月は、大きな不足はありませんでした。', act);
    (it.doc ??= { title: `${mon}月の${role}の報告書`, stamp: role, secs: [] }).secs.push({ h: '今月の不足', rows: short.length ? short.map((t) => ({ k: t, v: '', cls: 'bad' as const })) : [{ k: '特になし', v: '' }] }, { h: '来月からの動き', rows: [{ k: act, v: '' }] });
  };
  { const sh: string[] = []; const big = EXPENSE_KEYS.map((k) => [k, o.ledger[k] - s.led[k]] as const).sort((x, y) => y[1] - x[1])[0];
    if (net < 0) sh.push(`支出が収入を上回ったこと（いちばん大きい支出は${MONEY_NAME[big[0]]}）`); if (o.money < 3000) sh.push('手元のお金が少ないこと'); if (o.debt) sh.push('借金が残っていること');
    add('経理', sh, net < 0 ? '来月は、選手の給料と施設づくりの支払いを毎週たしかめて、ふくらみそうならすぐ知らせます。' : o.debt && o.money > o.debt * 2 ? 'お金に余裕があるうちに、借金を少しずつ返していきませんか。' : 'いまの使い方のまま、毎週の出入りを見ていきます。'); }
  { const sh: string[] = []; const gaPer = games ? ga / games : 0, gfPer = games ? gf / games : 0;
    if (games && gaPer >= 1.8) sh.push(`失点が多いこと（1試合 ${gaPer.toFixed(1)}点）`); if (games && gfPer < 1) sh.push(`点が取れていないこと（1試合 ${gfPer.toFixed(1)}点）`); if (gp.length) sh.push(`${gp.slice(0, 2).join('・')}`);
    tilt = games && gaPer >= 1.8 && gfPer >= 1 ? 'def' : games && gfPer < 1 && gaPer < 1.8 ? 'atk' : null;
    add('監督', sh, tilt === 'def' ? '来月は、守りの人数を増やす並び方を多めに使います。' : tilt === 'atk' ? '来月は、攻めの人数を増やす並び方を多めに使います。' : '来月も、いまの戦い方を続けます。'); }
  { const sh: string[] = []; const longInj = inj.filter((p) => p.inj >= 4).length; const tired = G.squad.filter((p) => p.fat >= 40).length;
    if (!ups.length) sh.push('伸びた選手が少ないこと'); if (inj.length) sh.push(`ケガ人が${inj.length}人いること`); if (tired >= 3) sh.push(`疲れがたまっている選手が${tired}人いること`);
    care = longInj >= 1 || tired >= 3 || inj.length >= 3;
    add('コーチ', sh, care ? '来月は、練習の強さを少し落として、ケガを防ぎます（試合でのケガが少し減ります）。' : '来月は、伸びている選手を中心に、練習の中身を見ていきます。'); }
  { const yl2 = G.youthLog[G.youthLog.length - 1];
    if (yl2 && yl2.season === G.season && yl2.month === mon) { const slow = yl2.lines.filter((x) => /→|↓/.test(x.arrow)).map((x) => G.youth.find((y) => y.id === x.pid)?.name).filter(Boolean) as string[];
      add('ユースコーチ', slow.length ? [`伸びが止まっている子がいること（${slow.slice(0, 3).join('、')}）`] : [], slow.length ? `来月は、${slow[0]}に声をかけて、練習の様子を近くで見ます。` : '来月も、いまの練習を続けます。'); } }
  { const now2 = G.season * 48 + G.week; const fr = Object.values(G.owner.mk.known).filter((k) => k.src === 'scout' && k.p && k.season * 48 + k.week >= now2 - 4);
    const need = gp.length ? gp[0].split('（')[0] : ''; const sh: string[] = [];
    if (!fr.length) sh.push('条件に合う選手が見つからなかったこと'); if (need) sh.push(`足りない${need}の候補が少ないこと`);
    add('スカウト', sh, need ? `${need}が足りていません。探すポジションを${need}にしてもらえれば、来月はそこを重点的に見て回ります。` : !fr.length ? '地域や年齢の条件を少し広げてもらえれば、来月は見つけやすくなると思います。' : '来月も、いまの条件で探し続けます。'); }
  G.plan = { until: G.season * 48 + G.week + 5, tilt, care };
  return { kind: 'month', title: `${mon}月の経営会議`, items, pick: { goal: 1, budget: 1, policy: G.policy } };
}

/* ---------- 年に1回の経営会議（問116・120） ---------- */
export function yearMeeting(G: GameState, judged: string[]): Meeting {
  const o = G.owner; const items: MeetItem[] = [];
  const inc = ledSum(o.ledger, INCOME_KEYS), exp = ledSum(o.ledger, EXPENSE_KEYS);
  const t = myTierOf(G), rk = rankOf(G);
  items.push({ role: '経理', who: G.front!.acct, lines: [`${G.season}年目の1年分の収支報告書です。1年で ${inc - exp >= 0 ? `${man(inc - exp)}の黒字` : `${man(exp - inc)}の赤字`}でした。`], doc: statement(`${G.season}年目の収支報告書`, o.ledger, null, o.money, o.debt) });
  const s0 = G.yearStart ?? { pop: o.pop, fans: [0, 0] as [number, number] };
  const avgFans = s0.fans[1] ? Math.round(s0.fans[0] / s0.fans[1]) : 0;
  const nt = nextTier(G);
  const spNext = Math.round(sponsorYear(nt, G.club.pref, o.pop) * (G.spMul ?? 1));
  items.push({ role: '営業', who: G.front!.sales, lines: [o.pop >= s0.pop ? 'クラブの人気は、1年で上がりました。街でもユニフォームを見かけるようになりましたよ。' : '人気は少し下がりました。勝って、お客さんを呼びもどしましょう。', `来年のスポンサーは、${spNext >= o.sponsor ? '今年より増えそうです' : '今年より少し減りそうです'}。`],
    doc: { title: `${G.season}年目の営業報告書`, stamp: '営業', secs: [
      { h: '人気とお客さん', rows: [{ k: 'クラブの人気', v: `${Math.round(s0.pop)} → ${Math.round(o.pop)}`, cls: o.pop >= s0.pop ? 'good' : 'bad' }, { k: 'ホームの試合のお客さん（平均）', v: avgFans ? `${avgFans.toLocaleString()}人` : '記録なし' }, { k: 'ホームの試合', v: `${s0.fans[1]}試合` }] },
      { h: 'スポンサー', rows: [{ k: '今年', v: yenText(o.sponsor) }, { k: '来年の見こみ', v: yenText(spNext), cls: spNext >= o.sponsor ? 'good' : 'bad' }] },
    ] } });
  const opts = goalOptions(G, nt, G.season + 1, 2);
  const ml = [`今年は ${t}部 ${rk}位でした。`, ...judged, `監督の評価：${evalWord(G.mgrEval ?? 60)}`];
  if ((G.mgrEval ?? 60) < 25) ml.push('今年は結果を出せず、申し訳ありません。監督を代えるという判断も、受け入れます。');
  ml.push(`来年（${nt}部）の目標を、3つ用意しました。どれで行くか、オーナーが決めてください。`);
  const gl0 = G.goal; const row = G.leagues[t].table[0];
  items.push({ role: '監督', who: G.mgr.name, lines: ml, ask: 'goal', doc: { title: `${G.season}年目の試合報告書`, stamp: '監督', secs: [
    { h: 'リーグ戦', rows: [{ k: '順位', v: `${t}部 ${rk}位` }, { k: '成績', v: `${row.w}勝${row.d}分${row.l}敗` }, { k: '取った点・取られた点', v: `${row.gf} − ${row.ga}` }] },
    { h: '目標', rows: gl0 ? [{ k: gl0.text, v: (G.goalLog ?? []).slice(-1)[0]?.ok ? '届いた' : '届かなかった', cls: (G.goalLog ?? []).slice(-1)[0]?.ok ? 'good' : 'bad' }] : [{ k: 'なし', v: '—' }] },
  ] } });
  const gp = gaps(G);
  items.push({ role: '監督', who: G.mgr.name, lines: [gp.length ? `いま足りないのは ${gp.join('、')} です。` : 'いまのところ、大きく足りないポジションはありません。', '来年は若手を使っていくか、勝ちを優先するか。チームの方針を決めてください。'], ask: 'policy' });
  const budgets = [0.25, 0.45, 0.65].map((f) => Math.max(0, Math.round((o.money * f) / 100) * 100));
  items.push({ role: '経理', who: G.front!.acct, lines: [`補強の予算（冬と来年の夏の移籍金の上限）を決めてください。いまのお金は ${man(o.money)} です。`], ask: 'budget' });
  const notes = G.yearNotes ?? [];
  const down = notes.filter((n) => (n.d ?? 0) < 0), up = notes.filter((n) => (n.d ?? 0) > 0);
  const cl: string[] = [];
  if (down.length) cl.push(...down.map((n) => `↓ ${n.name}（${n.why}）：「${n.text}」`));
  if (up.length) cl.push(...up.map((n) => `${(n.d ?? 0) >= 3 ? '↑↑' : '↑'} ${n.name}（${n.why}）：「${n.text}」`));
  items.push({ role: 'コーチ', who: (G.owner.coaches.phys ?? G.owner.coaches.off)?.name ?? G.mgr.name, lines: [...(cl.length ? ['今年1年の、選手の伸びしろの見立てです。', ...cl] : ['今年は、伸びしろが大きく動いた選手はいませんでした。']), ...((G.typeNews ?? []).length ? [`それと、1年見てきて、${(G.typeNews ?? []).length}人の成長タイプがわかりました。報告書に書いておきます。`] : [])],
    doc: notes.length || (G.typeNews ?? []).length ? { title: `${G.season}年目の伸びしろ報告書`, stamp: 'コーチ', secs: [...((G.typeNews ?? []).length ? [{ h: '成長タイプがわかった（1年見てきて）', rows: (G.typeNews ?? []).map((t) => { const [n, ty] = t.split('：'); return { k: n, v: ty }; }) }] : []),...(down.length ? [{ h: '伸びしろが小さくなった', rows: down.map((n) => ({ k: n.name, v: `↓（${n.why}）`, cls: 'bad' as const })) }] : []), ...(up.length ? [{ h: '伸びしろが広がった', rows: up.map((n) => ({ k: n.name, v: `${(n.d ?? 0) >= 3 ? '↑↑' : '↑'}（${n.why}）`, cls: 'good' as const })) }] : [])] } : undefined });
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
    fw ? 'ゴール前で慌てなくなりました。来年はもっと点を取りますよ' : df ? '守りの読みが一段深くなった。来年はもっと頼れますよ' : gk ? 'ゴール前で声が出るようになった。自信がついた証拠です' : '試合の流れが見えてきた。ボールの受け方が変わりました',
    '1年、試合に出続けたのが大きい。顔つきが変わりました',
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
