/* 問126：ほかのクラブのお金の目安（裕福・ふつう・苦しい）と性格 */
import { finWord, STYLE_NOTE } from '../core/clubfin';
import type { Club } from '../core/world';
import { esc } from './dom';

/** 表の中の小さな印（ふつうは出さない） */
export function finTag(c: Club): string {
  if (c.me || !c.fin) return '';
  const w = finWord(c); if (w === 'ふつう') return '';
  return ` <span class="fin fin-${w === '裕福' ? 'rich' : 'poor'}" title="お金：${w}">${w}</span>`;
}
/** 相手のクラブの画面に出す1行 */
export function finLine(c: Club): string {
  if (c.me || !c.fin) return '';
  const w = finWord(c);
  return `<div class="muted small">お金：<span class="fin fin-${w === '裕福' ? 'rich' : w === '苦しい' ? 'poor' : 'mid'}">${w}</span> ・ 性格：${esc(c.fin.style)}（${esc(STYLE_NOTE[c.fin.style])}）</div>`;
}
