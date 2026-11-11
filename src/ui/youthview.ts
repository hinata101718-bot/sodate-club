/* ユースの画面：名前とひとことの評価、月1回の報告（言葉と矢印）、春の昇格会議（ここで初めて数字が見える） */
import { decidePromo, type GameState } from '../core/game';
import { AT_F, AT_K, ORDER_F, ORDER_K } from '../core/constants';
import { ovr } from '../core/player';
import type { Player } from '../core/types';
import { $, $$, esc, posTag, sheet, val } from './dom';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
export function youthHTML(G: GameState, sel: Set<number>): string {
  if (G.promo?.open) return promoHTML(G, sel);
  const rep = G.youthLog[G.youthLog.length - 1];
  const lineOf = (p: Player) => rep?.lines.find((l) => l.pid === p.id);
  /* 問91：学年を上で切りかえ、1人1行（押すと伸び方とくわしく見るボタン） */
  const seg = `<div class="seg" role="group" aria-label="学年">${[3, 2, 1].map((g) => `<button data-ygr="${g}" aria-pressed="${yGrade === g}">${g}年（${G.youth.filter((p) => p.grade === g).length}）</button>`).join('')}</div><div style="height:10px"></div>`;
  const list = G.youth.filter((p) => p.grade === yGrade);
  const rows = list.map((p) => { const l = lineOf(p); const key = `y:${p.id}`; const open = yOpen === key;
    return `<div class="srow-wrap"><button class="srow" data-yopen="${key}" aria-expanded="${open}">${posTag(p.pos)}<span class="grow sname">${p.fav ? '<span class="favmark">★</span>' : ''}${esc(p.name)}</span>${l ? `<span class="small">${l.arrow}</span><span class="small" style="color:var(--gold)">${stars(l.stars)}</span>` : ''}<span class="chev" aria-hidden="true">${open ? '▲' : '▼'}</span></button>
      ${open ? `<div class="sdetail"><div class="small">${p.age}歳 ・ ${esc(p.pref)}${l ? ` ・ <b>${esc(l.words)} ${l.arrow}</b>` : ''}</div>${l ? `<div class="muted small">「${esc(l.comment)}」</div>` : ''}<button class="btn small ghost" data-yid="${p.id}" style="margin-top:6px;align-self:flex-start">くわしく見る</button></div>` : ''}</div>`; }).join('');
  const repCard = rep ? `<section class="card"><h2>${rep.month}月の報告会議</h2><div>${esc(rep.coach)}</div><button class="btn small ghost" data-act="ylog" style="margin-top:8px">報告をくわしく見る</button></section>` : `<section class="card"><h2>報告会議</h2><div class="muted small">毎月はじめ（3月〜12月）に、ユースコーチから報告がある。</div></section>`;
  return `${repCard}${seg}<section class="card"><h2>${yGrade}年</h2><div class="slist">${rows || '<div class="muted">いない</div>'}</div><div class="muted small" style="margin-top:8px">★はユースコーチの見立て（どこまで伸びそうか）。数字が見えるのは、2月の「春の昇格会議」のときだけ。</div></section>`;
}
let yGrade = 3; let yOpen = '';
function promoHTML(G: GameState, sel: Set<number>): string {
  const room = 35 - G.squad.length;
  const list = [...G.youth].sort((a, b) => (b.grade || 0) - (a.grade || 0) || ovr(b) - ovr(a));
  const rep = G.youthLog[G.youthLog.length - 1];
  return `<section class="card"><h2>春の昇格会議</h2><div class="goal">トップに上げる子を選ぶ</div>
    <div class="muted">ここで初めて、ユースの子の数字が見える。上げなかった3年は卒業してクラブを去る。1・2年はあと1年ユースに残る。コーチのおすすめが、はじめから選ばれている。</div>
    <div style="margin-top:6px">トップは今 <b>${G.squad.length}人</b>（35人まで）・ 選んだ子 <b>${sel.size}人</b>${sel.size > room ? ' <span class="tag bad">多すぎる</span>' : ''}</div></section>
  ${list.map((p) => { const L = p.pos === 'GK' ? AT_K : AT_F; const O = p.pos === 'GK' ? ORDER_K : ORDER_F; const l = rep?.lines.find((x) => x.pid === p.id); const on = sel.has(p.id);
    return `<section class="card" style="${on ? 'border:2px solid var(--club)' : ''}"><div class="row">${posTag(p.pos)}<span class="grow pname">${esc(p.name)} <span class="pmeta">${p.grade}年 ・ ${p.age}歳</span></span><span class="ovr">${val(ovr(p))}</span></div>
      <div class="mini" style="margin-top:8px">${O.map((i) => `<span>${L[i]} ${val(Math.floor(p.a[i]))}</span>`).join('')}</div>
      ${l ? `<div class="muted small" style="margin-top:6px">コーチ：「${esc(l.comment)}」 <span style="color:var(--gold)">${stars(l.stars)}</span></div>` : ''}
      ${p.sp.length ? `<div class="chips" style="margin-top:6px">${p.sp.map((s) => `<span class="chip good">${esc(s)}</span>`).join('')}</div>` : ''}
      <button class="btn ${on ? 'primary' : 'ghost'} wide" style="margin-top:8px" data-psel="${p.id}">${on ? 'トップに上げる（選んだ）' : p.grade === 3 ? '上げない（卒業）' : '上げない（ユースに残る）'}</button></section>`; }).join('')}
  <button class="btn primary wide" data-act="promo" ${sel.size > room ? 'disabled' : ''}>この内容で決める</button>`;
}
export function bindYouth(G: GameState, root: HTMLElement, sel: Set<number>, rerender: () => void, done: (msgs: string[]) => void) {
  $$<HTMLElement>('[data-psel]', root).forEach((b) => b.addEventListener('click', () => { const id = +b.dataset.psel!; if (sel.has(id)) sel.delete(id); else sel.add(id); rerender(); }));
  $$<HTMLElement>('[data-act="promo"]', root).forEach((b) => b.addEventListener('click', () => { done(decidePromo(G, [...sel])); }));
  $$<HTMLElement>('[data-act="ylog"]', root).forEach((b) => b.addEventListener('click', () => openYouthLog(G, rerender)));
  $$<HTMLElement>('[data-ygr]', root).forEach((b) => b.addEventListener('click', () => { yGrade = +b.dataset.ygr!; yOpen = ''; rerender(); }));
  $$<HTMLElement>('[data-yopen]', root).forEach((b) => b.addEventListener('click', () => { yOpen = yOpen === b.dataset.yopen ? '' : b.dataset.yopen!; rerender(); }));
  $$<HTMLElement>('[data-yid]', root).forEach((b) => b.addEventListener('click', () => openYouthPlayer(G, +b.dataset.yid!, rerender)));
}
export function openYouthLog(G: GameState, back: () => void) {
  const reps = [...G.youthLog].reverse();
  const nm = (id: number) => G.youth.find((p) => p.id === id);
  sheet(`<div class="bar"><h2>ユースの報告会議</h2></div>${reps.map((rep) => `<section class="card"><h2>${rep.season}年目 ${rep.month}月</h2><div>${esc(rep.coach)}</div>
    <div class="list" style="margin-top:8px">${rep.lines.filter((l) => nm(l.pid)).map((l) => { const p = nm(l.pid)!; return `<div class="slot" style="flex-direction:column;align-items:stretch;gap:2px"><div class="row">${posTag(p.pos)}<b class="grow">${esc(p.name)}</b><span class="small">${p.grade}年</span></div>
      <div class="small">ユースの試合 ${l.apps}試合 ${l.goals}点 ・ <b>${esc(l.words)} ${l.arrow}</b></div><div class="muted small">「${esc(l.comment)}」 <span style="color:var(--gold)">${stars(l.stars)}</span></div></div>`; }).join('')}</div></section>`).join('') || '<div class="card muted">まだ報告はない。</div>'}`,
    `<div class="in2 one"><button class="btn primary" id="yBack">もどる</button></div>`);
  $('#yBack').addEventListener('click', () => { $('#layer').innerHTML = ''; back(); });
}
function openYouthPlayer(G: GameState, id: number, back: () => void) {
  const p = G.youth.find((x) => x.id === id); if (!p) return;
  const lines = G.youthLog.map((r) => ({ r, l: r.lines.find((x) => x.pid === id) })).filter((x) => x.l).reverse();
  sheet(`<div class="bar"><h2>${esc(p.name)}</h2><span class="tag">ユース ${p.grade}年</span></div>
    <div class="row wrap">${posTag(p.pos)}<span class="muted">${p.age}歳 ・ ${p.height}cm ・ 利き足 ${p.foot === '両' ? '両足' : p.foot} ・ ${esc(p.pref)}出身</span></div>
    <button class="btn ${p.fav ? 'primary' : 'ghost'} wide favbtn" id="yFav" aria-pressed="${!!p.fav}">${p.fav ? '★ お気に入り（もう一度押すと外す）' : '☆ お気に入りにする'}</button>
    <section class="card"><h2>能力</h2><div class="muted">数字は、春の昇格会議で初めて見える。</div></section>
    <section class="card"><h2>成長の記録</h2>${lines.length ? `<div class="list">${lines.map(({ r, l }) => `<div class="row"><span class="tag">${r.month}月</span><span class="grow">${esc(l!.words)} <b>${l!.arrow}</b></span><span class="small muted">${l!.apps}試合 ${l!.goals}点</span></div>`).join('')}</div>` : '<div class="muted">まだ報告はない。</div>'}</section>
    <section class="card"><h2>記録</h2><div class="muted">ユースの試合 通算 ${p.yApps || 0}試合 ${p.yGoals || 0}点</div></section>`,
    `<div class="in2 one"><button class="btn primary" id="yBack">もどる</button></div>`);
  $('#yBack').addEventListener('click', () => { $('#layer').innerHTML = ''; back(); });
  $('#yFav').addEventListener('click', () => { p.fav = !p.fav; openYouthPlayer(G, id, back); });
}
