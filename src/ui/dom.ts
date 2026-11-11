import type { Line, Token } from '../core/types';
import { POS_GROUP, colorOf, type Pos } from '../core/constants';

export const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;
export const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll(s)] as T[];
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function tok(x: Token): string {
  if (typeof x === 'string') return esc(x);
  if ('sp' in x) return `<span class="spfire">特殊能力「${esc(x.sp)}」</span><span class="${x.me ? 'n-me' : 'n-op'}">${esc(x.t)}</span> `;
  return `<span class="${x.me ? 'n-me' : 'n-op'}">${esc(x.t)}</span>`;
}
export const lineHTML = (l: Line) => l.map(tok).join('');
export const posTag = (pos: Pos) => `<span class="pos ${POS_GROUP[pos]}">${pos}</span>`;
export const val = (v: number) => `<span class="v ${colorOf(v)}">${v}</span>`;
export const yen = (man: number) => {
  const neg = man < 0; const m = Math.abs(Math.round(man));
  const s = m >= 10000 ? `${Math.floor(m / 10000)}億${m % 10000 ? (m % 10000).toLocaleString() + '万' : ''}円` : `${m.toLocaleString()}万円`;
  return (neg ? '-' : '') + s;
};
let toastTimer = 0;
export function toast(msg: string) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.remove(), 2200);
}
/** keep：同じ画面を描き直すとき、いまの位置（スクロール）を保つ（選手登録などで、押すたびに上にもどらないように） */
export function sheet(html: string, dock = '', keep = false): HTMLElement {
  const layer = $('#layer');
  const prev = keep ? (layer.querySelector('.sheet') as HTMLElement | null)?.scrollTop ?? 0 : 0;
  layer.innerHTML = `<div class="sheet" role="dialog"><div class="in">${html}</div></div>${dock ? `<div class="dock">${dock}</div>` : ''}`;
  const s = layer.querySelector('.sheet') as HTMLElement; s.scrollTop = prev; return s;
}
export function closeSheet() { $('#layer').innerHTML = ''; }
