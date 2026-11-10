/* お金（企画書 11）：入場料・スポンサー・選手を売ったお金・賞金。給料。施設5つ。借金（上限あり、ゲームオーバーなし） */
import { prefScale } from './data/prefs';

export type FacKey = 'field' | 'youth' | 'stadium' | 'medical' | 'dorm';
export const FAC_KEYS: FacKey[] = ['field', 'youth', 'stadium', 'medical', 'dorm'];
export const FAC_NAME: Record<FacKey, string> = { field: '練習場', youth: 'ユースの施設', stadium: 'スタジアム', medical: 'メディカル施設', dorm: '寮' };
export const FAC_NOTE: Record<FacKey, string> = {
  field: '練習での伸びがはっきり大きくなる', youth: 'ユースに入ってくる子の数と素質が上がる', stadium: '入るお客さんが増え、入場料が増える',
  medical: 'ケガの治りが早くなり、ケガもしにくくなる', dorm: '遠くの県の子も来てくれる',
};
/** 段階ごとの強化の費用（万円）と、かかる週 */
const FAC_COST: Record<FacKey, number> = { field: 3500, youth: 2500, stadium: 9000, medical: 2200, dorm: 2000 };
export const facCost = (k: FacKey, next: number) => Math.round((FAC_COST[k] * next * (next + 1)) / 2 / 100) * 100;
export const facWeeks = (k: FacKey, next: number) => (k === 'stadium' ? 8 + next * 4 : 4 + next * 2);
export const STADIUM_CAP = [0, 5000, 9000, 15000, 24000, 36000];
export const MAX_FAC = 5;

export type MoneyKey = 'gate' | 'sponsor' | 'sales' | 'prize' | 'salary' | 'staff' | 'build' | 'buy' | 'interest';
export const MONEY_NAME: Record<MoneyKey, string> = { gate: '入場料', sponsor: 'スポンサー', sales: '選手を売ったお金', prize: '賞金', salary: '選手の給料', staff: '監督・コーチ・スカウトの給料', build: '施設づくり', buy: '選手を獲ったお金', interest: '借金の利息' };
export const INCOME_KEYS: MoneyKey[] = ['gate', 'sponsor', 'sales', 'prize'];
export const EXPENSE_KEYS: MoneyKey[] = ['salary', 'staff', 'build', 'buy', 'interest'];
export type Ledger = Record<MoneyKey, number>;
export const emptyLedger = (): Ledger => ({ gate: 0, sponsor: 0, sales: 0, prize: 0, salary: 0, staff: 0, build: 0, buy: 0, interest: 0 });

/** 借金の上限（段で変わる） */
export const debtCap = (tier: number) => ({ 3: 20000, 2: 50000, 1: 100000 } as Record<number, number>)[tier] ?? 20000;
export const INTEREST = 0.03; // 1年あたり
/** スポンサー（1年ぶん、万円）：地元の会社が毎年出す。成績や人気で変わる */
export function sponsorYear(tier: number, pref: string, pop: number): number {
  const base = ({ 3: 12000, 2: 28000, 1: 60000 } as Record<number, number>)[tier];
  return Math.round((base * (0.75 + prefScale(pref) * 0.35) * (0.8 + pop / 250)) / 100) * 100;
}
/** 入場者数と入場料（1試合、万円）：強さと人気で増え、スタジアムの大きさが上限 */
export function gate(tier: number, pref: string, pop: number, stadium: number, oppTier: number, cup: boolean): { fans: number; money: number } {
  const demand = (({ 3: 3200, 2: 8000, 1: 17000 } as Record<number, number>)[tier]) * (0.6 + prefScale(pref) * 0.5) * (0.7 + pop / 120) * (cup ? 0.8 + (3 - oppTier) * 0.15 : 1);
  const fans = Math.round(Math.min(STADIUM_CAP[stadium] ?? 5000, demand));
  return { fans, money: Math.round((fans * 0.22) / 10) * 10 };
}
/** 賞金（万円） */
export const leaguePrize = (tier: number, rank: number) => Math.round((({ 3: 3000, 2: 8000, 1: 20000 } as Record<number, number>)[tier] * Math.max(0, 13 - rank)) / 12 / 100) * 100;
export const CUP_PRIZE = [0, 300, 600, 1200, 2500, 5000, 12000]; // 勝ち進んだ回戦の数ごと
