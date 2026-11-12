/* 試合前の画面（問109）：「試合へ ▶」を押すと開く。監督が予定している並び方・先発・ベンチと相手を見て、
   選手を押すとその場で監督への頼みを出せる（頼むと予定がすぐ組み直される。聞いてくれるかは当日わかる） */
import { finLine } from './finview';
import { openClub } from './clubview';
import { matchPlan, standings, type GameState } from '../core/game';
import { ORDER_LIMIT, ORDER_SHORT, orderCount, setOrder, obeyChance, tacticFit, COMPAT_MARK, type OrderKind } from '../core/bond';
import { mgrShort } from '../core/match';
import { ovr } from '../core/player';
import { POS, type Pos } from '../core/constants';
import type { Player } from '../core/types';
import { $, $$, esc, posTag, sheet, toast, val } from './dom';
import { pitchHTML } from './pitch';

const KICK_NAME = { ck: 'コーナー', fk: 'フリーキック', pk: 'PK' } as const;
const KICK_SP = ['プレースキッカー', 'フリーキックの名手', 'PKの名手', '正確なクロス', '冷静沈着'];
const ordTag = (p: Player) => (p.ord ? ORDER_SHORT[p.ord.kind] + (p.ord.pos ? '・' + p.ord.pos : '') : '');
export function openPrematch(G: GameState, start: () => void, back: () => void, onPlayer: (id: number, back: () => void) => void, save: () => void) {
  const draw = () => {
    const plan = matchPlan(G);
    const opp = plan.opp;
    const oppRank = opp ? (() => { const rows = standings(G, opp.tier); const pl = rows[0] ? rows[0].w + rows[0].d + rows[0].l : 0; return pl ? `${rows.findIndex((x) => x.id === opp.id) + 1}位` : '開幕前'; })() : '';
    const n = orderCount(G.squad);
    const spots = plan.lineup.map((x) => ({ pos: x.pos, name: x.p.name.split(' ')[0], sub: String(ovr(x.p)), id: x.p.id, mark: ordTag(x.p), hl: !!x.p.ord }));
    const benchRows = plan.bench.slice(0, 12).map((p) => `<button class="pl" data-pm="${p.id}">${posTag(p.pos)}<span style="min-width:0"><span class="pname">${p.fav ? '<span class="favmark">★</span>' : ''}${esc(p.name)}${p.ord ? ` <span class="tag">${ordTag(p)}</span>` : ''}</span><br><span class="pmeta">${p.age}歳${p.cond >= 1 ? ' ・ 好調' : p.cond <= -1 ? ' ・ 不調' : ''}${p.fat >= 40 ? ' ・ 疲れ' : ''}</span></span><span class="ovr">${val(ovr(p))}</span></button>`).join('');
    const inj = G.squad.filter((p) => p.inj);
    sheet(`<div class="bar"><h2>試合前</h2><span class="tag">予定：${plan.form}</span></div>
      <section class="card band"><h2>相手</h2>${opp ? `<div class="row"><button class="linkbtn grow" id="pmClub">${esc(opp.name)} <span aria-hidden="true">›</span></button><span class="tag ${plan.home ? '' : 'away'}">${plan.home ? 'ホーム' : 'アウェイ'}</span></div><div class="muted small">${opp.tier}部 ${oppRank} ・ 戦い方：${esc(opp.mgr.style)} ・ 並び方 ${opp.mgr.forms[0]} など</div>${finLine(opp)}` : '<div class="muted">天皇杯。相手は当日の抽選で決まる。</div>'}
        <div class="muted small" style="margin-top:4px">自分のクラブ：${esc(mgrShort(G.mgr))} ・ ${esc(G.mgr.style)}</div></section>
      <section class="card"><h2>予定の先発（${plan.form}）</h2>${pitchHTML(spots, true)}
        <div class="muted small" style="margin-top:6px">選手を押すと、監督に頼みを出せる（${n}/${ORDER_LIMIT}人）。頼みが聞いてもらえるかは当日わかる。いまの見こみ：${Math.round(obeyChance(G.mgr.obey, Math.max(1, n)) * 100)}%</div></section>
      <section class="card"><h2>ベンチ</h2><div class="plist">${benchRows || '<div class="muted">いない</div>'}</div>
        ${inj.length ? `<div class="muted small" style="margin-top:6px">ケガで出られない：${inj.map((p) => `${esc(p.name)}（あと${p.inj}週）`).join('、')}</div>` : ''}
        ${plan.banned.length ? `<div class="small" style="margin-top:6px"><span class="tag bad">出場停止</span> ${plan.banned.map((p) => `${esc(p.name)}（あと${p.ban![plan.comp]}試合）`).join('、')}</div>` : ''}
        ${plan.warn.length ? `<div class="small" style="margin-top:6px"><span class="tag">あと1枚で停止</span> ${plan.warn.map((p) => esc(p.name)).join('、')}</div>` : ''}</section>
      <section class="card"><h2>セットプレーのキッカー</h2><div class="muted small" style="margin-bottom:6px">監督が決める。押すと「この選手に蹴らせて」と頼める（聞くかどうかは監督の気持ちしだい）。</div>
        <div class="list">${(['ck', 'fk', 'pk'] as const).map((k) => { const p = plan.kick[k]; const req = G.owner?.kick?.[k]; const rq = req != null ? G.squad.find((x) => x.id === req) : null;
          return `<button class="srow" data-kick="${k}"><span class="tag">${KICK_NAME[k]}</span><span class="grow sname">${p ? esc(p.name) : '—'}${rq ? ` <span class="muted small">（頼み：${esc(rq.name)}）</span>` : ''}</span><span class="chev" aria-hidden="true">›</span></button>`; }).join('')}</div></section>
      ${plan.duels.length ? `<section class="card"><h2>注目の対決</h2><div class="list">${plan.duels.map((d) => `<div class="duelrow"><span class="tag">${esc(d.zone)}</span><div><b class="n-me">${esc(d.me.name)}</b> 対 <b class="n-op">${esc(d.opp.name)}</b></div><div class="muted small">${d.what}：${d.mv} 対 ${d.ov}（${d.mv - d.ov >= 4 ? 'うちが上' : d.ov - d.mv >= 4 ? '相手が上' : 'ほぼ互角'}）</div></div>`).join('')}</div></section>` : ''}`,
      `<div class="in2"><button class="btn ghost" id="pmBack">もどる</button><button class="btn primary" id="pmGo">試合開始 <span aria-hidden="true">▶</span></button></div>`);
    $('#pmBack').addEventListener('click', back);
    $('#pmGo').addEventListener('click', start);
    $('#pmClub')?.addEventListener('click', () => { if (opp) openClub(G, opp.id, draw, save); });
    $$<HTMLElement>('[data-pp],[data-pm]').forEach((b) => b.addEventListener('click', () => ask(+(b.dataset.pp ?? b.dataset.pm)!)));
    $$<HTMLElement>('[data-kick]').forEach((b) => b.addEventListener('click', () => kickAsk(b.dataset.kick as 'ck' | 'fk' | 'pk', plan.lineup.map((x) => x.p))));
  };
  /** 問133：キッカーを頼む */
  const kickAsk = (k: 'ck' | 'fk' | 'pk', ps: Player[]) => {
    if (!G.owner) return;
    const cur = G.owner.kick?.[k];
    const val2 = (p: Player) => (k === 'ck' ? p.a[2] : k === 'fk' ? p.a[1] * 0.6 + p.a[2] * 0.4 : p.a[1]);
    const rows = ps.filter((p) => p.pos !== 'GK').sort((a, b) => val2(b) - val2(a)).map((p) => `<button class="pl" data-kp="${p.id}" aria-pressed="${cur === p.id}">${posTag(p.pos)}<span style="min-width:0"><span class="pname">${esc(p.name)}${cur === p.id ? ' <span class="tag gold">頼んでいる</span>' : ''}</span><br><span class="pmeta">${k === 'pk' ? 'シュート' : k === 'fk' ? 'シュートとパス' : 'パス'} ${Math.round(val2(p))}${p.sp.filter((x) => KICK_SP.includes(x)).map((x) => ` ・ ${esc(x)}`).join('')}</span></span></button>`).join('');
    sheet(`<div class="bar"><h2>${KICK_NAME[k]}のキッカー</h2></div><section class="card"><div class="muted small">予定の先発から選ぶ。キックのうまい順に並んでいる。</div></section><div class="plist">${rows}</div>${cur != null ? '<button class="btn ghost wide" id="kpOff">頼みを取り下げる（監督に任せる）</button>' : ''}`,
      `<div class="in2 one"><button class="btn primary" id="kpBack">試合前の画面にもどる</button></div>`);
    $('#kpBack').addEventListener('click', draw);
    $('#kpOff')?.addEventListener('click', () => { if (G.owner.kick) delete G.owner.kick[k]; save(); toast('頼みを取り下げた'); draw(); });
    $$<HTMLElement>('[data-kp]').forEach((b) => b.addEventListener('click', () => { G.owner.kick = { ...(G.owner.kick ?? {}), [k]: +b.dataset.kp! }; save(); toast('頼んだ。聞いてくれるかは当日わかる'); draw(); }));
  };
  /** 頼みを選ぶ小さな画面 */
  const ask = (id: number) => {
    const p = G.squad.find((x) => x.id === id); if (!p) return;
    const cur = p.ord ? p.ord.kind + (p.ord.pos ? ':' + p.ord.pos : '') : '';
    const b = (k: string, l: string) => `<button data-o="${k}" aria-pressed="${cur === k}">${l}</button>`;
    const posBtns = p.pos === 'GK' ? '' : POS.filter((x) => x !== p.pos && x !== 'GK').map((x) => b(`pos:${x}`, `${x}${['', '×', '△', '○', '◎'][p.apt[x] + 1] ?? ''}`)).join('');
    sheet(`<div class="bar"><h2>${esc(p.name)}</h2>${posTag(p.pos)}</div>
      <section class="card"><div class="row"><span class="grow">${p.age}歳 ・ 総合 ${val(ovr(p))}</span><span class="small">戦術に ${COMPAT_MARK[String(tacticFit(p, G.mgr.style))]}</span></div></section>
      <section class="card"><h2>監督への頼み</h2><div class="seg ordseg" role="group" aria-label="監督への頼み">${b('start', '先発で')}${b('sub', '途中から')}${b('bench', '使わないで')}</div>
      ${posBtns ? `<h3>このポジションで使ってほしい</h3><div class="seg wide9" role="group" aria-label="ポジションの指定">${posBtns}</div>` : ''}
      ${p.ord ? '<button class="btn small ghost" data-o="" style="margin-top:8px">頼みを取り下げる</button>' : ''}</section>
      <button class="btn ghost wide" id="pmInfo">くわしく見る</button>`,
      `<div class="in2 one"><button class="btn primary" id="pmBack2">試合前の画面にもどる</button></div>`);
    $('#pmBack2').addEventListener('click', draw);
    $('#pmInfo').addEventListener('click', () => onPlayer(id, () => openPrematch(G, start, back, onPlayer, save)));
    $$<HTMLElement>('[data-o]').forEach((x) => x.addEventListener('click', () => {
      const [k, pos] = x.dataset.o!.split(':'); const same = cur === x.dataset.o;
      const e = setOrder(G, id, !k || same ? null : { kind: k as OrderKind, pos: (pos || undefined) as Pos | undefined });
      if (e) { toast(e); return; }
      save(); toast(!k || same ? '頼みを取り下げた' : '頼んだ。予定を組み直した'); draw();
    }));
  };
  draw();
}
