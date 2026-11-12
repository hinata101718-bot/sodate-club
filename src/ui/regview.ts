/* 選手登録の会議（感想42・問117）：監督・コーチ・スカウトがおすすめを言い、オーナーが23人を決める */
import { applyReg, REG_SIZE, swapReg, regd } from '../core/squad';
import { ovr } from '../core/player';
import type { GameState } from '../core/game';
import { $, $$, esc, posTag, sheet, toast, val } from './dom';

export function openRegMeet(G: GameState, done: (msg: string[]) => void, back: () => void) {
  const m = G.regm; if (!m?.open) { back(); return; }
  let first = true;
  const draw = () => {
    const keep = !first; first = false;
    const sel = new Set(m.sel); const gk = G.squad.filter((p) => sel.has(p.id) && p.pos === 'GK').length;
    const order: Record<string, number> = { GK: 0, CB: 1, SB: 2, DM: 3, CM: 4, AM: 5, WG: 6, ST: 7 };
    const list = [...G.squad].sort((a, b) => order[a.pos] - order[b.pos] || ovr(b) - ovr(a));
    const coachSet = new Set(m.coach); const recSet = new Set(m.rec); const sc = new Map(m.scout.map((x) => [x.pid, x.text]));
    const nm = (id: number) => G.squad.find((p) => p.id === id)?.name ?? '';
    const rows = list.map((p) => { const on = sel.has(p.id);
      return `<button class="pl regrow ${on ? 'on' : ''}" data-rg="${p.id}" aria-pressed="${on}">${posTag(p.pos)}<span style="min-width:0"><span class="pname">${esc(p.name)}${recSet.has(p.id) ? ' <span class="tag">監督</span>' : ''}${coachSet.has(p.id) ? ' <span class="tag gold">コーチ</span>' : ''}${sc.has(p.id) ? ' <span class="tag away">新加入</span>' : ''}</span><br><span class="pmeta">${p.age}歳${p.inj ? ` ・ ケガ（あと${p.inj}週）` : ''}${sc.has(p.id) ? ` ・ スカウト「${esc(sc.get(p.id)!)}」` : ''}</span></span><span class="regend"><span class="regchk" aria-hidden="true">${on ? '✓' : ''}</span><span class="ovr">${val(ovr(p))}</span></span></button>`; }).join('');
    sheet(`<div class="bar"><h2>選手登録の会議</h2><span class="tag">${m.kind}</span></div>
      <section class="card"><div class="goal">試合に出られる${REG_SIZE}人を決める</div><div class="muted small">登録から外れた選手は、次の登録（${m.kind === '開幕前' ? '夏の中断期間' : '来年の開幕前'}）まで試合に出られない（練習はする）。登録の期間中は、4週以上のケガ人が出たときだけ入れかえられる。決めずに進むと、監督のおすすめどおりになる。</div></section>
      <section class="card"><div class="mspeak"><span class="mface" aria-hidden="true">監</span><div class="grow"><div class="mrole">監督</div><div class="mwho">${esc(G.mgr.name)}</div></div></div><div class="talk-bubble">試合で使いたい${m.rec.length}人を選びました。この顔ぶれでいきたいと思っています。</div>
        ${m.coach.length ? `<div class="mspeak" style="margin-top:10px"><span class="mface" aria-hidden="true">コ</span><div class="grow"><div class="mrole">コーチ</div><div class="mwho">${esc((G.owner.coaches.phys ?? G.owner.coaches.off)?.name ?? '')}</div></div></div><div class="talk-bubble">試合で使って伸ばしたいのは ${m.coach.map(nm).map(esc).join('、')} です。</div>` : ''}
        ${m.scout.length ? `<div class="mspeak" style="margin-top:10px"><span class="mface" aria-hidden="true">ス</span><div class="grow"><div class="mrole">スカウト</div><div class="mwho">${esc(G.owner.scouts[0]?.name ?? '')}</div></div></div><div class="talk-bubble">${m.scout.map((x) => `${esc(nm(x.pid))}：「${esc(x.text)}」`).join('<br>')}</div>` : ''}</section>
      <section class="card"><h2>登録 ${sel.size} / ${REG_SIZE}人 ${sel.size > REG_SIZE ? '<span class="tag bad">多すぎる</span>' : ''}${gk < 2 ? ' <span class="tag bad">キーパーが2人より少ない</span>' : ''}</h2>
        <div class="row" style="gap:6px;margin-bottom:8px"><button class="btn small ghost" id="rgRec">監督のおすすめにもどす</button></div><div class="plist">${rows}</div></section>`,
      `<div class="in2"><button class="btn ghost" id="rgBack">あとで</button><button class="btn primary" id="rgGo" ${sel.size > REG_SIZE || sel.size < 16 ? 'disabled' : ''}>この${sel.size}人で決める</button></div>`, keep);
    $('#rgBack').addEventListener('click', back);
    $('#rgRec').addEventListener('click', () => { m.sel = [...m.rec]; draw(); });
    $('#rgGo').addEventListener('click', () => done(applyReg(G, m.sel)));
    $$<HTMLElement>('[data-rg]').forEach((b) => b.addEventListener('click', () => { const id = +b.dataset.rg!; const i = m.sel.indexOf(id); if (i >= 0) m.sel.splice(i, 1); else if (m.sel.length < REG_SIZE) m.sel.push(id); else { toast(`${REG_SIZE}人まで。ほかの選手を外してから。`); return; } draw(); }));
  };
  draw();
}
/** 4週以上のケガ人の入れかえ：かわりに登録する選手を選ぶ */
export function openSwap(G: GameState, outId: number, back: () => void, save: () => void) {
  const o = G.squad.find((p) => p.id === outId); if (!o) { back(); return; }
  const cands = G.squad.filter((p) => !p.reg && !p.inj).sort((a, b) => ovr(b) - ovr(a));
  sheet(`<div class="bar"><h2>登録の入れかえ</h2></div><section class="card"><div>${esc(o.name)}（ケガ あと${o.inj}週）の登録を外して、かわりに登録する選手を選ぶ。</div><div class="muted small">外した選手は、次の登録の会議まで試合に出られない。登録 ${regd(G).length}/${REG_SIZE}人</div></section>
    <div class="plist">${cands.map((p) => `<button class="pl" data-sw="${p.id}">${posTag(p.pos)}<span style="min-width:0"><span class="pname">${esc(p.name)}</span><br><span class="pmeta">${p.age}歳</span></span><span class="ovr">${val(ovr(p))}</span></button>`).join('') || '<div class="card muted">登録していない選手がいない。</div>'}</div>`,
    `<div class="in2 one"><button class="btn primary" id="swBack">もどる</button></div>`);
  $('#swBack').addEventListener('click', back);
  $$<HTMLElement>('[data-sw]').forEach((b) => b.addEventListener('click', () => { const e = swapReg(G, outId, +b.dataset.sw!); if (e) { toast(e); return; } save(); toast('登録を入れかえた'); back(); }));
}
