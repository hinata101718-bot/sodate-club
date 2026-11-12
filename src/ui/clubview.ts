/* 問130：相手のクラブの画面。エンブレム・県・段・順位・監督／お金の目安と性格／選手の一覧（知っている選手だけ総合力）／年ごとの成績／自分との対戦成績 */
import { clubById, standings, type GameState } from '../core/game';
import { askScout, isStale } from '../core/market';
import { ovr } from '../core/player';
import { finLine } from './finview';
import { emblemSVG } from './emblem';
import { openKnown } from './marketview';
import { $, $$, esc, posTag, sheet, toast, val } from './dom';

const ORDER: Record<string, number> = { GK: 0, CB: 1, SB: 2, DM: 3, CM: 4, AM: 5, WG: 6, ST: 7 };

export function openClub(G: GameState, id: number, back: () => void, save: () => void) {
  const c = clubById(G, id); if (!c || c.me) { back(); return; }
  let first = true;
  const draw = () => {
    const keep = !first; first = false;
    const rows = standings(G, c.tier); const rk = rows.findIndex((x) => x.id === c.id) + 1; const row = rows[rk - 1];
    const played = row ? row.w + row.d + row.l : 0;
    const known = G.owner.mk.known; const ask = new Set(G.owner.mk.ask ?? []);
    const list = [...c.squad].sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || (known[b.id]?.ovr ?? 0) - (known[a.id]?.ovr ?? 0));
    const nKnown = list.filter((p) => known[p.id]).length;
    const pl = list.map((p) => { const k = known[p.id];
      return `<button class="pl" data-cp="${p.id}">${posTag(p.pos)}<span style="min-width:0"><span class="pname">${esc(p.name)}${ask.has(p.id) ? ' <span class="tag away">調査を頼んだ</span>' : ''}</span><br><span class="pmeta">${p.age}歳${k ? ` ・ ${k.season}年目に調べた${isStale(G, k) ? '（古い）' : ''}` : ' ・ まだ調べていない'}</span></span><span class="ovr">${k ? val(k.ovr) : '？'}</span></button>`; }).join('');
    const v = c.vs; const vsText = v && v.w + v.d + v.l ? `${v.w}勝${v.d}分${v.l}敗（取った点 ${v.gf} − 取られた点 ${v.ga}）` : 'まだ対戦していない';
    const hist = [...(c.hist ?? [])].reverse().slice(0, 12);
    const m = c.mgr;
    sheet(`<div class="bar"><h2>${esc(c.name)}</h2><span class="tag">${c.tier}部</span></div>
      <section class="card"><div class="row" style="gap:12px;align-items:center"><div class="club-crest" aria-hidden="true">${emblemSVG(c.emblem)}</div><div class="grow" style="min-width:0">
        <div><b>${esc(c.pref)}</b> ・ ${c.tier}部 ${played ? `${rk}位（${row.w}勝${row.d}分${row.l}敗・勝ち点${row.p}）` : '開幕前'}</div>
        <div class="muted small">監督 ${esc(m.name)} ・ 戦い方：${esc(m.style)} ・ 並び方 ${esc(m.forms.join('・'))}</div>${finLine(c)}</div></div></section>
      <section class="card"><h2>うちとの対戦成績</h2><div>${vsText}</div><div class="muted small">リーグ戦と勝ち抜きの大会を合わせた数（大会のPK戦は勝ち・負けで数える）。</div></section>
      <section class="card"><h2>年ごとの成績</h2>${hist.length ? `<div class="list">${hist.map((h) => `<div class="row"><span class="tag">${h.y}年目</span><span class="grow">${h.tier}部 <b>${h.rank}位</b>${h.tier > 1 && h.rank <= 2 ? ' <span class="tag gold">昇格</span>' : h.tier === 1 && h.rank === 1 ? ' <span class="tag gold">優勝</span>' : h.tier < 3 && h.rank >= 11 ? ' <span class="tag bad">降格</span>' : ''}</span></div>`).join('')}</div>` : '<div class="muted">まだ記録がない（1年が終わると残る）。</div>'}</section>
      <section class="card"><h2>選手（${c.squad.length}人・調べた選手 ${nKnown}人）</h2><div class="muted small" style="margin-bottom:8px">総合力は、スカウトが調べた選手だけわかる。調べた選手を押すと、選手の画面へ（候補リストに入れられる）。まだ調べていない選手を押すと、スカウトに調べてもらうよう頼める（次の月のはじめに届く）。</div><div class="plist">${pl}</div></section>`,
      `<div class="in2 one"><button class="btn primary" id="cvBack">もどる</button></div>`, keep);
    $('#cvBack').addEventListener('click', back);
    $$<HTMLElement>('[data-cp]').forEach((b) => b.addEventListener('click', () => {
      const pid = +b.dataset.cp!;
      if (known[pid]) { openKnown(G, pid, (msg) => { if (msg) toast(msg); save(); draw(); }); return; }
      if (!G.owner.scouts.length) { toast('スカウトがいないので、調べてもらえない。経営 → スタッフでスカウトを雇おう。'); return; }
      const on = askScout(G, pid); save(); toast(on ? 'スカウトに調べてもらうよう頼んだ（次の月のはじめに届く）' : '調査の頼みを取り消した'); draw();
    }));
  };
  draw();
  void ovr;
}
