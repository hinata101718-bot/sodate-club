/* エンブレム：形と色の組み合わせ（企画書 3★） */
export interface Emblem { shape: number; pattern: number; c1: string; c2: string; symbol: number; }
export const SHAPES = ['盾', '丸', '六角形', 'ひし形', '旗'];
export const PATTERNS = ['無地', '縦じま', '横の帯', 'ななめ'];
export const SYMBOLS = ['星', '葉', '波', '山', 'ボール', 'なし'];
export const EMBLEM_COLORS = ['#ffffff', '#111827', '#c99a1c', '#b8402f', '#2c6aa0', '#2f7d4f', '#7a3fa0', '#e07a1f', '#1d7f8a', '#d94f8a'];
export const defaultEmblem = (c: string): Emblem => ({ shape: 0, pattern: 0, c1: c, c2: '#ffffff', symbol: 1 });
