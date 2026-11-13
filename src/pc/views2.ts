/* PC版の画面（その2）：移籍・スカウト・スタッフ・施設・財務・メッセージ・実績・クラブ史・セーブ */
import { S, G, ACT, CHANGE, esc, yen, fmt, moneyCls, posTag, ovrChip, potHtml, spChips, lineChart, toast, confirmBox, closeModal, modal } from './util';
import { VIEWS, clubLink } from './views';
import { myTier, clubById, answerOffer, ME } from '../core/game';
import { ovr } from '../core/player';
import { POS, type Pos } from '../core/constants';
import { marketValue, marketOpen, playerIndex, valueOf, ovrRange, shortList, toggleShort, askScout, forgetKnown, scoutCond, condText, VALUE_STEPS, SCOUT_REGIONS, regionLabel, sellChance, joinChance, fromTierOf, chanceWord, type Where } from '../core/market';
import { isBlocked, raiseOffer } from '../core/nego';
import { listPlayer, hireManager, hireCoach, fireCoach, hireScout, fireScout, coachWindow, startBuild, borrow, repay, payroll, staffPay } from '../core/owner';
import { COACH_ROLES, COACH_NAME, COACH_NOTE, skillWord, growWord } from '../core/staff';
import { FAC_KEYS, FAC_NAME, FAC_NOTE, facCost, facWeeks, MAX_FAC, STADIUM_CAP, INCOME_KEYS, EXPENSE_KEYS, MONEY_NAME, debtCap, distYear } from '../core/finance';
import { ACH, ACH_REWARD, tierTicket, releaseCost, releasePlayer, DIFFS } from '../core/gm';
import { monthOf, isWindow } from '../core/calendar';
import { answerWantOut } from '../core/bond';
import { evalWord } from '../core/meeting';
import { render, save } from './app';
import { exportCode } from './newgame';
import { openNego } from './modals';
import type { Player } from '../core/types';

const g = G;

/* ---------- 移籍市場 ---------- */
function fogRow(w: Where, extra = '') {
  const G0 = g(); const k = G0.owner.mk.known[w.p.id]; const full = !!k?.full;
  const p = w.p; const o = full ? Math.round(k!.ovr) : null;
  const place = w.club ? clubLink(w.club.id) : w.kind === 'free' ? '<span class="chip good">フリー</span>' : `<span class="chip">${esc(k?.club ?? 'アマチュア')}</span>`;
  const price = w.kind === 'pro' ? yen(valueOf(w)) : w.kind === 'free' ? '0円' : yen(k?.fee ?? 0);
  return `<tr class="click" data-act="player" data-arg="${p.id}"><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b>${shortList(G0).includes(p.id) ? ' <span class="chip acc">候補</span>' : ''}${(G0.owner.mk.ask ?? []).includes(p.id) ? ' <span class="chip">調査を頼んだ</span>' : ''}</td><td class="r num">${p.age}</td>
    <td class="r">${o != null ? ovrChip(o) : `<span class="fog">${ovrRange(ovr(p))}</span>`}</td><td>${full ? potHtml(G0, p, bestScout()) : '<span class="fog">？</span>'}</td><td>${full ? spChips(p, 2) : '<span class="fog">スカウトが調べるまでわからない</span>'}</td>
    <td>${place}</td><td class="r num">${price}</td>${extra}</tr>`;
}
const bestScout = () => Math.max(0.2, ...g().owner.scouts.map((s) => s.skill));
const head = (extra = '') => `<thead><tr><th>POS</th><th>名前</th><th class="r">年齢</th><th class="r">総合力</th><th>潜在</th><th>特殊能力</th><th>所属</th><th class="r">移籍金の相場</th>${extra}</tr></thead>`;
VIEWS.transfer = () => {
  const G0 = g(); const tab = S.ui.mkTab ?? 'known'; const open = marketOpen(G0);
  const idx = playerIndex(G0); const mk = G0.owner.mk;
  const tabs = [['known', `スカウトの報告（${Object.values(mk.known).filter((k) => k.full).length}）`], ['short', `候補リスト（${shortList(G0).length}）`], ['clubs', 'ほかのクラブ'], ['free', `フリー（${mk.free.length}）`], ['offers', `届いたオファー${G0.pending.length ? `（${G0.pending.length}）` : ''}`], ['mine', 'うちの選手を売る']].map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="mkTab" data-arg="${k}">${n}</button>`).join('');
  const posF = S.ui.mkPos ?? 'all';
  const filt = (arr: Where[]) => arr.filter((w) => posF === 'all' || w.p.pos === posF);
  const posTabs = `<div class="tabs">${['all', ...POS].map((x) => `<button class="tab ${posF === x ? 'on' : ''}" data-act="mkPos" data-arg="${x}">${x === 'all' ? '全員' : x}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'known' || tab === 'short') {
    const ids = tab === 'short' ? shortList(G0) : Object.values(mk.known).filter((k) => k.full).sort((a, b) => b.season * 48 + b.week - a.season * 48 - a.week).map((k) => k.pid);
    const ws = filt(ids.map((id) => idx.get(id)).filter((w): w is Where => !!w));
    body = `${posTabs}<div class="tbl-wrap"><table class="tbl">${head('<th>スカウトのひとこと</th>')}<tbody>${ws.map((w) => fogRow(w, `<td class="small muted" style="white-space:normal;min-width:220px">${esc(mk.known[w.p.id]?.note ?? '')}</td>`)).join('') || '<tr><td colspan="9" class="muted">まだいない。スカウトは毎月はじめに、条件に合う選手を調べてくる</td></tr>'}</tbody></table></div>`;
  } else if (tab === 'clubs') {
    const cid = S.ui.mkClub ?? G0.clubs.find((c) => !c.me && c.tier === myTier(G0))!.id;
    const sel = `<select class="input" style="width:auto" data-change="mkClub" aria-label="クラブを選ぶ">${[1, 2, 3].map((t) => `<optgroup label="${t}部">${G0.clubs.filter((c) => c.tier === t && !c.me).map((c) => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
    const c = clubById(G0, cid);
    const ws = filt([...c.squad].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos)).map((p) => idx.get(p.id)!).filter(Boolean));
    body = `<div class="row">${sel}${posTabs}<span class="muted small">${c.tier}部・強さ ${(c.squad.map(ovr).sort((a, b) => b - a).slice(0, 11).reduce((s, x) => s + x, 0) / 11).toFixed(1)}・お金 ${c.fin ? (c.fin.money > 50000 ? '裕福' : c.fin.money < 5000 ? '苦しい' : 'ふつう') : ''}</span></div>
      <div class="tbl-wrap"><table class="tbl">${head()}<tbody>${ws.map((w) => fogRow(w)).join('')}</tbody></table></div><div class="muted small">スカウトが調べていない選手は、総合力のおおよそしかわからない。気になる選手は、選手の画面から「調べてもらう」を頼もう（翌月はじめに調べてくる）。</div>`;
  } else if (tab === 'free') {
    body = `${posTabs}<div class="tbl-wrap"><table class="tbl">${head()}<tbody>${filt(mk.free.map((p) => idx.get(p.id)!).filter(Boolean)).map((w) => fogRow(w)).join('') || '<tr><td class="muted" colspan="8">いまはいない。12月に契約が切れた選手がフリーになる</td></tr>'}</tbody></table></div><div class="muted small">フリーの選手は移籍金なし（給料は高め）。申し込めるのは移籍の期間だけ。</div>`;
  } else if (tab === 'offers') {
    body = G0.pending.length ? `<div class="stack">${G0.pending.map((o, i) => { const p = G0.squad.find((x) => x.id === o.pid); if (!p) return ''; return `<div class="alert info"><span>${esc(o.club)} が <b>${esc(p.name)}</b>（${p.pos}・${p.age}歳・総合力${ovr(p)}）に <b class="num acc" style="font-size:15px">${yen(o.price)}</b> を出すと言っている${o.listed ? '（売りに出していた選手）' : ''}</span><span class="row"><button class="btn small primary" data-act="offerYes" data-arg="${i}">売る</button><button class="btn small" data-act="offerUp" data-arg="${i}:15">+15%を求める</button><button class="btn small" data-act="offerUp" data-arg="${i}:30">+30%を求める</button><button class="btn small" data-act="offerNo" data-arg="${i}">断る</button></span></div>`; }).join('')}</div>` : '<div class="empty">いまは届いていない。選手を売りに出すと、移籍の期間に声がかかりやすい</div>';
  } else {
    const ps = [...G0.squad].sort((a, b) => Number(!!b.listed) - Number(!!a.listed) || ovr(a) - ovr(b));
    body = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>POS</th><th>名前</th><th class="r">年齢</th><th class="r">総合力</th><th class="r">相場</th><th class="r">年俸</th><th class="r">契約</th><th>売りに出す</th><th></th></tr></thead><tbody>${ps.map((p) => `<tr><td>${posTag(p.pos)}</td><td class="click" data-act="player" data-arg="${p.id}"><b>${esc(p.name)}</b>${p.wantOut ? ' <span class="chip bad">移籍希望</span>' : ''}</td><td class="r num">${p.age}</td><td class="r">${ovrChip(ovr(p))}</td><td class="r num">${yen(valueFor(p))}</td><td class="r num">${yen(p.salary)}</td><td class="r num">${p.contract}年</td><td><button class="btn small ${p.listed ? 'sel' : ''}" data-act="list" data-arg="${p.id}">${p.listed ? '売りに出し中' : '売りに出す'}</button></td><td><button class="btn small danger" data-act="releaseAsk" data-arg="${p.id}">契約を切る（${yen(releaseCost(p))}）</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  const bud = G0.budget;
  return `<div class="view-head"><h1>移籍市場</h1><div class="row"><span class="chip ${open ? 'acc' : ''}">${open ? '移籍の期間（プロ・フリーに申し込める）' : '移籍の期間の外（7〜8月と12月に開く。高校生・大学生はいつでも獲れる）'}</span>${bud ? `<span class="chip">補強の予算 ${yen(Math.max(0, bud.cap - bud.spent))} のこり</span>` : ''}</div></div>
  <section class="panel"><div class="tabs">${tabs}</div>${body}</section>`;
};
const valueFor = (p: Player) => marketValue(p, myTier(g()));
ACT.mkTab = (t) => { S.ui.mkTab = t; render(); };
ACT.mkPos = (p) => { S.ui.mkPos = p; render(); };
CHANGE.mkClub = (v) => { S.ui.mkClub = +v; render(); };
ACT.list = (id) => { const p = g().squad.find((x) => x.id === +id)!; listPlayer(g(), +id, !p.listed); save(); render(); };
ACT.releaseAsk = (id) => { const p = g().squad.find((x) => x.id === +id)!; confirmBox('契約を切る', `${esc(p.name)}との契約を切ります。のこりの契約の給料の半分（${yen(releaseCost(p))}）を払います。`, '契約を切る', () => { const e = releasePlayer(g(), +id); if (e) toast('できません', e, 'bad'); else toast('契約を切った', `${p.name}はフリーになった`); save(); render(); }, true); };
ACT.offerYes = (i) => { const o = g().pending[+i]; const p = g().squad.find((x) => x.id === o.pid)!; confirmBox('売る', `${esc(p.name)}を ${esc(o.club)} に ${yen(o.price)} で売ります。`, '売る', () => { const e = answerOffer(g(), +i, true); if (e) toast('売れなかった', e, 'bad'); else toast('売った', `${p.name}は${o.club}へ移った`, 'good'); save(); render(); }); };
ACT.offerNo = (i) => { answerOffer(g(), +i, false); save(); render(); };
ACT.offerUp = (v) => { const [i, pct] = v.split(':').map(Number); const t = raiseOffer(g(), i, pct); toast('返事', t); save(); render(); };
ACT.short = (id) => { const on = toggleShort(g(), +id); toast(on ? '候補リストに入れた' : '候補リストから外した', ''); save(); render(); };
ACT.ask = (id) => { const on = askScout(g(), +id); toast(on ? 'スカウトに調べてもらう' : '調べるのを取りやめた', on ? '翌月のはじめに調べてくる' : ''); save(); render(); };
ACT.forget = (id) => { forgetKnown(g(), +id); closeModal(); save(); render(); };
ACT.nego = (id) => openNego(+id);

/* ---------- スカウト ---------- */
VIEWS.scout = () => {
  const G0 = g(); const o = G0.owner;
  const cards = o.scouts.map((s, i) => { const c = scoutCond(s);
    const posBtns = POS.map((p) => `<button class="tab ${c.pos.includes(p) ? 'on' : ''}" data-act="scPos" data-arg="${i}:${p}">${p}</button>`).join('');
    const regs = `<select class="input" style="width:auto" data-change="scReg" data-arg="${i}"><option value="">地域はこだわらない</option>${SCOUT_REGIONS.map((r) => `<option value="${r}" ${c.region === r ? 'selected' : ''}>${regionLabel(r)}</option>`).join('')}</select>`;
    const vsel = (k: 'vmin' | 'vmax') => `<select class="input" style="width:auto" data-change="scVal" data-arg="${i}:${k}"><option value="">${k === 'vmin' ? '下限なし' : '上限なし'}</option>${VALUE_STEPS.map((v) => `<option value="${v}" ${c[k] === v ? 'selected' : ''}>${v ? yen(v) : '0円'}</option>`).join('')}</select>`;
    const asel = (k: 'amin' | 'amax') => `<select class="input" style="width:auto" data-change="scAge" data-arg="${i}:${k}"><option value="">${k === 'amin' ? '何歳から' : '何歳まで'}</option>${[16, 17, 18, 19, 20, 21, 22, 23, 25, 27, 29, 31, 33].map((a) => `<option value="${a}" ${c[k] === a ? 'selected' : ''}>${a}歳</option>`).join('')}</select>`;
    return `<section class="panel"><div class="panel-h"><h2>${esc(s.name)}</h2><span class="stars">${'★'.repeat(Math.max(1, Math.round(s.skill * 5)))}</span></div>
      <div class="muted small">${skillWord(s.skill)}・得意な地方 ${regionLabel(s.region)}${s.pos ? `・得意なポジション ${s.pos}` : ''}・給料 ${yen(s.salary)}/年</div>
      <div class="small"><b>いまの条件：</b>${esc(condText(c))}</div>
      <h3>ポジション</h3><div class="tabs">${posBtns}</div>
      <div class="row">${regs}<span class="muted small">相場</span>${vsel('vmin')}〜${vsel('vmax')}</div><div class="row"><span class="muted small">年齢</span>${asel('amin')}〜${asel('amax')}
      <label class="chk"><input type="checkbox" ${c.fit !== false ? 'checked' : ''} data-change="scFit" data-arg="${i}">いまのお金で獲れて、段の差が1つまでの選手を先に探す</label></div></section>`; }).join('');
  return `<div class="view-head"><h1>スカウト</h1><span class="muted">スカウト ${o.scouts.length}人（最大3人）・スカウト部 レベル${o.fac.scout}</span></div>
  <div class="muted small">スカウトは毎月はじめに、ここで決めた条件に合う選手を調べてくる（プロ・フリー・高校生・大学生）。報告は「移籍市場」に並ぶ。腕のいいスカウトほど、隠れた原石を見つける。</div>
  <div class="grid g3">${cards || '<div class="empty">スカウトを雇っていない。「スタッフ」の画面で雇おう</div>'}</div>`;
};
const sc = (i: string) => scoutCond(g().owner.scouts[+i]);
ACT.scPos = (v) => { const [i, p] = v.split(':'); const c = sc(i); c.pos = c.pos.includes(p as Pos) ? c.pos.filter((x) => x !== p) : [...c.pos, p as Pos]; save(); render(); };
CHANGE.scReg = (v, i) => { sc(i).region = v || null; save(); render(); };
CHANGE.scVal = (v, a) => { const [i, k] = a.split(':'); (sc(i) as any)[k] = v === '' ? null : +v; save(); render(); };
CHANGE.scAge = (v, a) => { const [i, k] = a.split(':'); (sc(i) as any)[k] = v === '' ? null : +v; save(); render(); };
CHANGE.scFit = (_v, i, el) => { sc(i).fit = (el as HTMLInputElement).checked; save(); };

/* ---------- スタッフ ---------- */
VIEWS.staff = () => {
  const G0 = g(); const o = G0.owner; const win = coachWindow(G0); const m = G0.mgr;
  const mgrCard = (x: typeof m, cur: boolean) => `<div class="opt ${cur ? 'on' : ''}"><b>${esc(x.name)}（${x.age}歳）</b><span>${growWord(x)}（${x.grow.toFixed(2)}）・采配の腕 ${'★'.repeat(Math.max(1, Math.round((0.3 + Math.min(1, Math.max(0, (x.salary - 1650) / 6000)) * 0.7) * 5)))}・給料 ${yen(x.salary)}/年</span>${cur ? '<span class="chip acc">いまのヘッドコーチ</span>' : `<button class="btn small" data-act="hireMgr" data-arg="${x.id}">雇う（違約金 ${yen(Math.round(m.salary / 2 / 10) * 10)}）</button>`}</div>`;
  const coachRows = COACH_ROLES.map((k) => { const c = o.coaches[k];
    return `<section class="panel"><div class="panel-h"><h2>${COACH_NAME[k]}</h2><span class="muted small">${COACH_NOTE[k]}</span></div>
      ${c ? `<div class="row between"><span><b>${esc(c.name)}</b>（${c.age}歳）・${skillWord(c.skill)} <span class="stars">${'★'.repeat(Math.max(1, Math.round(c.skill * 5)))}</span></span><span class="num">${yen(c.salary)}/年</span></div>${win ? `<button class="btn small danger" data-act="fireCoach" data-arg="${k}">やめてもらう</button>` : ''}` : '<div class="muted">いない（受け持つ能力が伸びにくい）</div>'}
      ${win ? `<h3>雇える人</h3><div class="stack">${o.market.coach[k].map((x) => `<div class="row between"><span>${esc(x.name)}（${x.age}歳）・${skillWord(x.skill)} <span class="stars">${'★'.repeat(Math.max(1, Math.round(x.skill * 5)))}</span></span><span class="row"><span class="num">${yen(x.salary)}/年</span><button class="btn small" data-act="hireCoach" data-arg="${k}:${x.id}">雇う</button></span></div>`).join('')}</div>` : ''}</section>`; }).join('');
  const scouts = `<section class="panel"><div class="panel-h"><h2>スカウト（${o.scouts.length}/3）</h2></div>${o.scouts.map((s) => `<div class="row between"><span><b>${esc(s.name)}</b>・${skillWord(s.skill)} <span class="stars">${'★'.repeat(Math.max(1, Math.round(s.skill * 5)))}</span>・${regionLabel(s.region)}${s.pos ? '・' + s.pos : ''}</span><span class="row"><span class="num">${yen(s.salary)}/年</span><button class="btn small danger" data-act="fireScout" data-arg="${s.id}">やめてもらう</button></span></div>`).join('')}
    <h3>雇えるスカウト</h3><div class="stack">${o.market.scout.map((s) => `<div class="row between"><span>${esc(s.name)}・${skillWord(s.skill)} <span class="stars">${'★'.repeat(Math.max(1, Math.round(s.skill * 5)))}</span>・${regionLabel(s.region)}${s.pos ? '・' + s.pos : ''}</span><span class="row"><span class="num">${yen(s.salary)}/年</span><button class="btn small" ${o.scouts.length >= 3 ? 'disabled' : ''} data-act="hireScout" data-arg="${s.id}">雇う</button></span></div>`).join('')}</div></section>`;
  return `<div class="view-head"><h1>スタッフ</h1><span class="muted">スタッフの給料 ${yen(staffPay(G0))}/年${win ? '・<span class="acc">いまはコーチを入れかえられる時期</span>' : '・コーチの入れかえは冬（12月）'}</span></div>
  <section class="panel"><h2>ヘッドコーチ</h2><div class="muted small">采配はGM（あなた）がするが、試合中の交代と、先発を任せたときの選手選びはヘッドコーチがする。育てる腕は、試合に出た選手の伸びに効く。</div>
    <div class="opt-grid">${mgrCard(m, true)}${o.market.mgr.map((x) => mgrCard(x, false)).join('')}</div></section>
  <div class="grid g2">${coachRows}${scouts}</div>`;
};
ACT.hireMgr = (id) => confirmBox('ヘッドコーチを代える', '今のヘッドコーチとの契約を切り、新しい人を雇います（違約金がかかります）。', '代える', () => { const e = hireManager(g(), +id); if (e) toast('できません', e, 'bad'); save(); render(); });
ACT.hireCoach = (v) => { const [k, id] = v.split(':'); const e = hireCoach(g(), k as never, +id); if (e) toast('できません', e, 'bad'); save(); render(); };
ACT.fireCoach = (k) => { const e = fireCoach(g(), k as never); if (e) toast('できません', e, 'bad'); save(); render(); };
ACT.hireScout = (id) => { const e = hireScout(g(), +id); if (e) toast('できません', e, 'bad'); save(); render(); };
ACT.fireScout = (id) => { fireScout(g(), +id); save(); render(); };

/* ---------- 施設 ---------- */
VIEWS.facilities = () => {
  const G0 = g(); const o = G0.owner;
  const eff: Record<string, (lv: number) => string> = { stadium: (lv) => `${fmt(STADIUM_CAP[lv] ?? 0)}人`, field: (lv) => `練習の伸び ×${(0.85 + lv * 0.15).toFixed(2)}`, youth: (lv) => `ユースの子の素質 +${lv * 3}`, dorm: (lv) => (lv ? `遠くの県の子が来る（レベル${lv}）` : 'なし'), medical: (lv) => `ケガの治りが早い（レベル${lv}）`, scout: (lv) => `調べる人数 +${Math.floor((lv - 1) / 2)}・★の見立て${lv >= 5 ? '正確' : lv >= 3 ? '幅1' : '幅2'}`, shop: (lv) => `グッズ +${(lv - 1) * 15}%` };
  const cards = FAC_KEYS.map((k) => { const lv = o.fac[k] ?? 0; const max = lv >= MAX_FAC; const b = o.build?.key === k ? o.build : null;
    const pips = Array.from({ length: MAX_FAC }, (_, i) => `<i class="${i < lv ? 'on' : b && i === lv ? 'bld' : ''}"></i>`).join('');
    const cost = max ? 0 : facCost(k, lv + 1);
    return `<section class="panel"><div class="panel-h"><h2>${FAC_NAME[k]}</h2><span class="num" style="font-size:20px;font-weight:700">Lv${lv}</span></div><div class="pips">${pips}</div>
      <div class="muted" style="font-size:12px">${esc(FAC_NOTE[k])}</div>
      <div class="kv"><dt>いま</dt><dd>${eff[k](lv)}</dd>${max ? '' : `<dt>次のレベル</dt><dd class="acc">${eff[k](lv + 1)}</dd><dt>費用</dt><dd>${yen(cost)}</dd><dt>工事</dt><dd>${facWeeks(k, lv + 1)}週</dd>`}</div>
      ${b ? `<div class="chip acc">工事中・あと${b.weeks}週</div>` : max ? '<div class="chip good">最大</div>' : `<button class="btn ${o.money >= cost && !o.build ? 'primary' : ''}" ${o.money >= cost && !o.build ? '' : 'disabled'} data-act="build" data-arg="${k}">強化する（${yen(cost)}）</button>`}</section>`; }).join('');
  return `<div class="view-head"><h1>施設</h1><span class="muted">${o.build ? `いま${FAC_NAME[o.build.key]}を工事中（一度に1つまで）` : '一度に強化できるのは1つまで'}</span></div><div class="fac-grid">${cards}</div>`;
};
ACT.build = (k) => { const e = startBuild(g(), k as never); if (e) toast('強化できない', e, 'bad'); else toast('工事を始めた', FAC_NAME[k as keyof typeof FAC_NAME]); save(); render(); };

/* ---------- 財務 ---------- */
VIEWS.finance = () => {
  const G0 = g(); const o = G0.owner; const tier = myTier(G0); const t0 = tierTicket(tier); const sp = G0.gm.sponsor;
  const L = o.ledger; const LL = o.lastLedger;
  const inc = INCOME_KEYS.reduce((s, k) => s + (L[k] ?? 0), 0), exp = EXPENSE_KEYS.reduce((s, k) => s + (L[k] ?? 0), 0);
  const tbl = (keys: typeof INCOME_KEYS, cls: string) => keys.map((k) => `<tr><td>${esc(MONEY_NAME[k])}</td><td class="r num ${cls}">${yen(L[k] ?? 0)}</td><td class="r num muted">${LL ? yen(LL[k] ?? 0) : '-'}</td></tr>`).join('');
  const tab = S.ui.finTab ?? 'season';
  const pts = tab === 'season' ? G0.gm.mh.filter((h) => h[0] === G0.season).map((h) => ({ label: `${monthOf(h[1])}月`, y: h[2] })) : G0.gm.log.map((l) => ({ label: `${l.season}年目`, y: l.money }));
  const cap = debtCap(tier);
  return `<div class="view-head"><h1>財務</h1><span class="num ${moneyCls(o.money)}" style="font-size:24px;font-weight:700">${yen(o.money)}</span></div>
  <section class="panel"><div class="panel-h"><h2>お金の動き</h2><div class="tabs"><button class="tab ${tab === 'season' ? 'on' : ''}" data-act="finTab" data-arg="season">今シーズン</button><button class="tab ${tab === 'all' ? 'on' : ''}" data-act="finTab" data-arg="all">年ごと（12月の時点）</button></div></div>
    ${lineChart('fin-money', pts, { fmt: (v) => yen(v), h: 190, zero: true, aria: 'お金の動き' })}</section>
  <div class="grid g3">
    <section class="panel"><h2>チケットの値段</h2><span class="big-stat">${fmt(G0.gm.ticket)}<span style="font-size:16px">円</span></span>
      <input type="range" min="800" max="${t0 * 3}" step="100" value="${G0.gm.ticket}" data-change="ticket" data-input="ticketLabel" aria-label="チケットの値段">
      <div class="kv"><dt>${tier}部の相場</dt><dd>${fmt(t0)}円</dd><dt>スタジアム</dt><dd>${fmt(STADIUM_CAP[o.fac.stadium] ?? 0)}人</dd></div>
      <div class="muted" style="font-size:12px">高くすると1人あたりは増えるが、お客さんが減る。相場の1.5倍をこえると、ホームの試合のたびに人気が少し下がる。</div></section>
    <section class="panel"><h2>スポンサー</h2>${sp ? `<div style="font-size:16px;font-weight:700">${esc(sp.name)}</div><div class="kv"><dt>1年の固定額</dt><dd>${yen(sp.base)}</dd>${sp.perWin ? `<dt>勝つたびに</dt><dd>${yen(sp.perWin)}</dd>` : ''}${sp.perGoal ? `<dt>1点ごとに</dt><dd>${yen(sp.perGoal)}</dd>` : ''}</div><div class="muted small">契約は1年。毎年1月に選び直す。</div>` : '<div class="empty">1月にスポンサーを選ぶ</div>'}</section>
    <section class="panel"><h2>借金</h2><div class="kv"><dt>いまの借金</dt><dd class="${o.debt ? 'bad' : ''}">${yen(o.debt)}</dd><dt>借りられる上限</dt><dd>${yen(cap)}</dd><dt>利息</dt><dd>年3%</dd></div>
      <div class="row"><button class="btn small" data-act="borrow" data-arg="5000">5,000万円借りる</button><button class="btn small" data-act="borrow" data-arg="20000">2億円借りる</button></div>
      <div class="row"><button class="btn small" ${o.debt ? '' : 'disabled'} data-act="repay" data-arg="5000">5,000万円返す</button><button class="btn small" ${o.debt ? '' : 'disabled'} data-act="repay" data-arg="999999999">全部返す</button></div>
      <div class="muted small">お金がマイナスになると、自動で借りる。上限まで借りてもマイナスだと、給料が遅れてオーナーの信頼が下がる。</div></section>
  </div>
  <div class="grid g2"><section class="panel"><div class="panel-h"><h2>今シーズンの収入</h2><b class="num good" style="font-size:16px">${yen(inc)}</b></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="r">今シーズン</th><th class="r">去年</th></tr></thead><tbody>${tbl(INCOME_KEYS, 'good')}</tbody></table></div></section>
  <section class="panel"><div class="panel-h"><h2>今シーズンの支出</h2><b class="num bad" style="font-size:16px">${yen(exp)}</b></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="r">今シーズン</th><th class="r">去年</th></tr></thead><tbody>${tbl(EXPENSE_KEYS, 'bad')}</tbody></table></div>
    <div class="kv"><dt>選手の給料（1年）</dt><dd>${yen(payroll(G0))}</dd><dt>スタッフの給料（1年）</dt><dd>${yen(staffPay(G0))}</dd><dt>リーグからの分配金（1年）</dt><dd class="good">${yen(distYear(tier))}</dd></div></section></div>`;
};
ACT.finTab = (t) => { S.ui.finTab = t; render(); };
CHANGE.ticket = (v) => { g().gm.ticket = +v; save(); render(); };
import('./util').then((u) => { u.INPUT.ticketLabel = (v) => { const el = document.querySelector('.big-stat'); if (el) el.innerHTML = `${fmt(+v)}<span style="font-size:16px">円</span>`; }; });
ACT.borrow = (v) => { const got = borrow(g(), +v); toast(got ? '借りた' : '借りられない', got ? yen(got) : '借金の上限に来ている', got ? 'info' : 'bad'); save(); render(); };
ACT.repay = (v) => { const a = repay(g(), +v); toast(a ? '返した' : '返せない', a ? yen(a) : 'お金が足りない'); save(); render(); };

/* ---------- メッセージ ---------- */
VIEWS.inbox = () => {
  const G0 = g(); const box = G0.inbox ?? []; const open = S.ui.mail != null ? box.find((m) => m.id === S.ui.mail) : null;
  const list = box.map((m) => `<div class="mail ${m.read ? '' : 'unread'}" data-act="mail" data-arg="${m.id}"><span class="muted small">${esc(m.at)}</span><span class="t">${esc(m.title)} <span class="muted small">— ${esc(m.from)}（${esc(m.who)}）</span></span><span>${m.kind === 'wantOut' ? '<span class="chip bad">返事がいる</span>' : ''}</span></div>`).join('');
  let detail = '<div class="empty">メッセージを選ぶと、ここに出る</div>';
  if (open) { const p = open.pid != null ? G0.squad.find((x) => x.id === open.pid) : null;
    detail = `<div class="eyebrow">${esc(open.from)}・${esc(open.who)}・${esc(open.at)}</div><h2>${esc(open.title)}</h2><p style="white-space:pre-wrap">${esc(open.body)}</p>
      ${open.kind === 'wantOut' && p?.wantOut ? `<div class="row"><button class="btn primary" data-act="wantOut" data-arg="${open.id}:1">売りに出す</button><button class="btn" data-act="wantOut" data-arg="${open.id}:0">引きとめる</button></div>` : ''}${p ? `<button class="btn small" data-act="player" data-arg="${p.id}">${esc(p.name)}の画面</button>` : ''}`; }
  return `<div class="view-head"><h1>メッセージ</h1><button class="btn small" data-act="readAll">全部読んだことにする</button></div><div class="two-col"><section class="panel"><div>${list || '<div class="muted">まだない</div>'}</div></section><section class="panel">${detail}</section></div>`;
};
ACT.mail = (id) => { S.ui.mail = +id; const m = (g().inbox ?? []).find((x) => x.id === +id); if (m) m.read = true; save(); render(); };
ACT.readAll = () => { for (const m of g().inbox ?? []) m.read = true; save(); render(); };
ACT.wantOut = (v) => { const [id, sell] = v.split(':').map(Number); const m = (g().inbox ?? []).find((x) => x.id === id); if (!m?.pid) return; const t = answerWantOut(g(), m.pid, sell === 1, Math.random()); m.kind = undefined; toast('返事をした', t); save(); render(); };

/* ---------- 実績・ミッション ---------- */
VIEWS.achievements = () => {
  const G0 = g(); const got = Object.keys(G0.gm.ach).length; const cats = [...new Set(ACH.map((a) => a.c))];
  const medal = (t: number) => (t === 3 ? 'var(--gold)' : t === 2 ? 'var(--silver)' : 'var(--bronze)');
  const ms = G0.gm.missions.map((m) => `<div class="mission ${m.done ? 'done' : ''}"><div class="mt"><span>${m.done ? '達成　' : ''}${esc(m.text)}</span><span class="num muted">${m.id === 'profit' || m.id === 'cup' ? '' : `${fmt(Math.min(m.prog, m.target))} / ${fmt(m.target)}`}</span></div><div class="bar"><i style="width:${m.done ? 100 : Math.min(100, (m.prog / m.target) * 100)}%;background:${m.done ? 'var(--good)' : 'var(--accent)'}"></i></div><div class="muted" style="font-size:11px">報酬 ${yen(m.reward)}・人気 +${m.pop}</div></div>`).join('');
  return `<div class="view-head"><h1>実績・ミッション</h1><span class="muted">${got} / ${ACH.length}（${Math.round((got / ACH.length) * 100)}%）</span></div>
  <section class="panel"><h2>今シーズンのミッション</h2><div class="stack">${ms}</div></section>
  <div class="bar" style="height:10px"><i style="width:${(got / ACH.length) * 100}%;background:var(--accent)"></i></div>
  ${cats.map((c) => `<section class="panel"><div class="panel-h"><h2>${c}</h2><span class="muted num">${ACH.filter((a) => a.c === c && G0.gm.ach[a.id]).length} / ${ACH.filter((a) => a.c === c).length}</span></div><div class="ach-grid">${ACH.filter((a) => a.c === c).map((a) => { const x = G0.gm.ach[a.id]; return `<div class="ach ${x ? '' : 'off'}"><span class="medal" style="background:${medal(a.t)}">${['', '銅', '銀', '金'][a.t]}</span><div><b>${a.n}</b><span>${a.d}</span>${x ? `<span class="num" style="color:var(--fg2)">${x.y}年目 ${monthOf(x.w)}月に達成</span>` : `<span>報酬 ${yen(ACH_REWARD[a.t])}</span>`}</div></div>`; }).join('')}</div></section>`).join('')}`;
};

/* ---------- クラブ史 ---------- */
VIEWS.history = () => {
  const G0 = g(); const tab = S.ui.histTab ?? 'seasons';
  const tabs = [['seasons', 'シーズンの記録'], ['awards', '表彰'], ['hof', `殿堂（${G0.gm.hof.length}）`], ['records', 'クラブの記録']].map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="histTab" data-arg="${k}">${n}</button>`).join('');
  let body = '';
  if (tab === 'seasons') {
    const H = G0.history; const logs = Object.fromEntries(G0.gm.log.map((l) => [l.season, l]));
    const gl = Object.fromEntries((G0.goalLog ?? []).map((x) => [x.season, x]));
    const pts = H.map((h) => ({ label: `${h.season}年`, y: (h.tier - 1) * 12 + h.rank }));
    body = `${H.length >= 2 ? `<h3>全体の順位の移り変わり（1部の1位＝1、3部の12位＝36）</h3>${lineChart('hist-rank', pts, { invert: true, yMin: 1, yMax: 36, ticks: [1, 12.5, 24.5, 36], fmt: (v, tip) => (tip ? `${Math.ceil(v / 12)}部 ${((v - 1) % 12) + 1}位` : v === 12.5 ? '1部｜2部' : v === 24.5 ? '2部｜3部' : v === 1 ? '1部1位' : '3部12位'), h: 200, aria: '順位の移り変わり' })}` : ''}
    ${H.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>年</th><th>段</th><th class="r">順位</th><th>天皇杯</th><th>結果</th><th>目標</th><th class="r">人気</th><th class="r">平均のお客さん</th><th class="r">収支</th><th class="r">12月のお金</th></tr></thead><tbody>${[...H].reverse().map((h) => { const l = logs[h.season]; const x = gl[h.season];
      return `<tr><td class="num">${h.season}年目</td><td>${h.tier}部</td><td class="r num"><b style="font-size:15px">${h.rank}位</b></td><td>${esc(h.cup)}</td><td>${h.rank === 1 ? '<span class="chip acc">優勝</span> ' : ''}${h.promoted ? '<span class="chip good">昇格</span>' : ''}${h.relegated ? '<span class="chip bad">降格</span>' : ''}</td><td>${x ? `${esc(x.text)} ${x.ok ? '<span class="good">達成</span>' : '<span class="bad">未達</span>'}` : '-'}</td><td class="r num">${l ? l.pop : '-'}</td><td class="r num">${l ? fmt(l.att) + '人' : '-'}</td><td class="r num ${l ? moneyCls(l.profit) : ''}">${l ? yen(l.profit) : '-'}</td><td class="r num">${l ? yen(l.money) : '-'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">最初のシーズンが終わると、記録が残る</div>'}`;
  } else if (tab === 'awards') {
    body = G0.history.length ? [...G0.history].reverse().map((h) => `<div class="stack"><h3>${h.season}年目（${h.tier}部 ${h.rank}位）</h3><div class="small">${[...h.awards, ...(h.xi ?? [])].filter((a) => a.me).map((a) => `<span class="chip acc">${esc(a.title)}</span> ${esc(a.name)}`).join('　') || '<span class="muted">自分の選手の受賞はなかった</span>'}</div><div class="small muted">優勝：${[1, 2, 3].map((t) => `${t}部 ${esc(h.champion[t] ?? '')}`).join('・')}・天皇杯 ${esc(h.cupChampion || '-')}</div></div>`).join('') : '<div class="empty">年末の表彰式のあとに残る</div>';
  } else if (tab === 'hof') {
    body = G0.gm.hof.length ? `<div class="ach-grid">${G0.gm.hof.map((h) => `<div class="ach"><span class="medal" style="background:var(--gold)">${h.pos}</span><div><b>${esc(h.name)}</b><span class="num">このクラブで ${h.apps}試合 ${h.goals}点・いちばん高い総合力 ${h.peak}</span><span>${h.youth ? 'ユース出身・' : ''}${h.honors ? `表彰${h.honors}回・` : ''}${h.season}年目に${esc(h.why)}</span></div></div>`).join('')}</div>` : '<div class="empty">このクラブで150試合に出た、50点取った、表彰に2回選ばれた（ユース出身は100試合）選手がクラブを去ると、殿堂に入る</div>';
  } else {
    const r = G0.gm.rec;
    body = `<div class="kv" style="max-width:460px"><dt>就任</dt><dd>${G0.season}年目</dd><dt>リーグ優勝</dt><dd>${G0.history.filter((h) => h.rank === 1).length}回</dd><dt>天皇杯優勝</dt><dd>${G0.history.filter((h) => h.cup === '優勝').length}回</dd><dt>昇格</dt><dd>${G0.history.filter((h) => h.promoted).length}回</dd><dt>いちばん長い連勝</dt><dd>${r.best}連勝</dd><dt>1試合でいちばん多い点</dt><dd>${r.maxGoals}点</dd><dt>いちばん多いお客さん</dt><dd>${fmt(r.maxAtt)}人</dd><dt>いちばん高い人気</dt><dd>${Math.round(r.maxPop)}</dd><dt>いちばん高い獲得</dt><dd>${yen(r.bigBuy)}</dd><dt>いちばん高い売却</dt><dd>${yen(r.bigSell)}</dd></div>`;
  }
  return `<div class="view-head"><h1>クラブ史</h1><div class="tabs">${tabs}</div></div><section class="panel">${body}</section>`;
};
ACT.histTab = (t) => { S.ui.histTab = t; render(); };

/* ---------- セーブ・設定 ---------- */
VIEWS.system = () => {
  const G0 = g();
  return `<div class="view-head"><h1>セーブ・設定</h1></div><div class="grid g2">
  <section class="panel"><h2>セーブ</h2><div class="muted" style="font-size:13px">毎週、このブラウザのスロット${S.slot}に自動で保存される。ブラウザのデータを消すとなくなるので、ときどきセーブコードを書き出しておくと安心。</div>
    <div class="row"><button class="btn primary" data-act="saveNow">いま保存する</button><button class="btn" data-act="exportCode">セーブコードを書き出す</button><button class="btn" data-act="downloadSave">ファイルに保存</button></div>
    <textarea class="input" id="export-box" readonly placeholder="ここにセーブコードが出る"></textarea>
    <div class="row"><button class="btn small" data-act="copyCode">コードをコピー</button><span id="export-msg" class="muted" style="font-size:12px"></span></div></section>
  <section class="panel"><h2>ゲーム</h2><div class="kv" style="max-width:360px"><dt>難易度</dt><dd>${DIFFS[G0.gm.diff].n}</dd><dt>オーナー</dt><dd style="font-family:var(--f-body);font-size:13px">${esc(G0.gm.owner)}</dd><dt>オーナーの信頼</dt><dd>${Math.round(G0.mgrEval ?? 60)}（${evalWord(G0.mgrEval ?? 60)}）</dd></div>
    <div class="row"><button class="btn" data-act="toTitleSave">タイトルにもどる</button></div>
    <h3>遊び方</h3><ul class="muted" style="font-size:13px;margin:0;padding-left:18px;display:grid;gap:4px">
    <li>「次の週へ」で1週進む（Ctrl+Enter でも進む）。1年は48週。3〜11月にリーグ戦22試合と天皇杯がある。</li>
    <li>「まとめて進む」は、決めることが出てくるまで、試合を見ずに最大8週進む。</li>
    <li>並び方・戦い方・方針・先発・キッカーは「戦術」、練習のテーマと強さ・個別練習は「練習」で決める。</li>
    <li>2月に春の昇格会議（ユースからトップへ）と春のキャンプ。開幕前と夏に、試合に出られる23人を登録する。</li>
    <li>移籍は7〜8月と12月。ほかのクラブの選手は、スカウトが調べるまで総合力のおおよそしかわからない。</li>
    <li>毎月の終わりに経営会議、12月に表彰式と、来年の目標を決める会議がある。目標に届かないとオーナーの信頼が下がり、0になると解任される。</li></ul></section></div>`;
};
ACT.exportCode = async () => { const code = await exportCode(g()); (document.querySelector('#export-box') as HTMLTextAreaElement).value = code; const m = document.querySelector('#export-msg'); if (m) m.textContent = `${Math.round(code.length / 1024)}KBのコードを書き出した`; };
ACT.copyCode = () => { const box = document.querySelector('#export-box') as HTMLTextAreaElement; if (!box.value) return; navigator.clipboard?.writeText(box.value).then(() => { const m = document.querySelector('#export-msg'); if (m) m.textContent = 'コピーした'; }).catch(() => { box.select(); const m = document.querySelector('#export-msg'); if (m) m.textContent = 'コードを選んだ。Ctrl+C でコピーしてください'; }); };
ACT.downloadSave = async () => { const code = await exportCode(g()); (document.querySelector('#export-box') as HTMLTextAreaElement).value = code; try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' })); a.download = `sodate-${g().club.name}-${g().season}年目.txt`; document.body.appendChild(a); a.click(); a.remove(); } catch { const m = document.querySelector('#export-msg'); if (m) m.textContent = 'この環境ではファイルに保存できない。コードをコピーしてください'; } };
ACT.toTitleSave = () => { save(); closeModal(); S.G = null; S.ui = {}; render(); };
export { sellChance, joinChance, fromTierOf, chanceWord, isBlocked, isWindow, modal };
