/* 人（監督・コーチ・スカウト）・施設・お金・移籍の画面（企画書 14-2） */
import type { GameState } from '../core/game';
import { myTier, answerOffer } from '../core/game';
import { STYLES, POS, type Pos } from '../core/constants';
import { COACH_NAME, COACH_NOTE, COACH_ROLES, growWord, obeyWord, skillStars, skillWord, youthWord, type CoachRole } from '../core/staff';
import { FAC_KEYS, FAC_NAME, FAC_NOTE, MAX_FAC, MONEY_NAME, INCOME_KEYS, EXPENSE_KEYS, STADIUM_CAP, debtCap, facCost, facWeeks, gate, sponsorYear, type FacKey } from '../core/finance';
import { borrow, coachWindow, decideTrial, dropCand, fireCoach, fireScout, hireCoach, hireManager, hireScout, inWindow, payroll, repay, staffPay, startBuild, takeTrial } from '../core/owner';
import { ovr } from '../core/player';
import { Rng } from '../core/rng';
import type { Manager } from '../core/types';
import { $$, esc, posTag, val, yen } from './dom';
import { marketHTML, bindMarket } from './marketview';
import { condText, scoutCond } from '../core/market';

const stars = (s: number) => '★'.repeat(skillStars(s)) + '☆'.repeat(5 - skillStars(s));
const mgrCard = (m: Manager, btn = '') => `<div class="slot" style="flex-direction:column;align-items:stretch;gap:4px"><div class="row"><b class="grow">${esc(m.name)}</b><span class="small">${m.age}歳 ・ 年${m.salary.toLocaleString()}万円</span></div>
  <div class="small"><b>${esc(m.style)}</b>（${esc(STYLES[m.style].note)}）・ 並び方 ${m.forms.join(' / ')}</div>
  <div class="muted small">${esc(youthWord(m))} ・ ${esc(obeyWord(m))} ・ ${esc(growWord(m))}</div>${btn}</div>`;

/* 問88：スタッフは「監督・コーチ・スカウト」を上で切りかえ、一覧は1人1行（押すとくわしく） */
export let staffView: 'mgr' | 'coach' | 'scout' = 'coach';
let openRow = '';
const srow = (key: string, role: string, name: string, right: string, detail: string) => `<div class="srow-wrap"><button class="srow" data-open="${key}" aria-expanded="${openRow === key}"><span class="srole">${role}</span><span class="grow sname">${name}</span>${right}<span class="chev" aria-hidden="true">${openRow === key ? '▲' : '▼'}</span></button>${openRow === key ? `<div class="sdetail">${detail}</div>` : ''}</div>`;
export function peopleHTML(G: GameState): string {
  const o = G.owner; const cw = coachWindow(G);
  const seg = `<div class="seg" role="group" aria-label="スタッフの画面"><button data-stv="mgr" aria-pressed="${staffView === 'mgr'}">監督</button><button data-stv="coach" aria-pressed="${staffView === 'coach'}">コーチ</button><button data-stv="scout" aria-pressed="${staffView === 'scout'}">スカウト（${o.scouts.length}）</button></div><div style="height:10px"></div>`;
  if (staffView === 'mgr') return seg + `<section class="card"><h2>監督</h2>${mgrCard(G.mgr)}<div class="muted small" style="margin-top:6px">試合の作戦・交代・練習は監督が決める。オーナーが伝えられるのは、トップチームの画面の「方針」と、選手の画面の「この選手を使ってほしい」だけ。</div>
      <button class="btn small ghost" data-act="mgrmarket" style="margin-top:8px">ほかの監督の候補を見る</button></section>
    ${showMgr ? `<section class="card"><h2>監督の候補</h2><div class="muted small">入れかえると、いまの監督に年俸の半分（${(Math.round(G.mgr.salary / 20) * 10).toLocaleString()}万円）を払う。</div><div class="list" style="margin-top:6px">${o.market.mgr.map((m) => mgrCard(m, `<button class="btn small primary" data-hire-mgr="${m.id}">この監督にする</button>`)).join('')}</div></section>` : ''}`;
  const pay = (n: number) => `<span class="small muted">年${n.toLocaleString()}万</span>`;
  const st = (sk: number) => `<span class="small" style="color:var(--gold)">${stars(sk)}</span>`;
  if (staffView === 'coach') {
    const rows = COACH_ROLES.map((k) => { const c = o.coaches[k];
      return srow(`c:${k}`, COACH_NAME[k].replace('コーチ', ''), c ? esc(c.name) : '<span class="tag bad">いない</span>', c ? st(c.skill) : '',
        `<div class="small">受け持ち：${esc(COACH_NOTE[k])}</div>${c ? `<div class="small">${c.age}歳 ・ ${skillWord(c.skill)} ・ 年${c.salary.toLocaleString()}万円</div>` : ''}
        ${cw ? `<div class="row wrap" style="margin-top:6px">${c ? `<button class="btn small ghost" data-fire-coach="${k}">やめてもらう</button>` : ''}<button class="btn small ghost" data-coach-market="${k}">候補を見る</button></div>` : '<div class="muted small" style="margin-top:4px">入れかえは冬（12月）だけ。</div>'}`); }).join('');
    const market = coachMarketRole ? `<section class="card"><h2>${COACH_NAME[coachMarketRole]}の候補</h2><div class="list">${o.market.coach[coachMarketRole].map((c) => `<div class="slot"><div class="grow"><b>${esc(c.name)}</b> <span class="small">${c.age}歳</span><div class="small"><span style="color:var(--gold)">${stars(c.skill)}</span> ${skillWord(c.skill)} ・ 年${c.salary.toLocaleString()}万円</div></div><button class="btn small primary" data-hire-coach="${coachMarketRole}:${c.id}">雇う</button></div>`).join('')}</div></section>` : '';
    return seg + `<section class="card"><h2>コーチ（5人）</h2><div class="slist">${rows}</div></section>${market}`;
  }
  const scouts = o.scouts.map((s) => srow(`s:${s.id}`, `${s.age}歳`, esc(s.name), st(s.skill),
    `<div class="small">${s.age}歳 ・ ${skillWord(s.skill)} ・ 年${s.salary.toLocaleString()}万円</div><div class="muted small">探す条件：${esc(condText(scoutCond(s)))}</div><div class="row wrap" style="margin-top:6px"><button class="btn small primary" data-go-cond="1">探す条件を決める</button><button class="btn small ghost" data-fire-scout="${s.id}">やめてもらう</button></div>`)).join('') || '<div class="muted">いない</div>';
  const smarket = o.market.scout.map((s) => `<div class="slot"><div class="grow"><b>${esc(s.name)}</b> ${st(s.skill)} ${pay(s.salary)}</div><button class="btn small primary" data-hire-scout="${s.id}" ${o.scouts.length >= 3 ? 'disabled' : ''}>雇う</button></div>`).join('');
  return seg + `<section class="card"><h2>スカウト（3人まで）</h2><div class="slist">${scouts}</div></section>
    <section class="card"><h2>雇えるスカウト</h2><div class="list">${smarket}</div></section>`;
}
let coachMarketRole: CoachRole | null = null; let showMgr = false;

/* 問90：施設はアイコンのタイル（2列）。レベルは■□で見せ、押すと説明と「強化する」が出る */
const fsvg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const FAC_ICON: Record<FacKey, string> = {
  field: fsvg('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/><path d="M3 9h3v6H3M21 9h-3v6h3"/>'),
  youth: fsvg('<path d="M12 21V11"/><path d="M12 11c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>'),
  stadium: fsvg('<ellipse cx="12" cy="9" rx="9" ry="4"/><path d="M3 9v6c0 2.2 4 4 9 4s9-1.8 9-4V9"/><ellipse cx="12" cy="9" rx="4" ry="1.6"/>'),
  medical: fsvg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  dorm: fsvg('<path d="M3 18V8"/><path d="M3 14h18v4"/><path d="M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>'),
};
let facOpen: FacKey | '' = '';
export function facHTML(G: GameState): string {
  const o = G.owner;
  const pips = (lv: number) => `<span class="pips" aria-label="レベル${lv}">${'■'.repeat(lv)}<span class="off">${'□'.repeat(MAX_FAC - lv)}</span></span>`;
  const building = o.build ? `<section class="card"><b>強化中：${FAC_NAME[o.build.key]}</b>（あと${o.build.weeks}週）<div class="bar-meter" style="margin-top:4px"><i style="width:${Math.round(((o.build.total - o.build.weeks) / o.build.total) * 100)}%"></i></div></section>` : '';
  const tiles = FAC_KEYS.map((k: FacKey) => `<button class="hubtile factile" data-fopen="${k}" aria-pressed="${facOpen === k}">${FAC_ICON[k]}<span class="hl">${FAC_NAME[k]}</span>${pips(o.fac[k])}${o.build?.key === k ? '<span class="tag">工事中</span>' : ''}</button>`).join('');
  let detail = '';
  if (facOpen) {
    const k = facOpen; const lv = o.fac[k]; const next = lv + 1; const can = next <= MAX_FAC;
    const extra = k === 'stadium' ? `<div class="small">いまの席：${STADIUM_CAP[lv].toLocaleString()}人</div>` : k === 'dorm' && lv === 0 ? '<div class="small">まだない</div>' : '';
    detail = `<section class="card"><div class="row"><b class="grow">${FAC_NAME[k]}</b>${pips(lv)}</div><div class="muted small">${FAC_NOTE[k]}</div>${extra}
      ${can ? `<button class="btn small ${o.build ? 'ghost' : 'primary'}" style="margin-top:8px" data-build="${k}" ${o.build ? 'disabled' : ''}>レベル${next}にする（${yen(facCost(k, next))}・${facWeeks(k, next)}週）</button>${o.build ? '<div class="muted small" style="margin-top:4px">一度に強化できるのは1つ。いまの工事が終わってから。</div>' : ''}` : '<div class="muted small" style="margin-top:6px">いちばん上まで強化した</div>'}</section>`;
  }
  return `${building}<div class="hub">${tiles}</div>${detail || '<div class="muted small" style="margin:10px 4px">施設を押すと、くわしい説明と強化が出る。強化には、お金と時間がかかる。</div>'}`;
}

export function moneyHTML(G: GameState): string {
  const o = G.owner; const t = myTier(G); const cap = debtCap(t);
  const L = o.ledger; const P = o.lastLedger;
  const inSum = INCOME_KEYS.reduce((s, k) => s + L[k], 0), outSum = EXPENSE_KEYS.reduce((s, k) => s + L[k], 0);
  const g = gate(t, G.club.pref, o.pop, o.fac.stadium, t, false);
  /* 問89：合計だけを出し、押すと内訳が開く（右の小さい数字は去年） */
  const mrow = (key: string, label: string, sum: number, keys: readonly string[]) => `<div class="srow-wrap"><button class="srow" data-mopen="${key}" aria-expanded="${moneyOpen === key}"><span class="grow sname">${label}</span><b>${yen(sum)}</b><span class="chev" aria-hidden="true">${moneyOpen === key ? '▲' : '▼'}</span></button>
    ${moneyOpen === key ? `<div class="sdetail"><table><tbody>${keys.map((k) => `<tr><td class="l">${MONEY_NAME[k as keyof typeof MONEY_NAME]}</td><td>${yen(L[k as keyof typeof L])}</td><td class="muted small">${P ? `去年 ${yen(P[k as keyof typeof P])}` : ''}</td></tr>`).join('')}</tbody></table>
    ${key === 'out' ? `<div class="muted small" style="margin-top:4px">給料は1年で、選手 ${yen(payroll(G))}、監督・コーチ・スカウト ${yen(staffPay(G))}</div>` : ''}</div>` : ''}</div>`;
  return `<section class="card"><h2>いまのお金</h2><div class="goal" style="font-size:24px;${o.money < 0 ? 'color:var(--danger)' : ''}">${yen(o.money)}</div>
      <dl class="kv" style="margin-top:6px"><dt>借金</dt><dd>${yen(o.debt)}（上限 ${yen(cap)}）</dd><dt>人気</dt><dd>${Math.round(o.pop)} / 100</dd><dt>ホームの試合のお客さん</dt><dd>約${g.fans.toLocaleString()}人（入場料 約${yen(g.money)}）</dd><dt>今年のスポンサー</dt><dd>${yen(o.sponsor)}</dd></dl></section>
    <section class="card"><h2>今年のお金の出入り</h2><div class="slist">
      ${mrow('in', '入ってくるお金', inSum, INCOME_KEYS)}${mrow('out', '出ていくお金', outSum, EXPENSE_KEYS)}
      <div class="srow" style="cursor:default"><span class="grow sname">差し引き</span><b style="${inSum - outSum < 0 ? 'color:var(--danger)' : ''}">${inSum - outSum >= 0 ? '+' : '−'}${yen(Math.abs(inSum - outSum))}</b></div></div>
      <div class="muted small" style="margin-top:6px">来年のスポンサーの見こみ：${yen(sponsorYear(t, G.club.pref, o.pop))}</div></section>
    <section class="card"><h2>銀行</h2><div class="muted">お金が足りなくなると、自動で借りる。上限まで借りると、それ以上は借りられない（ゲームオーバーにはならない）。利息は1年に3%。</div>
      <div class="btns three" style="margin-top:8px"><button class="btn small ghost" data-borrow="5000">5000万借りる</button><button class="btn small ghost" data-repay="5000">5000万返す</button><button class="btn small ghost" data-repay="all">全部返す</button></div></section>`;
}

let moneyOpen = '';
export function transferHTML(G: GameState): string {
  const o = G.owner; const win = inWindow(G);
  const offers = G.pending.map((e, i) => { const p = G.squad.find((x) => x.id === e.pid); if (!p) return ''; return `<div class="slot"><div class="grow"><b>${esc(e.club)}</b> から ${esc(p.name)}（${p.pos}・${ovr(p)}）に ${yen(e.price)}</div><button class="btn small primary" data-offer-yes="${i}">受ける</button><button class="btn small ghost" data-offer-no="${i}">断る</button></div>`; }).join('');
  const cand = (src: string) => o.cands.filter((c) => c.src === src).map((c) => { const p = c.p;
    return `<div class="slot" style="flex-direction:column;align-items:stretch;gap:4px"><div class="row">${posTag(p.pos)}<b class="grow">${esc(p.name)}</b><span class="ovr">${val(ovr(p))}</span></div>
    <div class="small">${p.age}歳 ・ ${esc(c.from)} ・ ${esc(p.pref)}出身 ・ ${p.height}cm${c.scout ? ` ・ スカウト ${esc(c.scout)}` : ''}</div><div class="muted small">${esc(c.note)}</div>
    <div class="row wrap">${src === 'trial' ? [1, 2, 3].map((m) => `<button class="btn small primary" data-trial="${c.id}:${m}">${m}か月あずかる</button>`).join('') : `<button class="btn small primary" data-sign="${c.id}">獲る（${yen(c.fee)}）</button>`}<button class="btn small ghost" data-detail="${c.id}">くわしく</button><button class="btn small ghost" data-drop="${c.id}">見送る</button></div></div>`; }).join('');
  const trials = o.trials.map((p) => `<div class="slot"><div class="grow">${posTag(p.pos)} <b>${esc(p.name)}</b> <span class="small">${p.age}歳</span><div class="muted small">${p.trialMonths ? `あと${p.trialMonths}か月` : '練習の期間が終わった'}${lastTrial(G, p.id)}</div></div>${p.trialMonths ? '' : `<button class="btn small primary" data-tsign="${p.id}">取る</button><button class="btn small ghost" data-tno="${p.id}">断る</button>`}</div>`).join('');
  const listed = G.squad.filter((p) => p.listed);
  /* 問86：オファー・移籍市場・練習生を、上のボタンで切りかえる（件数を出す） */
  const nOffer = G.pending.length; const nTrial = o.cands.filter((c) => c.src === 'trial').length + o.trials.filter((p) => !p.trialMonths).length;
  const cnt = (n: number) => (n ? `（${n}）` : '');
  const seg = `<div class="seg" role="group" aria-label="移籍の画面"><button data-trv="offer" aria-pressed="${trView === 'offer'}">オファー${cnt(nOffer)}</button><button data-trv="market" aria-pressed="${trView === 'market'}">移籍市場${cnt(o.mk.bids.length)}</button><button data-trv="trial" aria-pressed="${trView === 'trial'}">練習生${cnt(nTrial)}</button></div>
    <div class="muted small" style="margin:8px 2px 4px">${win ? '<b>いまは移籍の期間</b>' : '移籍の期間は夏（7〜8月）と冬（12月）'} ・ トップ ${G.squad.length}人（25人まで）</div>`;
  if (trView === 'market') return seg + marketHTML(G);
  if (trView === 'trial') return seg + `<section class="card"><h2>練習生</h2><div class="list">${cand('trial')}${trials}${!trials && !cand('trial') ? '<div class="muted">「テストを受けさせてください」と、ときどきやってくる。1〜3か月あずかって、伸び方を見てから決める。</div>' : ''}</div></section>`;
  return seg + `<section class="card"><h2>届いたオファー</h2>${offers ? `<div class="list">${offers}</div><div class="muted small" style="margin-top:6px">値段の交渉はできない。受けるか断るかだけ。</div>` : '<div class="muted">いまはオファーがない。</div>'}</section>
    <section class="card"><h2>売りに出している選手</h2>${listed.length ? `<div>${listed.map((p) => esc(p.name)).join('、')}</div><div class="muted small" style="margin-top:6px">移籍の期間に買い手を探す。</div>` : '<div class="muted">いない。売りに出すときは、選手の画面の「売りに出す」を押す。</div>'}</section>`;
}
/** 移籍の画面の切りかえ（セーブには入れない） */
export let trView: 'offer' | 'market' | 'trial' = 'market';
export const setTrView = (v: typeof trView) => { trView = v; };
function lastTrial(G: GameState, id: number) { const r = [...G.owner.trialLog].reverse().find((x) => x.lines.some((l) => l.pid === id)); const l = r?.lines.find((x) => x.pid === id); return l ? ` ・ ${l.words} ${l.arrow}` : ''; }

export function bindOwner(G: GameState, root: HTMLElement, done: (msg?: string | null) => void, openCand: (id: number) => void) {
  const on = (sel: string, f: (v: string) => string | null | void) => $$<HTMLElement>(`[${sel}]`, root).forEach((b) => b.addEventListener('click', () => done(f(b.getAttribute(sel)!) || null)));
  on('data-coach-market', (k) => { coachMarketRole = coachMarketRole === k ? null : (k as CoachRole); });
  on('data-hire-coach', (v) => { const [k, id] = v.split(':'); coachMarketRole = null; return hireCoach(G, k as CoachRole, +id) ?? '雇った'; });
  on('data-fire-coach', (k) => fireCoach(G, k as CoachRole));
  on('data-hire-mgr', (id) => { showMgr = false; return hireManager(G, +id) ?? '監督が代わった'; });
  $$<HTMLElement>('[data-act="mgrmarket"]', root).forEach((b) => b.addEventListener('click', () => { showMgr = !showMgr; done(null); }));
  on('data-hire-scout', (id) => hireScout(G, +id) ?? '雇った');
  on('data-fire-scout', (id) => { fireScout(G, +id); });
  on('data-build', (k) => startBuild(G, k as FacKey) ?? '強化を始めた');
  on('data-borrow', (v) => { const got = borrow(G, +v); return got ? `${got.toLocaleString()}万円借りた` : 'これ以上は借りられない'; });
  on('data-repay', (v) => { const a = repay(G, v === 'all' ? G.owner.debt : +v); return a ? `${a.toLocaleString()}万円返した` : '返せるお金がない'; });
  on('data-offer-yes', (i) => answerOffer(G, +i, true) ?? '移籍が決まった');
  on('data-offer-no', (i) => { answerOffer(G, +i, false); });
  on('data-drop', (id) => { dropCand(G, +id); });
  on('data-trial', (v) => { const [id, m] = v.split(':'); return takeTrial(G, +id, +m) ?? '練習生としてあずかった'; });
  on('data-tsign', (id) => decideTrial(G, +id, true) ?? '練習生を取った');
  on('data-tno', (id) => { decideTrial(G, +id, false); });
  $$<HTMLElement>('[data-detail]', root).forEach((b) => b.addEventListener('click', () => openCand(+b.dataset.detail!)));
  bindMarket(G, root, done);
  on('data-trv', (v) => { trView = v as typeof trView; });
  on('data-stv', (v) => { staffView = v as typeof staffView; openRow = ''; });
  on('data-open', (v) => { openRow = openRow === v ? '' : v; });
  on('data-mopen', (v) => { moneyOpen = moneyOpen === v ? '' : v; });
  on('data-fopen', (v) => { facOpen = facOpen === v ? '' : (v as FacKey); });
}
