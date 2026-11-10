/* 決まりごと（企画書 8・13） */
export type Pos = 'GK' | 'CB' | 'SB' | 'DM' | 'CM' | 'AM' | 'WG' | 'ST';
export const POS: Pos[] = ['GK', 'CB', 'SB', 'DM', 'CM', 'AM', 'WG', 'ST'];
export const POS_GROUP: Record<Pos, 'g' | 'd' | 'm' | 'f'> = { GK: 'g', CB: 'd', SB: 'd', DM: 'm', CM: 'm', AM: 'm', WG: 'f', ST: 'f' };
export const POS_NOTE: Record<Pos, string> = {
  GK: 'ゴールキーパー', CB: '守りの真ん中', SB: '守りの横（サイド）', DM: '中盤の後ろ寄り。守りの盾',
  CM: '中盤の真ん中。攻めと守りのつなぎ役', AM: '中盤の前寄り。攻めの組み立て役', WG: '攻めの横（サイド）', ST: '攻めの真ん中。点取り屋',
};
/** フィールドの選手の8項目 */
export const AT_F = ['スピード', 'シュート', 'パス', 'ドリブル', 'フィジカル', 'ディフェンス', 'スタミナ', 'IQ'];
/** キーパーの8項目（同じ位置に入れかえ：シュート→セービング、パス→キック、ドリブル→飛び出し、ディフェンス→ハイボール） */
export const AT_K = ['スピード', 'セービング', 'キック', '飛び出し', 'フィジカル', 'ハイボール', 'スタミナ', 'IQ'];
export const SPD = 0, SHT = 1, PAS = 2, DRI = 3, PHY = 4, DEF = 5, STA = 6, IQ = 7;
/** 画面に並べる順。フィールドは2列×4行、キーパーは上の段に「キーパーの技」 */
export const ORDER_F = [0, 1, 2, 3, 4, 5, 6, 7];
export const ORDER_K = [1, 3, 2, 5, 0, 4, 6, 7];
export const APT = ['×', '△', '○', '◎'];
/** 適性で試合に出せる力（◎そのまま・○少し下がる・△かなり・×大きく） */
export const APTF = [0.62, 0.8, 0.92, 1];
/** ポジションで大事な能力の重み */
export const W: Record<Pos, number[]> = {
  GK: [0.6, 3, 1, 1.5, 0.6, 1.6, 0.3, 1], CB: [0.8, 0.1, 0.6, 0.2, 1.6, 2.2, 0.6, 1.2], SB: [1.4, 0.2, 1, 0.8, 0.7, 1.4, 1.1, 0.8],
  DM: [0.6, 0.2, 1.2, 0.4, 1, 1.8, 1, 1.4], CM: [0.7, 0.5, 1.6, 0.9, 0.7, 0.9, 1.1, 1.5], AM: [0.8, 1, 1.6, 1.4, 0.4, 0.2, 0.7, 1.6],
  WG: [1.8, 0.9, 1, 1.6, 0.4, 0.2, 0.9, 0.8], ST: [1.3, 2.2, 0.5, 1, 1.2, 0.1, 0.6, 1],
};
export const NEAR: Record<Pos, Pos[]> = { GK: [], CB: ['SB', 'DM'], SB: ['CB', 'WG', 'CM'], DM: ['CB', 'CM'], CM: ['DM', 'AM'], AM: ['CM', 'WG', 'ST'], WG: ['SB', 'AM', 'ST'], ST: ['WG', 'AM'] };
export const FORM: Record<string, Pos[]> = {
  '4-3-3': ['GK', 'CB', 'CB', 'SB', 'SB', 'DM', 'CM', 'CM', 'WG', 'WG', 'ST'],
  '4-2-3-1': ['GK', 'CB', 'CB', 'SB', 'SB', 'DM', 'DM', 'AM', 'WG', 'WG', 'ST'],
  '4-4-2': ['GK', 'CB', 'CB', 'SB', 'SB', 'CM', 'CM', 'WG', 'WG', 'ST', 'ST'],
  '5-3-2': ['GK', 'CB', 'CB', 'CB', 'SB', 'SB', 'DM', 'CM', 'CM', 'ST', 'ST'],
  '3-4-3': ['GK', 'CB', 'CB', 'CB', 'DM', 'CM', 'SB', 'SB', 'WG', 'WG', 'ST'],
  '4-1-4-1': ['GK', 'CB', 'CB', 'SB', 'SB', 'DM', 'CM', 'CM', 'WG', 'WG', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'DM', 'CM', 'AM', 'SB', 'SB', 'ST', 'ST'],
};
/** 並び方の攻めの強さ（大きいほど攻め） */
export const FORM_ATK: Record<string, number> = { '4-3-3': 2, '4-2-3-1': 1, '4-4-2': 1, '5-3-2': -2, '3-4-3': 3, '4-1-4-1': -1, '3-5-2': 0 };
export type StyleName = 'ロングカウンター' | 'ポゼッション' | 'サイドアタック' | 'ローブロック' | 'ゲーゲンプレス';
export interface StyleDef { note: string; key: number[]; scene: Record<string, number>; chanceAdj: number; oppChance: number; }
export const STYLES: Record<StyleName, StyleDef> = {
  'ロングカウンター': { note: '奪ったら一気に前へ', key: [SPD], scene: { counter: 3, through: 1.6, longball: 2 }, chanceAdj: -0.4, oppChance: -0.6 },
  'ポゼッション': { note: '短いパスで崩す', key: [PAS, IQ], scene: { combo: 3, loose: 1.4, mid: 1 }, chanceAdj: 0.8, oppChance: 0 },
  'サイドアタック': { note: '横から上げて中で合わせる', key: [PAS, PHY], scene: { cross: 3, setpiece: 1.6 }, chanceAdj: 0.3, oppChance: 0 },
  'ローブロック': { note: '自陣に引いて固く守る', key: [DEF, PHY], scene: { counter: 1.6, setpiece: 1.3 }, chanceAdj: -1.2, oppChance: -1.6 },
  'ゲーゲンプレス': { note: '高い位置でボールを奪う', key: [STA, IQ], scene: { error: 3, loose: 1.6 }, chanceAdj: 0.6, oppChance: 0.5 },
};
export const STYLE_NAMES = Object.keys(STYLES) as StyleName[];
export const SCENE_BASE: Record<string, number> = { through: 1.4, dribble: 1.2, combo: 1.3, cross: 1.2, mid: 0.9, setpiece: 0.9, counter: 0.9, loose: 0.7, pk: 0.16, error: 0.4, longball: 0.6 };
export const SCENE_NAME: Record<string, string> = { through: '抜け出し', dribble: 'ドリブル突破', combo: '崩し', cross: 'クロスとヘディング', mid: 'ミドルシュート', setpiece: 'セットプレー', counter: 'カウンター', loose: 'こぼれ球', pk: 'PK', error: '守りのミス', longball: 'ロングボール' };
export function colorOf(v: number): 'c-gray' | 'c-bronze' | 'c-silver' | 'c-gold' { return v >= 90 ? 'c-gold' : v >= 80 ? 'c-silver' : v >= 70 ? 'c-bronze' : 'c-gray'; }
