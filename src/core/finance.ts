/* お金（企画書 11）：入場料・スポンサー・選手を売ったお金・賞金。給料。施設5つ。借金（上限あり、ゲームオーバーなし） */
import { prefScale } from './data/prefs';

export type FacKey = 'field' | 'youth' | 'stadium' | 'medical' | 'dorm' | 'scout' | 'shop';
export const FAC_KEYS: FacKey[] = ['stadium', 'field', 'youth', 'dorm', 'medical', 'scout', 'shop'];
export const FAC_NAME: Record<FacKey, string> = { field: '練習場', youth: 'ユースの施設', stadium: 'スタジアム', medical: 'メディカル施設', dorm: '寮', scout: 'スカウト部', shop: 'グッズショップ' };
export const FAC_NOTE: Record<FacKey, string> = {
  field: '練習での伸びがはっきり大きくなる', youth: 'ユースに入ってくる子の数と素質が上がる', stadium: '入るお客さんが増え、入場料が増える',
  medical: 'ケガの治りが早くなり、ケガもしにくくなる', dorm: '遠くの県の子も来てくれる',
  scout: 'スカウトが1回に調べる人数が増え、選手の潜在（★）が正確に見える', shop: 'グッズの売り上げが1段階ごとに15%増える',
};
/** 段階ごとの強化の費用（万円）と、かかる週 */
/* 問125：お金の桁をJリーグの目安にそろえたので、施設の値段も3倍にした */
const FAC_COST: Record<FacKey, number> = { field: 10500, youth: 7500, stadium: 27000, medical: 6600, dorm: 6000, scout: 4500, shop: 4500 };
export const facCost = (k: FacKey, next: number) => Math.round((FAC_COST[k] * next * (next + 1)) / 2 / 100) * 100;
export const facWeeks = (k: FacKey, next: number) => (k === 'stadium' ? 8 + next * 4 : 4 + next * 2);
export const STADIUM_CAP = [0, 5000, 9000, 15000, 24000, 36000];
export const MAX_FAC = 5;

export type MoneyKey = 'gate' | 'sponsor' | 'goods' | 'dist' | 'sales' | 'prize' | 'misc' | 'salary' | 'staff' | 'ops' | 'build' | 'buy' | 'interest' | 'miscx';
export const MONEY_NAME: Record<MoneyKey, string> = { gate: '入場料', sponsor: 'スポンサー', goods: 'グッズの売り上げ', dist: 'リーグからの分配金', ops: '試合の運営費・遠征費', sales: '選手を売ったお金', prize: '賞金', salary: '選手の給料', staff: 'ヘッドコーチ・コーチ・スカウトの給料', build: '施設づくり', buy: '選手を獲ったお金', interest: '借金の利息', misc: 'その他の収入（実績・ミッション・出来事）', miscx: 'その他の支出（契約解除・出来事）' };
export const INCOME_KEYS: MoneyKey[] = ['gate', 'sponsor', 'goods', 'dist', 'sales', 'prize', 'misc'];
export const EXPENSE_KEYS: MoneyKey[] = ['salary', 'staff', 'ops', 'build', 'buy', 'interest', 'miscx'];
export type Ledger = Record<MoneyKey, number>;
export const emptyLedger = (): Ledger => ({ gate: 0, sponsor: 0, goods: 0, dist: 0, sales: 0, prize: 0, misc: 0, salary: 0, staff: 0, ops: 0, build: 0, buy: 0, interest: 0, miscx: 0 });

/** 借金の上限（段で変わる） */
export const debtCap = (tier: number) => ({ 3: 60000, 2: 150000, 1: 300000 } as Record<number, number>)[tier] ?? 60000;
export const INTEREST = 0.03; // 1年あたり
/** スポンサー（1年ぶん、万円）：地元の会社が毎年出す。成績や人気で変わる */
export function sponsorYear(tier: number, pref: string, pop: number): number {
  /* 問125：Jリーグの目安（J3 約4億・J2 約7.5億・J1 約17億。給料に回せる分を、ほかのクラブと同じくらいにするため少し控えめ） */
  const base = ({ 3: 40000, 2: 75000, 1: 170000 } as Record<number, number>)[tier];
  return Math.round((base * (0.75 + prefScale(pref) * 0.35) * (0.8 + pop / 250)) / 100) * 100;
}
/** 入場者数と入場料（1試合、万円）：強さと人気で増え、スタジアムの大きさが上限 */
/** priceMul：PC版のチケットの値段（段の相場を1とした倍率）。高いと1人あたりは増えるが、お客さんが減る */
export function gate(tier: number, pref: string, pop: number, stadium: number, oppTier: number, cup: boolean, priceMul = 1): { fans: number; money: number } {
  const demand = (({ 3: 3000, 2: 7000, 1: 18000 } as Record<number, number>)[tier]) * (0.6 + prefScale(pref) * 0.5) * (0.7 + pop / 120) * (cup ? 0.8 + (3 - oppTier) * 0.15 : 1) * Math.pow(priceMul, -1.15);
  const fans = Math.round(Math.min(STADIUM_CAP[stadium] ?? 5000, demand));
  /* 客単価の目安：J3 約1,800円・J2 約2,300円・J1 約3,000円 */
  const per = (({ 3: 0.18, 2: 0.23, 1: 0.3 } as Record<number, number>)[tier] ?? 0.2) * priceMul;
  return { fans, money: Math.round((fans * per) / 10) * 10 };
}
/** グッズの売り上げ（ホームの試合1つ、万円）：お客さんの数×1人あたり。勝つと少し増える（問125） */
export function goodsSales(tier: number, fans: number, won: boolean): number {
  const per = ({ 3: 0.03, 2: 0.06, 1: 0.1 } as Record<number, number>)[tier] ?? 0.03;
  return Math.round((fans * per * (won ? 1.25 : 1)) / 10) * 10;
}
/** 試合の日の運営費（ホーム）と遠征費（アウェイ）（万円） */
export const opsCost = (tier: number, home: boolean) => (home ? ({ 3: 300, 2: 800, 1: 2000 } as Record<number, number>)[tier] : ({ 3: 150, 2: 300, 1: 500 } as Record<number, number>)[tier]) ?? 300;
/** リーグからの分配金（1年ぶん、万円） */
export const distYear = (tier: number) => ({ 3: 3000, 2: 15000, 1: 35000 } as Record<number, number>)[tier] ?? 3000;
/** 賞金（万円） */
export const leaguePrize = (tier: number, rank: number) => Math.round((({ 3: 3000, 2: 8000, 1: 20000 } as Record<number, number>)[tier] * Math.max(0, 13 - rank)) / 12 / 100) * 100;
export const CUP_PRIZE = [0, 300, 600, 1200, 2500, 5000, 12000]; // 勝ち進んだ回戦の数ごと
