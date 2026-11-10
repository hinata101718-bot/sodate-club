/* 人（監督・コーチ・スカウト）・施設・お金・移籍の画面（企画書 14-2） */
import type { GameState } from '../core/game';
import { myTier, answerOffer } from '../core/game';
import { STYLES, POS, type Pos } from '../core/constants';
import { COACH_NAME, COACH_NOTE, COACH_ROLES, growWord, obeyWord, skillStars, skillWord, youthWord, type CoachRole } from '../core/staff';
import { FAC_KEYS, FAC_NAME, FAC_NOTE, MAX_FAC, MONEY_NAME, INCOME_KEYS, EXPENSE_KEYS, STADIUM_CAP, debtCap, facCost, facWeeks, gate, sponsorYear, type FacKey } from '../core/finance';
import { borrow, coachWindow, decideTrial, dropCand, fireCoach, fireScout, hireCoach, hireManager, hireScout, inWindow, payroll, repay, signCand, staffPay, startBuild, takeTrial } from '../core/owner';
import { ovr } from '../core/player';
import { Rng } from '../core/rng';
import type { Manager } from '../core/types';
import { $$, esc, posTag, val, yen } from './dom';

const stars = (s: number) => '★'.repeat(skillStars(s)) + '☆'.repeat(5 - skillStars(s));
const mgrCard = (m: Manager, btn = '') => `<div class="slot" style="flex-direction:column;align-items:stretch;gap:4px"><div class="row"><b class="grow">${esc(m.name)}</b><span class="small">${m.age}歳 ・ 年${m.salary.toLocaleString()}万円</span></div>
  <div class="small"><b>${esc(m.style)}</b>（${esc(STYLES[m.style].note)}）・ 並び方 ${m.forms.join(' / ')}</div>
  <div class="muted small">${esc(youthWord(m))} ・ ${esc(obeyWord(m))} ・ ${esc(growWord(m))}</div>${btn}</div>`;

export function peopleHTML(G: GameState): string {
  const o = G.owner; const cw = coachWindow(G);
  const coaches = COACH_ROLES.map((k) => { const c = o.coaches[k]; return `<div class="slot" style="flex-direction:column;align-items:stretch;gap:4px"><div class="row"><b class="grow">${COACH_NAME[k]}</b>${c ? `<span class="small" style="color:var(--gold)">${stars(c.skill)}</span>` : '<span class="tag bad">いない</span>'}</div>
    <div class="muted small">受け持ち：${esc(COACH_NOTE[k])}</div>${c ? `<div class="small">${esc(c.name)}（${c.age}歳）・ ${skillWord(c.skill)} ・ 年${c.salary.toLocaleString()}万円</div>` : ''}
    ${cw ? `<div class="row wrap">${c ? `<button class="btn small ghost" data-fire-coach="${k}">やめてもらう</button>` : ''}<button class="btn small ghost" data-coach-market="${k}">候補を見る</button></div>` : ''}</div>`; }).join('');
  const market = coachMarketRole ? `<section class="card"><h2>${COACH_NAME[coachMarketRole]}の候補</h2><div class="list">${o.market.coach[coachMarketRole].map((c) => `<div class="slot"><div class="grow"><b>${esc(c.name)}</b> <span class="small">${c.age}歳</span><div class="small"><span style="color:var(--gold)">${stars(c.skill)}</span> ${skillWord(c.skill)} ・ 年${c.salary.toLocaleString()}万円</div></div><button class="btn small primary" data-hire-coach="${coachMarketRole}:${c.id}">雇う</button></div>`).join('')}</div></section>` : '';
  const scouts = o.scouts.map((s) => `<div class="slot"><div class="grow"><b>${esc(s.name)}</b> <span class="small">${s.age}歳</span><div class="small"><span style="color:var(--gold)">${stars(s.skill)}</span> ${skillWord(s.skill)} ・ ${esc(s.region)}に顔が広い${s.pos ? ` ・ ${s.pos}を見る目がある` : ''} ・ 年${s.salary.toLocaleString()}万円</div></div><button class="btn small ghost" data-fire-scout="${s.id}">やめてもらう</button></div>`).join('') || '<div class="muted">いない</div>';
  const smarket = o.market.scout.map((s) => `<div class="slot"><div class="grow"><b>${esc(s.name)}</b><div class="small"><span style="color:var(--gold)">${stars(s.skill)}</span> ${esc(s.region)}${s.pos ? ` ・ ${s.pos}` : ''} ・ 年${s.salary.toLocaleString()}万円</div></div><button class="btn small primary" data-hire-scout="${s.id}" ${o.scouts.length >= 3 ? 'disabled' : ''}>雇う</button></div>`).join('');
  return `<section class="card"><h2>監督</h2>${mgrCard(G.mgr)}<div class="muted small" style="margin-top:6px">試合の作戦・交代・練習はオーナーは決めない。伝えられるのは、ホームの「若手の使い方の方針」と、選手の画面の「この選手を使ってほしい」だけ。</div>
      <button class="btn small ghost" data-act="mgrmarket" style="margin-top:8px">ほかの監督の候補を見る</button></section>
    ${showMgr ? `<section class="card"><h2>監督の候補</h2><div class="muted small">入れかえると、いまの監督に年俸の半分（${(Math.round(G.mgr.salary / 20) * 10).toLocaleString()}万円）を払う。</div><div class="list" style="margin-top:6px">${o.market.mgr.map((m) => mgrCard(m, `<button class="btn small primary" data-hire-mgr="${m.id}">この監督にする</button>`)).join('')}</div></section>` : ''}
    <section class="card"><h2>コーチ（5人）</h2>${cw ? '' : '<div class="muted small">コーチの入れかえは、年に1回、冬（12月）にまとめて行う。</div>'}<div class="list" style="margin-top:6px">${coaches}</div></section>
    ${market}
    <section class="card"><h2>スカウト（3人まで）</h2><div class="list">${scouts}</div>
      <h3>ほしい選手の希望</h3><div class="seg tight" role="group" aria-label="ポジション">${[['', 'おまかせ'], ...POS.map((p) => [p, p])].map(([k, l]) => `<button data-wish-pos="${k}" aria-pressed="${(o.wish.pos ?? '') === k}">${l}</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="年齢" style="margin-top:6px">${[['', '年齢はおまかせ'], ['18', '18歳以下で'], ['20', '20歳以下で']].map(([k, l]) => `<button data-wish-age="${k}" aria-pressed="${String(o.wish.maxAge ?? '') === k}">${l}</button>`).join('')}</div>
      <h3>雇えるスカウト</h3><div class="list">${smarket}</div></section>`;
}
let coachMarketRole: CoachRole | null = null; let showMgr = false;

export function facHTML(G: GameState): string {
  const o = G.owner;
  return `<section class="card"><h2>施設</h2><div class="muted">強化には、お金と時間（数週間〜数か月）がかかる。一度に強化できるのは1つ。</div>
    ${o.build ? `<div style="margin-top:8px"><b>強化中：${FAC_NAME[o.build.key]}</b>（あと${o.build.weeks}週）<div class="bar-meter" style="margin-top:4px"><i style="width:${Math.round(((o.build.total - o.build.weeks) / o.build.total) * 100)}%"></i></div></div>` : ''}</section>
    ${FAC_KEYS.map((k: FacKey) => { const lv = o.fac[k]; const next = lv + 1; const can = next <= MAX_FAC;
      const extra = k === 'stadium' ? `<div class="small">いまの席：${STADIUM_CAP[lv].toLocaleString()}人</div>` : k === 'dorm' && lv === 0 ? '<div class="small">まだない</div>' : '';
      return `<section class="card"><div class="row"><b class="grow">${FAC_NAME[k]}</b><span class="tag">レベル ${lv} / ${MAX_FAC}</span></div><div class="muted small">${FAC_NOTE[k]}</div>${extra}
      ${can ? `<button class="btn small ${o.build ? 'ghost' : 'primary'}" style="margin-top:8px" data-build="${k}" ${o.build ? 'disabled' : ''}>レベル${next}にする（${yen(facCost(k, next))}・${facWeeks(k, next)}週）</button>` : '<div class="muted small" style="margin-top:6px">いちばん上まで強化した</div>'}</section>`; }).join('')}`;
}

export function moneyHTML(G: GameState): string {
  const o = G.owner; const t = myTier(G); const cap = debtCap(t);
  const L = o.ledger; const P = o.lastLedger;
  const inSum = INCOME_KEYS.reduce((s, k) => s + L[k], 0), outSum = EXPENSE_KEYS.reduce((s, k) => s + L[k], 0);
  const g = gate(t, G.club.pref, o.pop, o.fac.stadium, t, false);
  return `<section class="card"><h2>いまのお金</h2><div class="goal" style="font-size:24px;${o.money < 0 ? 'color:var(--danger)' : ''}">${yen(o.money)}</div>
      <dl class="kv" style="margin-top:6px"><dt>借金</dt><dd>${yen(o.debt)}（上限 ${yen(cap)}）</dd><dt>人気</dt><dd>${Math.round(o.pop)} / 100</dd><dt>ホームの試合のお客さん</dt><dd>約${g.fans.toLocaleString()}人（入場料 約${yen(g.money)}）</dd><dt>今年のスポンサー</dt><dd>${yen(o.sponsor)}</dd></dl></section>
    <section class="card"><h2>今年の入ってくるお金と出ていくお金</h2><table><tbody>
      ${INCOME_KEYS.map((k) => `<tr><td class="l">${MONEY_NAME[k]}</td><td>${yen(L[k])}</td><td class="muted">${P ? yen(P[k]) : ''}</td></tr>`).join('')}
      <tr><td class="l"><b>入ってくるお金</b></td><td><b>${yen(inSum)}</b></td><td></td></tr>
      ${EXPENSE_KEYS.map((k) => `<tr><td class="l">${MONEY_NAME[k]}</td><td>${yen(L[k])}</td><td class="muted">${P ? yen(P[k]) : ''}</td></tr>`).join('')}
      <tr><td class="l"><b>出ていくお金</b></td><td><b>${yen(outSum)}</b></td><td></td></tr>
    </tbody></table><div class="muted small" style="margin-top:6px">右の小さい数字は去年。給料は1年で、選手 ${yen(payroll(G))}、監督・コーチ・スカウト ${yen(staffPay(G))}。来年のスポンサーの見こみ：${yen(sponsorYear(t, G.club.pref, o.pop))}。</div></section>
    <section class="card"><h2>銀行</h2><div class="muted">お金が足りなくなると、自動で借りる。上限まで借りると、それ以上は借りられない（ゲームオーバーにはならない）。利息は1年に3%。</div>
      <div class="btns three" style="margin-top:8px"><button class="btn small ghost" data-borrow="5000">5000万円借りる</button><button class="btn small ghost" data-repay="5000">5000万円返す</button><button class="btn small ghost" data-repay="all">全部返す</button></div></section>`;
}

export function transferHTML(G: GameState): string {
  const o = G.owner; const win = inWindow(G);
  const offers = G.pending.map((e, i) => { const p = G.squad.find((x) => x.id === e.pid); if (!p) return ''; return `<div class="slot"><div class="grow"><b>${esc(e.club)}</b> から ${esc(p.name)}（${p.pos}・${ovr(p)}）に ${yen(e.price)}</div><button class="btn small primary" data-offer-yes="${i}">受ける</button><button class="btn small ghost" data-offer-no="${i}">断る</button></div>`; }).join('');
  const cand = (src: string) => o.cands.filter((c) => c.src === src).map((c) => { const p = c.p;
    return `<div class="slot" style="flex-direction:column;align-items:stretch;gap:4px"><div class="row">${posTag(p.pos)}<b class="grow">${esc(p.name)}</b><span class="ovr">${val(ovr(p))}</span></div>
    <div class="small">${p.age}歳 ・ ${esc(c.from)} ・ ${esc(p.pref)}出身 ・ ${p.height}cm${c.scout ? ` ・ スカウト ${esc(c.scout)}` : ''}</div><div class="muted small">${esc(c.note)}</div>
    <div class="row wrap">${src === 'trial' ? [1, 2, 3].map((m) => `<button class="btn small primary" data-trial="${c.id}:${m}">${m}か月あずかる</button>`).join('') : `<button class="btn small primary" data-sign="${c.id}">獲る（${yen(c.fee)}）</button>`}<button class="btn small ghost" data-detail="${c.id}">くわしく</button><button class="btn small ghost" data-drop="${c.id}">見送る</button></div></div>`; }).join('');
  const trials = o.trials.map((p) => `<div class="slot"><div class="grow">${posTag(p.pos)} <b>${esc(p.name)}</b> <span class="small">${p.age}歳</span><div class="muted small">${p.trialMonths ? `あと${p.trialMonths}か月` : '練習の期間が終わった'}${lastTrial(G, p.id)}</div></div>${p.trialMonths ? '' : `<button class="btn small primary" data-tsign="${p.id}">取る</button><button class="btn small ghost" data-tno="${p.id}">断る</button>`}</div>`).join('');
  const listed = G.squad.filter((p) => p.listed);
  return `${offers ? `<section class="card"><h2>オファー</h2><div class="list">${offers}</div><div class="muted small" style="margin-top:6px">値段の交渉はできない。受けるか断るかだけ。</div></section>` : ''}
    <section class="card"><h2>移籍</h2><div class="muted">${win ? '<b>いまは移籍の期間</b>（夏：7〜8月、冬：12月）。' : '移籍の期間は、夏（7〜8月）と冬（12月）。'}トップ ${G.squad.length}人（25人まで）。</div>
      ${listed.length ? `<div class="small" style="margin-top:6px">売りに出している：${listed.map((p) => esc(p.name)).join('、')}（移籍の期間に買い手を探す）</div>` : '<div class="muted small" style="margin-top:6px">選手を売りに出すときは、選手の画面の「売りに出す」を押す。</div>'}</section>
    <section class="card"><h2>スカウトの候補（毎月）</h2><div class="list">${cand('scout') || '<div class="muted">今月の候補はいない。スカウトを雇うと、毎月候補を持ってくる。</div>'}</div></section>
    <section class="card"><h2>他のクラブで出番のない若手</h2><div class="list">${cand('club') || '<div class="muted">移籍の期間（7月・12月のはじめ）に情報が届く。</div>'}</div></section>
    <section class="card"><h2>練習生</h2><div class="list">${cand('trial')}${trials}${!trials && !cand('trial') ? '<div class="muted">「テストを受けさせてください」と、ときどきやってくる。1〜3か月あずかって、月1回の報告で伸び方を見てから決める。</div>' : ''}</div></section>`;
}
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
  on('data-wish-pos', (v) => { G.owner.wish.pos = (v || null) as Pos | null; });
  on('data-wish-age', (v) => { G.owner.wish.maxAge = v ? +v : null; });
  on('data-build', (k) => startBuild(G, k as FacKey) ?? '強化を始めた');
  on('data-borrow', (v) => { const got = borrow(G, +v); return got ? `${got.toLocaleString()}万円借りた` : 'これ以上は借りられない'; });
  on('data-repay', (v) => { const a = repay(G, v === 'all' ? G.owner.debt : +v); return a ? `${a.toLocaleString()}万円返した` : '返せるお金がない'; });
  on('data-offer-yes', (i) => answerOffer(G, +i, true) ?? '移籍が決まった');
  on('data-offer-no', (i) => { answerOffer(G, +i, false); });
  on('data-sign', (id) => { const r = new Rng(G.rng); const e = signCand(G, +id, r); G.rng = r.s; return e ?? '獲った'; });
  on('data-drop', (id) => { dropCand(G, +id); });
  on('data-trial', (v) => { const [id, m] = v.split(':'); return takeTrial(G, +id, +m) ?? '練習生としてあずかった'; });
  on('data-tsign', (id) => decideTrial(G, +id, true) ?? '練習生を取った');
  on('data-tno', (id) => { decideTrial(G, +id, false); });
  $$<HTMLElement>('[data-detail]', root).forEach((b) => b.addEventListener('click', () => openCand(+b.dataset.detail!)));
}
