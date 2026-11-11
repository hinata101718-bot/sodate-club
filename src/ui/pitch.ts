/* ピッチの図（試合前の画面・ベストイレブン）：ポジションごとに横に並べる */
import type { Pos } from '../core/constants';
import { esc } from './dom';

export interface Spot { pos: Pos; name: string; sub?: string; id?: number; mark?: string; hl?: boolean }
const ROW_Y: Record<Pos, number> = { GK: 91, CB: 78, SB: 67, DM: 57, CM: 46, AM: 35, WG: 24, ST: 12 };
/** 同じ高さに並ぶ選手を、左右に広げる（SB と WG は外側） */
function place(spots: Spot[]): { s: Spot; x: number; y: number }[] {
  const out: { s: Spot; x: number; y: number }[] = [];
  const rows: Pos[][] = [['GK'], ['CB', 'SB'], ['DM'], ['CM'], ['AM'], ['WG', 'ST']];
  for (const row of rows) {
    const inRow = spots.filter((x) => row.includes(x.pos)); if (!inRow.length) continue;
    const wide = inRow.filter((x) => x.pos === 'SB' || x.pos === 'WG'); const mid = inRow.filter((x) => !wide.includes(x));
    wide.forEach((s, i) => out.push({ s, x: i % 2 === 0 ? 13 : 87, y: ROW_Y[s.pos] }));
    const lo = wide.length ? 32 : 14, hi = wide.length ? 68 : 86;
    mid.forEach((s, i) => out.push({ s, x: mid.length === 1 ? 50 : lo + ((hi - lo) * i) / (mid.length - 1), y: ROW_Y[s.pos] }));
  }
  return out;
}
export function pitchHTML(spots: Spot[], tap = false): string {
  const lines = `<svg class="pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".6"><rect x="3" y="3" width="94" height="134" rx="1"/><path d="M3 70h94"/><circle cx="50" cy="70" r="11"/><rect x="25" y="3" width="50" height="20"/><rect x="25" y="117" width="50" height="20"/><rect x="38" y="3" width="24" height="7"/><rect x="38" y="130" width="24" height="7"/></g></svg>`;
  return `<div class="pitch" role="group" aria-label="ピッチの図">${lines}${place(spots).map(({ s, x, y }) => {
    const inner = `<span class="pp-pos">${s.pos}</span><span class="pp-name">${esc(s.name)}</span>${s.sub ? `<span class="pp-sub">${esc(s.sub)}</span>` : ''}${s.mark ? `<span class="pp-mark">${esc(s.mark)}</span>` : ''}`;
    return tap && s.id != null ? `<button class="pp ${s.hl ? 'hl' : ''}" style="left:${x}%;top:${y}%" data-pp="${s.id}">${inner}</button>` : `<div class="pp ${s.hl ? 'hl' : ''}" style="left:${x}%;top:${y}%">${inner}</div>`;
  }).join('')}</div>`;
}
