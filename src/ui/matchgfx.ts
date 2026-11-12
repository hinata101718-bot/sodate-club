/* 試合の図（問135・137・138・139）：試合の数字の表・流れのグラフ・シュートの位置の図・1対1の図・交代の一覧 */
import type { MatchView } from '../core/types';
import { esc } from './dom';

const ME = 'var(--nm-me)', OP = 'var(--nm-op)';
const colOf = (m: MatchView, side: 0 | 1) => ((side === 0 ? m.home.me : m.away.me) ? ME : OP);

/** ピッチの線（105×68） */
const pitchLines = `<rect x="0.5" y="0.5" width="104" height="67" rx="1" class="pg-turf"/>
  <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" class="pg-ln"/><circle cx="52.5" cy="34" r="9.15" class="pg-ln"/>
  <rect x="0.5" y="13.85" width="16.5" height="40.3" class="pg-ln"/><rect x="88" y="13.85" width="16.5" height="40.3" class="pg-ln"/>
  <rect x="0.5" y="24.85" width="5.5" height="18.3" class="pg-ln"/><rect x="99" y="24.85" width="5.5" height="18.3" class="pg-ln"/>
  <rect x="-1.5" y="30.34" width="2" height="7.32" class="pg-goal"/><rect x="104.5" y="30.34" width="2" height="7.32" class="pg-goal"/>`;

/** 問139：流れのグラフ。upto（分）までだけ描く（試合中はだんだん伸びる） */
export function flowSVG(m: MatchView, upto = 90): string {
  const g = m.flowG; if (!g) return '';
  const W = 180, H = 44, mid = H / 2, bw = W / 18;
  const bars = g.pts.map((v, i) => {
    if (i * 5 >= upto) return '';
    const h = Math.abs(v) * (mid - 3); const y = v >= 0 ? mid - h : mid;
    return `<rect x="${(i * bw + 0.6).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 1.2).toFixed(1)}" height="${Math.max(0.6, h).toFixed(1)}" rx="1" fill="${v >= 0 ? colOf(m, 0) : colOf(m, 1)}" opacity="0.85"/>`;
  }).join('');
  const mk = g.marks.filter((x) => x.min <= upto).map((x) => {
    const cx = Math.min(W - 2, (x.min / 90) * W); const cy = x.side === 0 ? 3 : H - 3;
    if (x.kind === 'goal') return `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="2.4" fill="${colOf(m, x.side)}" stroke="var(--card)" stroke-width="0.8"/>`;
    if (x.kind === 'red') return `<rect x="${(cx - 1.6).toFixed(1)}" y="${cy - 2.2}" width="3.2" height="4.4" fill="#d33" rx="0.5"/>`;
    return `<path d="M${cx.toFixed(1)} ${x.side === 0 ? cy + 2 : cy - 2} l-1.6 ${x.side === 0 ? -3 : 3} h3.2z" fill="var(--muted)"/>`;
  }).join('');
  return `<svg class="flowg" viewBox="0 0 ${W} ${H}" role="img" aria-label="試合の流れのグラフ。上に伸びると${esc(m.home.name)}、下に伸びると${esc(m.away.name)}が押していた">
    <line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="var(--line)" stroke-width="0.6"/><line x1="${W / 2}" y1="2" x2="${W / 2}" y2="${H - 2}" stroke="var(--line)" stroke-width="0.4" stroke-dasharray="1.5 1.5"/>${bars}${mk}</svg>`;
}
export function flowLegend(m: MatchView): string {
  return `<div class="flowleg small"><span><b style="color:${colOf(m, 0)}">▲</b> ${esc(m.home.name)}が押した</span><span><b style="color:${colOf(m, 1)}">▼</b> ${esc(m.away.name)}が押した</span><span>● ゴール ・ ■ 退場 ・ △ 交代</span></div>`;
}

/** 問135：試合の数字の表 */
export function statsHTML(m: MatchView): string {
  const s = m.stats; if (!s) return '';
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const rows: [string, string, string][] = [
    ['ボールを持った割合', `${s.poss[0]}%`, `${s.poss[1]}%`],
    ['シュート（枠内）', `${s.sh[0]}（${s.ot[0]}）`, `${s.sh[1]}（${s.ot[1]}）`],
    ['パス（成功率）', `${s.pa[0]}（${pct(s.pc[0], s.pa[0])}%）`, `${s.pa[1]}（${pct(s.pc[1], s.pa[1])}%）`],
    ['コーナーキック', `${s.ck[0]}`, `${s.ck[1]}`],
    ['ファウル', `${s.fo[0]}`, `${s.fo[1]}`],
    ['イエロー・レッド', `${s.yc[0]}・${s.rc[0]}`, `${s.yc[1]}・${s.rc[1]}`],
    ['オフサイド', `${s.off[0]}`, `${s.off[1]}`],
    ['キーパーのセーブ', `${s.sv[0]}`, `${s.sv[1]}`],
  ];
  const bar = (i: number) => { const a = [s.poss, s.sh, s.pa, s.ck, s.fo, null, s.off, s.sv][i]; if (!a) return ''; const t = a[0] + a[1] || 1; return `<div class="stbar"><span style="width:${(a[0] / t) * 100}%;background:${colOf(m, 0)}"></span><span style="width:${(a[1] / t) * 100}%;background:${colOf(m, 1)}"></span></div>`; };
  return `<table class="mstats"><thead><tr><th style="color:${colOf(m, 0)}">${esc(m.home.name)}</th><th></th><th style="color:${colOf(m, 1)}">${esc(m.away.name)}</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${r[1]}</td><td class="lb">${r[0]}${bar(i)}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>`;
}

/** 問139：シュートの位置の図（押すと、近いシュートのことが出る） */
export function shotMapHTML(m: MatchView, id: string): string {
  const sh = m.shots; if (!sh?.length) return '';
  const dots = sh.map((x) => {
    const c = colOf(m, x.side); const r = x.goal ? 2.2 : 1.2;
    const shape = x.sp ? `<rect x="${(x.x - r).toFixed(1)}" y="${(x.y - r).toFixed(1)}" width="${r * 2}" height="${r * 2}" transform="rotate(45 ${x.x} ${x.y})"` : `<circle cx="${x.x}" cy="${x.y}" r="${r}"`;
    return `${shape} fill="${x.goal || x.ot ? c : 'none'}" stroke="${c}" stroke-width="${x.goal ? 0.9 : 0.5}" opacity="${x.goal ? 1 : 0.85}"/>`;
  }).join('');
  return `<div class="shotmap"><svg id="${id}" viewBox="-2 -1 109 70" role="img" aria-label="シュートの位置の図。${esc(m.home.name)}は右のゴールへ、${esc(m.away.name)}は左のゴールへ攻めた">${pitchLines}${dots}</svg>
    <div class="flowleg small"><span>大きい印＝ゴール ・ 塗り＝枠内 ・ ひし形＝セットプレー</span><span>← <b style="color:${colOf(m, 1)}">${esc(m.away.name)}</b>　<b style="color:${colOf(m, 0)}">${esc(m.home.name)}</b> →</span></div>
    <div class="shotinfo small muted" id="${id}-info">図を押すと、近くのシュートが誰のものか出る。</div></div>`;
}
export function bindShotMap(m: MatchView, root: HTMLElement, id: string) {
  const svg = root.querySelector<SVGSVGElement>('#' + id); const info = root.querySelector<HTMLElement>('#' + id + '-info'); if (!svg || !info || !m.shots) return;
  svg.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = svg.getBoundingClientRect(); const x = ((e.clientX - b.left) / b.width) * 109 - 2; const y = ((e.clientY - b.top) / b.height) * 70 - 1;
    let best = m.shots![0]; let bd = 1e9; for (const s of m.shots!) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
    const team = best.side === 0 ? m.home : m.away;
    info.classList.remove('muted');
    info.innerHTML = `<b>${best.min}分</b> <span class="${team.me ? 'n-me' : 'n-op'}">${esc(best.who)}</span>（${esc(team.name)}）・ ${esc(best.how)} ・ ${best.goal ? '<b>ゴール</b>' : best.ot ? '枠内（キーパーが止めた）' : '枠の外・ブロック'}`;
  });
}

/** 問138：1対1の図（自分が右へ攻める向き。数字は自分の選手の勝ち−負け） */
export function duelMapHTML(m: MatchView): string {
  const d = m.duels; if (!d?.length) return '';
  const used: Record<string, number> = {};
  const chips = d.map((x) => {
    const n = (used[x.zone] = (used[x.zone] ?? 0) + 1) - 1; const y = x.y + (x.y < 34 ? n * 9 : x.y > 34 ? -n * 9 : n * 9 - 4);
    const good = x.w > x.l, bad = x.l > x.w;
    return `<g><rect x="${x.x - 12}" y="${y - 4.2}" width="24" height="8.4" rx="2" fill="var(--card)" stroke="${good ? ME : bad ? OP : 'var(--line)'}" stroke-width="0.8"/><text x="${x.x}" y="${y + 1.6}" text-anchor="middle" class="pg-t b" fill="${good ? ME : bad ? OP : 'currentColor'}">${x.w}勝${x.l}敗</text></g>`;
  }).join('');
  return `<svg class="duelmap" viewBox="-2 -1 109 70" role="img" aria-label="1対1の図。うちの選手の勝ち負けを、場所ごとに出している">${pitchLines}${chips}</svg>
    <div class="flowleg small"><span>うちは右のゴールへ攻める向き。右側＝うちの攻め、左側＝うちの守り</span></div>
    <ul class="duellist small">${d.map((x) => `<li><span class="tag">${esc(DUEL_ZONE[x.zone] ?? x.zone)}</span> <span class="n-me">${esc(x.me)}</span> 対 <span class="n-op">${esc(x.opp)}</span>：<b>${x.w}勝${x.l}敗</b></li>`).join('')}</ul>`;
}
const DUEL_ZONE: Record<string, string> = { R: '右サイドの攻め', L: '左サイドの攻め', C: '前線', G: 'シュート対キーパー', Rd: '右サイドの守り', Ld: '左サイドの守り', Cd: 'ゴール前の守り', Gd: 'キーパー' };

/** 問137：交代の一覧（入った選手がどうだったか） */
export function subsHTML(m: MatchView): string {
  const s = m.subs; if (!s?.length) return '';
  const rows = [...s].sort((a, b) => a.min - b.min).map((x) => { const t = x.side === 0 ? m.home : m.away;
    return `<div class="row"><span class="tag">${x.min}分</span><span class="grow"><span class="${t.me ? 'n-me' : 'n-op'}">${esc(x.off)} → ${esc(x.on)}</span> <span class="muted small">${esc(x.why)}</span></span><span class="small">${x.g ? `⚽${x.g > 1 ? x.g : ''} ` : ''}${x.a ? `A${x.a > 1 ? x.a : ''} ` : ''}${x.rt != null ? `<b>${x.rt.toFixed(1)}</b>` : ''}</span></div>`; }).join('');
  return `<div class="list">${rows}</div>`;
}
/** 問134：カード */
export function cardsHTML(m: MatchView): string {
  const c = m.cards; if (!c?.length) return '';
  return `<div class="small" style="margin-top:6px">${[...c].sort((a, b) => a.min - b.min).map((x) => { const t = x.side === 0 ? m.home : m.away; return `<span class="cardi ${x.red ? 'red' : 'yel'}" aria-label="${x.red ? 'レッド' : 'イエロー'}"></span><span class="${t.me ? 'n-me' : 'n-op'}">${esc(x.who)}</span> ${x.min}分`; }).join('　')}</div>`;
}
