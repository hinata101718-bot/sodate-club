/* PC版の画面の共通部品 */
import { colorOf, POS_GROUP, AT_F, AT_K, type Pos } from '../core/constants';
import { ovr } from '../core/player';
import { potRange, potWord } from '../core/gm';
import { SP_MAP } from '../core/data/specials';
import type { Player } from '../core/types';
import type { GameState } from '../core/game';
import type { KV } from '../core/save';

export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');
export function yen(man: number) {
  const neg = man < 0; const m = Math.abs(Math.round(man));
  const s = m >= 10000 ? `${(m / 10000) >= 100 ? Math.round(m / 10000) : (m / 10000).toFixed(m % 10000 === 0 ? 0 : 1)}億円` : `${m.toLocaleString('ja-JP')}万円`;
  return (neg ? '−' : '') + s;
}
export const moneyCls = (v: number) => (v < 0 ? 'bad' : '');

/* ---------- 状態 ---------- */
export const S = {
  G: null as unknown as GameState | null,
  kv: null as unknown as KV,
  slot: 1,
  view: 'home',
  ui: {} as Record<string, any>,
};
export const G = () => S.G as GameState;

/* ---------- 操作（data-act） ---------- */
export type Act = (arg: string, el: HTMLElement, e: Event) => void;
export const ACT: Record<string, Act> = {};
export const CHANGE: Record<string, (v: string, arg: string, el: HTMLElement) => void> = {};
export const INPUT: Record<string, (v: string, arg: string, el: HTMLElement) => void> = {};
export function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!el) return;
    if (el.dataset.act === 'bg' && e.target !== el) return;
    const f = ACT[el.dataset.act!]; if (!f) return;
    e.preventDefault(); f(el.dataset.arg ?? '', el, e);
  });
  document.addEventListener('change', (e) => { const el = e.target as HTMLElement; const f = CHANGE[el.dataset.change ?? '']; if (f) f((el as HTMLInputElement).value, el.dataset.arg ?? '', el); });
  document.addEventListener('input', (e) => { const el = e.target as HTMLElement; const f = INPUT[el.dataset.input ?? '']; if (f) f((el as HTMLInputElement).value, el.dataset.arg ?? '', el); });
}

/* ---------- モーダル・トースト ---------- */
export function modal(html: string, cls = '', closable = true) {
  $('#modal').innerHTML = `<div class="modal-bg" ${closable ? 'data-act="bg"' : ''}><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
  const m = document.querySelector('#modal .modal') as HTMLElement | null; m?.scrollTo(0, 0);
}
export function modalKeep(html: string, cls = '', closable = true) {
  const old = document.querySelector('#modal .modal') as HTMLElement | null; const top = old?.scrollTop ?? 0;
  modal(html, cls, closable); const m = document.querySelector('#modal .modal') as HTMLElement | null; if (m) m.scrollTop = top;
}
export const closeModal = () => { $('#modal').innerHTML = ''; };
export const modalOpen = () => !!$('#modal').innerHTML;
export function toast(title: string, text: string, kind = 'info') {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = 'toast ' + kind;
  el.innerHTML = `<b>${esc(title)}</b>${esc(text)}`; box.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, 4200);
  while (box.children.length > 5) box.firstChild?.remove();
}
export function confirmBox(title: string, text: string, ok: string, fn: () => void, danger = false) {
  S.ui.confirm = fn;
  modal(`<h2>${esc(title)}</h2><div>${text}</div><div class="foot"><button class="btn" data-act="closeModal">やめる</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirmOk">${esc(ok)}</button></div>`);
}
ACT.closeModal = () => closeModal();
ACT.bg = () => { if (!S.ui.lockModal) closeModal(); };
ACT.confirmOk = () => { const f = S.ui.confirm; S.ui.confirm = null; closeModal(); f?.(); };

/* ---------- 選手の表示 ---------- */
export const posTag = (pos: Pos) => `<span class="pos ${POS_GROUP[pos]}">${pos}</span>`;
export const val = (v: number) => `<span class="v ${colorOf(v)}">${Math.floor(v)}</span>`;
export function ovrChip(o: number) {
  const bg = o >= 85 ? '#f3dd94' : o >= 78 ? '#f1d9bd' : o >= 70 ? '#f4e3d1' : o >= 62 ? '#d3ecdd' : o >= 54 ? '#dbe7f4' : '#e7ebe8';
  return `<span class="ovr-chip" style="background:${bg}">${o}</span>`;
}
export function starsHtml(lo: number, hi: number) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= lo ? '★' : i <= hi ? '<span style="opacity:.45">★</span>' : '<span class="off">★</span>';
  return `<span class="stars" title="潜在${lo === hi ? '' : '（見立てに幅がある）'}">${s}</span>`;
}
export const potHtml = (g: GameState, p: Player, skill?: number) => { const [lo, hi] = potRange(g, p, skill); return starsHtml(lo, hi); };
export { potWord };
export function spChips(p: Player, max = 3) {
  const good = p.sp.slice(0, max).map((s) => `<span class="chip good" title="${esc(SP_MAP[s]?.desc ?? '')}">${esc(s)}</span>`);
  const bad = p.bad.slice(0, 2).map((s) => `<span class="chip bad" title="${esc(SP_MAP[s]?.desc ?? '')}">${esc(s)}</span>`);
  const more = p.sp.length > max ? `<span class="chip">+${p.sp.length - max}</span>` : '';
  return `<span class="chips">${good.join('')}${more}${bad.join('')}</span>`;
}
export const fatColor = (f: number) => (f <= 25 ? 'var(--good)' : f <= 55 ? 'var(--warn)' : 'var(--bad)');
/** 体力の棒（疲れの反対） */
export const condBar = (p: Player) => { const v = Math.max(0, 100 - p.fat); return `<div class="bar" title="体力 ${Math.round(v)}（疲れ ${Math.round(p.fat)}）"><i style="width:${v}%;background:${fatColor(p.fat)}"></i></div>`; };
export const condWord = (c: number) => (c >= 2 ? '絶好調' : c >= 1 ? '好調' : c <= -2 ? '絶不調' : c <= -1 ? '不調' : 'ふつう');
export const condArrow = (c: number) => (c >= 2 ? '<span class="good">⬆</span>' : c >= 1 ? '<span class="good">↗</span>' : c <= -2 ? '<span class="bad">⬇</span>' : c <= -1 ? '<span class="bad">↘</span>' : '<span class="muted">→</span>');
export const statNames = (p: Player) => (p.pos === 'GK' ? AT_K : AT_F);
export { ovr };

/* ---------- 折れ線グラフ（1系列・ホバーで値） ---------- */
const CHARTS: Record<string, { pts: { x: number; y: number; label: string; v: string }[]; W: number; H: number }> = {};
export function lineChart(id: string, pts: { label: string; y: number }[], opt: { w?: number; h?: number; invert?: boolean; yMin?: number; yMax?: number; ticks?: number[]; fmt?: (v: number, tip?: boolean) => string; zero?: boolean; aria?: string } = {}) {
  const W = opt.w || 620, H = opt.h || 180, P = { l: 62, r: 14, t: 12, b: 24 };
  if (pts.length < 2) return `<div class="empty">記録がたまると、グラフが出ます</div>`;
  const ys = pts.map((p) => p.y);
  let y0 = opt.yMin ?? Math.min(...ys), y1 = opt.yMax ?? Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08; if (opt.yMin == null) y0 -= pad; if (opt.yMax == null) y1 += pad;
  const X = (i: number) => P.l + ((W - P.l - P.r) * i) / (pts.length - 1);
  const Y = (v: number) => (opt.invert ? P.t + ((H - P.t - P.b) * (v - y0)) / (y1 - y0) : H - P.b - ((H - P.t - P.b) * (v - y0)) / (y1 - y0));
  const ticks = opt.ticks || [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1];
  const fy = opt.fmt || ((v: number) => fmt(v));
  let grid = ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${esc(fy(t))}</text>`).join('');
  if (opt.zero && y0 < 0 && y1 > 0) grid += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--bad)" stroke-opacity=".5" stroke-dasharray="3 3"/>`;
  const step = Math.max(1, Math.ceil(pts.length / 6));
  const xl = pts.map((p, i) => (i % step === 0 || i === pts.length - 1 ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" fill="var(--muted)" font-size="11">${esc(p.label)}</text>` : '')).join('');
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = opt.invert ? '' : `<path d="${d}L${X(pts.length - 1)},${H - P.b}L${X(0)},${H - P.b}Z" fill="var(--data)" fill-opacity=".1"/>`;
  const last = pts[pts.length - 1];
  CHARTS[id] = { pts: pts.map((p, i) => ({ x: X(i) / W, y: Y(p.y) / H, label: p.label, v: fy(p.y, true) })), W, H };
  return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || '推移のグラフ')}">${grid}${area}<path d="${d}" fill="none" stroke="var(--data)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${X(pts.length - 1)}" cy="${Y(last.y)}" r="4" fill="var(--data)" stroke="var(--panel)" stroke-width="2"/>${xl}
  <line class="cross" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" stroke="var(--fg2)" stroke-opacity="0" stroke-width="1"/><circle class="hov" r="5" cx="-10" cy="-10" fill="var(--data)" stroke="var(--panel)" stroke-width="2"/>
  <rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/></svg><div class="tip" hidden></div></div>`;
}
document.addEventListener('pointermove', (e) => {
  const el = (e.target as HTMLElement).closest?.('.chart') as HTMLElement | null;
  document.querySelectorAll<HTMLElement>('.chart .tip').forEach((t) => { if (!el || !el.contains(t)) t.hidden = true; });
  if (!el) return; const c = CHARTS[el.dataset.chart!]; if (!c) return;
  const r = el.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width;
  let best = c.pts[0]; for (const p of c.pts) if (Math.abs(p.x - fx) < Math.abs(best.x - fx)) best = p;
  const svg = el.querySelector('svg')!; const cross = svg.querySelector('.cross')!; const hov = svg.querySelector('.hov')!;
  cross.setAttribute('x1', String(best.x * c.W)); cross.setAttribute('x2', String(best.x * c.W)); cross.setAttribute('stroke-opacity', '.4');
  hov.setAttribute('cx', String(best.x * c.W)); hov.setAttribute('cy', String(best.y * c.H));
  const tip = el.querySelector<HTMLElement>('.tip')!; tip.hidden = false; tip.innerHTML = `${esc(best.label)}　<b class="num">${esc(best.v)}</b>`;
  tip.style.left = best.x * r.width + 'px'; tip.style.top = best.y * r.height + 'px';
});
