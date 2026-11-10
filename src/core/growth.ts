/* 伸び方（企画書 8-5）：試合・コーチが組む練習・成長期・ポテンシャル。週ごとに少しずつ */
import { Rng, clamp } from './rng';
import { POS, W, type Pos } from './constants';
import { SP_ANY, SP_BY_POS, NOT_GK } from './data/specials';
import { inGrowth, ovr } from './player';
import type { Player, ReportEntry } from './types';

export interface GrowCtx {
  /** 監督の育てる腕前 */
  mgrGrow: number;
  /** 項目ごとのコーチの腕前（1が平均） */
  coach: number[];
  /** 練習場（1が平均） */
  field: number;
  /** 春のキャンプ中か */
  camp: boolean;
  /** 監督の戦い方（身につきやすい特殊能力が変わる） */
  style?: string;
  /** メディカル施設（ケガの治り） */
  medical?: number;
  /** 克服を助けるコーチ（0〜1） */
  defCoach?: number; offCoach?: number; physCoach?: number;
}
export const DEFAULT_CTX: GrowCtx = { mgrGrow: 1, coach: [1, 1, 1, 1, 1, 1, 1, 1], field: 1, camp: false };

/** 戦い方ごとに身につきやすい特殊能力 */
const STYLE_SP: Record<string, string[]> = {
  'ロングカウンター': ['スピードスター', 'ロングフィード', 'カバーリング'],
  'ポゼッション': ['キラーパス', '広い視野', 'ワンタッチパサー'],
  'サイドアタック': ['正確なクロス', 'パワーヘッダー', '攻撃参加'],
  'ローブロック': ['シュートブロック', 'エアバトル', 'カバーリング'],
  'ゲーゲンプレス': ['プレッサー', 'エンジン', 'ボール奪取'],
};

export function growPlayer(r: Rng, p: Player, ctx: GrowCtx): ReportEntry | null {
  const before = p.a.map(Math.floor);
  let gp = inGrowth(p) ? 1 : p.age < p.gStart ? 0.35 : 0.12;
  if (p.age >= p.decl) gp = -0.18 * (p.age - p.decl + 1) * (p.sp.includes('衰えにくい') ? 0.5 : 1);
  const o = ovr(p);
  const room = Math.max(0, (p.pot - o) / 30);
  const pr = 0.135 * ctx.field * (p.sp.includes('練習の虫') ? 1.5 * (0.6 + 0.4 * ctx.field) : 1) * (ctx.camp ? (p.sp.includes('キャンプで化ける') ? 3.2 : 2) : 1);
  const mt = p.played ? 0.22 * ctx.mgrGrow * (p.sp.includes('実戦で伸びる') ? 1.5 : 1) : 0;
  let awake: ReportEntry['awake'] = null;
  for (let i = 0; i < 8; i++) {
    const w = W[p.pos][i] / 3 + 0.35;
    let dlt = gp > 0 ? (pr * ctx.coach[i] + mt) * gp * w * Math.min(1.4, room) * (0.6 + r.next() * 0.8) : gp * 0.05 * (0.5 + r.next());
    if (p.a[i] >= 99 && dlt > 0) dlt = 0;
    p.a[i] = clamp(p.a[i] + dlt, 5, 99);
  }
  /* 大きな伸び（覚醒）：成長期の若手に、ときどき起きる */
  const campBoost = ctx.camp ? (p.sp.includes('キャンプで化ける') ? 3 : 1.6) : 1;
  if (gp >= 1 && room > 0.25 && r.next() < (p.played ? 0.012 : 0.003) * campBoost) {
    const order = [0, 1, 2, 3, 4, 5, 6, 7].sort((x, y) => W[p.pos][y] - W[p.pos][x]);
    const i = order[r.int(0, 2)]; const jump = r.int(10, 13);
    const from = Math.floor(p.a[i]); p.a[i] = clamp(p.a[i] + jump, 5, 99);
    const j2 = order[r.int(3, 5)]; p.a[j2] = clamp(p.a[j2] + r.int(3, 8), 5, 99);
    awake = { i, from, to: Math.floor(p.a[i]) };
  }
  /* 特殊能力が身につく／悪い特殊能力を克服（企画書 8-8） */
  let newSp: string | null = null, cured: string | null = null;
  const learn = p.sp.includes('学ぶ力') ? 1.8 : 1;
  if ((p.played || ctx.camp) && p.sp.length < 5 && r.next() < (0.008 + (ctx.camp ? 0.01 : 0) + (awake ? 0.5 : 0)) * learn) {
    const pool = (p.pos === 'GK' ? [...SP_BY_POS.GK, ...SP_ANY] : [...SP_BY_POS[p.pos], ...SP_ANY, ...(ctx.style ? STYLE_SP[ctx.style] || [] : [])]).filter((s) => !p.sp.includes(s) && !(p.pos === 'GK' && NOT_GK.has(s)));
    if (pool.length) { newSp = r.pick(pool); p.sp.push(newSp); }
  }
  if (p.bad.length) {
    const b = p.bad[r.int(0, p.bad.length - 1)];
    let c = p.played ? 0.01 : 0.003;
    if (b === 'スペ体質') c += (ctx.medical ?? 0) * 0.004 + (ctx.physCoach ?? 0) * 0.004;
    if (b === 'スタミナ切れ') c += (ctx.physCoach ?? 0) * 0.005;
    if (b === 'ラフプレイヤー') c += (ctx.defCoach ?? 0) * 0.008;
    if (b === '空中戦が苦手') c += ((ctx.defCoach ?? 0) + (ctx.offCoach ?? 0)) * 0.004;
    if (b === '守備をサボる' && ctx.style === 'ゲーゲンプレス') c += 0.012;
    if (r.next() < c * learn) { cured = b; p.bad = p.bad.filter((x) => x !== b); }
  }
  /* ポジション適性：そのポジションで半シーズン〜1シーズンほど出ると1段上がる */
  let aptUp: Pos | null = null;
  for (const pos of POS) {
    const xp = p.aptXp[pos] || 0;
    if (p.apt[pos] < 3 && xp >= 11 + p.apt[pos] * 3 && r.next() < 0.25) {
      const dbl = POS.filter((x) => p.apt[x] === 3).length;
      if (p.apt[pos] === 2 && dbl >= 4) continue;
      p.apt[pos]++; p.aptXp[pos] = 0; aptUp = pos; break;
    }
  }
  /* 調子・疲れ・ケガ */
  const swing = p.sp.includes('安定感') ? 0.5 : p.bad.includes('ムラっけ') ? 1.8 : 1;
  p.cond = clamp(Math.round(p.cond * 0.5 + (r.next() - 0.5) * 2.6 * swing), -2, 2);
  if (p.sp.includes('安定感') && p.cond < -1) p.cond = -1;
  p.fat = clamp(p.fat - (p.sp.includes('回復が早い') ? 42 : 30), 0, 100);
  const injNew = p.injNew; p.injNew = false;
  if (p.inj && !injNew) { p.inj--; if (p.inj > 0 && (p.sp.includes('回復が早い') || r.next() < (ctx.medical ?? 0) * 0.15)) p.inj--; }
  const after = p.a.map(Math.floor);
  const ups = after.map((v, i) => v - before[i]);
  const totalUp = ups.reduce((s, v) => s + Math.max(0, v), 0);
  p.played = false;
  /* 大きな覚醒：1つの項目が1度に10以上、または合計で20以上（企画書 8-7） */
  const big = !!awake || ups.some((v) => v >= 10) || totalUp >= 20;
  if (big && !awake) { const mi = ups.indexOf(Math.max(...ups)); awake = { i: mi, from: before[mi], to: after[mi] }; }
  if (totalUp > 0 || newSp || cured || injNew || aptUp || ups.some((v) => v < 0))
    return { pid: p.id, ups, before, after, awake: big ? awake : null, newSp, cured, injNew, aptUp };
  return null;
}

export function reportScore(e: ReportEntry) { return (e.awake ? 100 : 0) + (e.newSp ? 8 : 0) + (e.cured ? 6 : 0) + (e.aptUp ? 5 : 0) + e.ups.reduce((s, v) => s + Math.max(0, v), 0); }

/** 何週ぶんかの報告を、選手ごとにまとめる */
export function mergeReports(list: ReportEntry[]): ReportEntry[] {
  const m = new Map<number, ReportEntry>();
  for (const e of list) {
    const x = m.get(e.pid);
    if (!x) { m.set(e.pid, { ...e, ups: [...e.ups], before: [...e.before], after: [...e.after] }); continue; }
    x.after = [...e.after]; x.ups = x.after.map((v, i) => v - x.before[i]);
    x.awake = x.awake || e.awake; x.newSp = x.newSp || e.newSp; x.cured = x.cured || e.cured; x.injNew = x.injNew || e.injNew; x.aptUp = x.aptUp || e.aptUp;
  }
  return [...m.values()].sort((a, b) => reportScore(b) - reportScore(a));
}
