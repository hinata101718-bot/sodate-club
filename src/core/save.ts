/* セーブ（企画書 15：自動セーブ1つ＋手動3枠）。版の番号つき。どの読み書きも、失敗しても落ちない */
import { SAVE_VERSION, myTier, type GameState } from './game';
import { MIGRATIONS } from './migrate';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; }
export const AUTO_KEY = 'sodate-club:auto';
export const slotKey = (i: number) => `sodate-club:slot${i}`;
export interface SaveFile { v: number; savedAt: string; summary: string; state: GameState; }
export interface SlotInfo { key: string; label: string; exists: boolean; summary: string; savedAt: string; broken: boolean; }

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
/** localStorage が使えないとき（プライベートブラウズなど）は、その場だけのメモリに保存する */
export function safeStorage(): KV {
  try {
    const ls = globalThis.localStorage; const t = '__sodate_test__';
    ls.setItem(t, '1'); ls.removeItem(t);
    return {
      getItem: (k) => { try { return ls.getItem(k); } catch { return null; } },
      setItem: (k, v) => { ls.setItem(k, v); },
      removeItem: (k) => { try { ls.removeItem(k); } catch { /* なにもしない */ } },
    };
  } catch { return memoryKV(); }
}

export function summaryOf(G: GameState): string { return `${G.club.name} ・ ${G.season}年目 ・ ${myTier(G)}部`; }

export function saveTo(kv: KV, key: string, G: GameState): boolean {
  try {
    const f: SaveFile = { v: G.version, savedAt: new Date().toISOString(), summary: summaryOf(G), state: G };
    kv.setItem(key, JSON.stringify(f));
    return true;
  } catch { return false; }
}
/** 古い版のセーブを、いまの版に変換する */
export function migrate(raw: any): GameState {
  let s = raw;
  let v = typeof s.version === 'number' ? s.version : 1;
  while (v < SAVE_VERSION) {
    const f = MIGRATIONS[v];
    if (!f) throw new Error('変換できない版: ' + v);
    s = f(s); v++; s.version = v;
  }
  return s as GameState;
}
export function readFile(kv: KV, key: string): SaveFile | null {
  try {
    const txt = kv.getItem(key); if (!txt) return null;
    const f = JSON.parse(txt);
    if (!f || typeof f !== 'object' || !f.state) return null;
    return f as SaveFile;
  } catch { return null; }
}
export function loadFrom(kv: KV, key: string): GameState | null {
  try {
    const f = readFile(kv, key); if (!f) return null;
    const G = migrate(f.state);
    if (!G || !Array.isArray(G.squad) || !G.club) return null;
    return G;
  } catch { return null; }
}
export function listSlots(kv: KV): SlotInfo[] {
  const keys = [{ key: AUTO_KEY, label: '自動セーブ' }, ...[1, 2, 3].map((i) => ({ key: slotKey(i), label: `手動 ${i}` }))];
  return keys.map(({ key, label }) => {
    let txt: string | null = null; try { txt = kv.getItem(key); } catch { txt = null; }
    const f = readFile(kv, key);
    return { key, label, exists: !!f, summary: f?.summary ?? '', savedAt: f?.savedAt ?? '', broken: !!txt && !f };
  });
}
export function removeSave(kv: KV, key: string) { try { kv.removeItem(key); } catch { /* なにもしない */ } }
