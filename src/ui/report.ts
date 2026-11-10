/* 週の報告：伸びた項目が光る（+2以上。問25・感想 5）／大きな覚醒は全画面（「覚醒！！」、台詞なし：感想 6・7） */
import type { Player, ReportEntry } from '../core/types';
import { AT_F, AT_K } from '../core/constants';
import { $, esc, posTag } from './dom';
import { sfx } from './sound';

export function openReport(rep: ReportEntry[], find: (id: number) => Player | undefined, onPlayer: (id: number, back: () => void) => void, onClose: () => void, title = '週の報告', extra = '') {
  const layer = $('#layer');
  const list = rep.filter((r) => find(r.pid));
  const body = list.length ? list.map((r) => {
    const p = find(r.pid)!; const L = p.pos === 'GK' ? AT_K : AT_F;
    const lits = r.ups.map((u, i) => (u !== 0 ? `<span class="${u >= 2 ? 'lit' : ''}">${L[i]} ${r.after[i]} ${u > 0 ? `<b style="color:var(--ok)">+${u}</b>` : `<b style="color:var(--danger)">${u}</b>`}</span>` : '')).join('');
    const notes = [
      r.newSp ? `<span class="chip new">新しい特殊能力「${esc(r.newSp)}」</span>` : '',
      r.cured ? `<span class="chip new">悪い特殊能力「${esc(r.cured)}」を克服</span>` : '',
      r.aptUp ? `<span class="chip new">${r.aptUp}の適性が上がった</span>` : '',
      r.injNew ? `<span class="chip bad">ケガ（${p.inj}週）</span>` : '',
    ].join('');
    return `<button class="wkp ${r.awake ? 'hot' : ''}" data-pid="${p.id}"><div class="row">${posTag(p.pos)}<span class="grow pname">${esc(p.name)} <span class="pmeta">${p.age}歳</span></span>${r.awake ? '<span class="tag gold">覚醒</span>' : ''}</div>${lits ? `<div class="mini">${lits}</div>` : ''}${notes ? `<div class="chips">${notes}</div>` : ''}</button>`;
  }).join('') : `<div class="card muted">今週は大きな変化はなかった。</div>`;
  layer.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="in">
    <div class="bar"><h2>${esc(title)}</h2></div>
    ${extra}
    <div class="muted">光っているのは、大きく伸びた項目（+2以上）です。選手を押すとくわしく見られます。</div>
    <div class="wk">${body}</div></div></div>
    <div class="dock"><div class="in2 one"><button class="btn primary" id="rClose">ホームへ</button></div></div>`;
  const reopen = () => openReport(rep, find, onPlayer, onClose, title, extra);
  layer.querySelectorAll<HTMLElement>('[data-pid]').forEach((b) => b.addEventListener('click', () => onPlayer(+b.dataset.pid!, reopen)));
  $('#rClose').addEventListener('click', () => { layer.innerHTML = ''; onClose(); });
  const awakes = list.filter((r) => r.awake);
  if (awakes.length) showAwake(awakes, find, 0);
}
export function showAwake(list: ReportEntry[], find: (id: number) => Player | undefined, i: number) {
  if (i >= list.length) return;
  const r = list[i], p = find(r.pid); if (!p || !r.awake) return showAwake(list, find, i + 1);
  const L = p.pos === 'GK' ? AT_K : AT_F, a = r.awake;
  const el = document.createElement('div'); el.className = 'awake'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '覚醒');
  el.innerHTML = `<div class="box"><div class="kicker burst">覚醒！！</div><div class="who burst">${esc(p.name)}</div><div style="opacity:.85">${p.age}歳 ・ ${p.pos} ・ ${esc(p.origin)}</div>
    <div class="attrname">${L[a.i]}</div><div class="jump"><span class="from">${a.from}</span><span>→</span><span class="to burst">${a.to}</span></div>
    <button class="btn" id="aOk">続ける</button></div>`;
  document.body.appendChild(el);
  sfx('awake');
  const ok = el.querySelector('#aOk') as HTMLButtonElement; ok.focus();
  ok.addEventListener('click', () => { el.remove(); showAwake(list, find, i + 1); });
}
