/* PC版のモーダル：決めること（スポンサー・出来事・表彰式・会議・昇格会議・選手登録・解任）、週の報告、選手、交渉 */
import { S, G, ACT, CHANGE, esc, yen, fmt, posTag, ovrChip, potHtml, potWord, condArrow, condWord, statNames, modal, modalKeep, closeModal, toast, lineChart, val } from './util';
import { clubById, closeCeremony, decidePromo, avgRt, myTier, ME, type GameState } from '../core/game';
import { pickSponsor, answerEvent, DIFFS, releaseCost } from '../core/gm';
import { closeMeeting, evalWord } from '../core/meeting';
import { applyReg, REG_SIZE, canSwapOut, swapReg } from '../core/squad';
import { promoTalk } from '../core/promotalk';
import { ovr } from '../core/player';
import { APT, POS, colorOf, ORDER_F, ORDER_K, POS_NOTE } from '../core/constants';
import { SP_MAP } from '../core/data/specials';
import { trustStars, loveHearts, tacticFit } from '../core/bond';
import { renewalOffer, setRenew, listPlayer } from '../core/owner';
import { playerIndex, valueOf, marketValue, marketOpen, ovrRange, shortList, sellChance, joinChance, fromTierOf, chanceWord, bid } from '../core/market';
import { startNego, negoTurn, isBlocked, FEE_STEPS, SAL_STEPS, type Nego } from '../core/nego';
import { Rng } from '../core/rng';
import { render, save, chain } from './app';
import type { Player, ReportEntry } from '../core/types';

const g = G;
export type Blocker = 'over' | 'sponsor' | 'event' | 'cere' | 'meet' | 'promo' | 'reg';
export function blockerOf(G0: GameState): Blocker | null {
  if (G0.gm.over) return 'over';
  if (G0.gm.offers) return 'sponsor';
  if (G0.gm.event) return 'event';
  if (G0.cere) return 'cere';
  if (G0.meet) return 'meet';
  if (G0.promo?.open) return 'promo';
  if (G0.regm?.open) return 'reg';
  return null;
}
export function showBlocker(b: Blocker) {
  S.ui.lockModal = b !== 'meet';
  ({ over: showOver, sponsor: showSponsor, event: showEvent, cere: showCere, meet: showMeet, promo: showPromo, reg: showReg } as Record<Blocker, () => void>)[b]();
}
const done = () => { S.ui.lockModal = false; closeModal(); save(); render(); chain(); };

/* ---------- スポンサー ---------- */
function showSponsor() {
  const L = g().gm.offers!;
  modal(`<div class="eyebrow">${g().season}年目・1月</div><h2>今年のメインスポンサーを選ぶ</h2>
  <div class="muted" style="font-size:13px">契約は1年。決まった額は毎週に分けて入る。成果型は、勝ったり点を取ったりするほど増える。</div>
  <div class="stack">${L.map((s, i) => `<button class="choice" data-act="pickSp" data-arg="${i}"><div class="row between"><span>${esc(s.name)}</span><span class="num acc" style="font-size:17px">${yen(s.base)}/年</span></div><div class="muted" style="font-size:12px;font-weight:400">${esc(s.d)}${s.perWin ? `・1勝ごとに +${yen(s.perWin)}` : ''}${s.perGoal ? `・1点ごとに +${yen(s.perGoal)}` : ''}</div></button>`).join('')}</div>`, '', false);
}
ACT.pickSp = (i) => { const s = g().gm.offers![+i]; pickSponsor(g(), +i); toast('スポンサー契約', `${s.name}と1年契約を結んだ（${yen(s.base)}）`, 'good'); done(); };

/* ---------- 出来事 ---------- */
function showEvent() {
  const e = g().gm.event!;
  modal(`<div class="eyebrow">出来事</div><h2>${esc(e.title)}</h2><div>${esc(e.text)}</div><div class="stack">${e.choices.map((c, i) => `<button class="choice" data-act="evAns" data-arg="${i}">${esc(c)}</button>`).join('')}</div>`, '', false);
}
ACT.evAns = (i) => { const e = g().gm.event!; const t = answerEvent(g(), +i); save(); modal(`<h2>${esc(e.title)}</h2><div class="result-msg">${esc(t)}</div><div class="foot"><button class="btn primary" data-act="blockDone">OK</button></div>`, '', false); };
ACT.blockDone = () => done();

/* ---------- 表彰式 ---------- */
function showCere() {
  const c = g().cere!;
  const grp = [1, 2, 3].map((t) => { const a = c.awards.filter((x) => x.tier === t); if (!a.length) return ''; return `<section class="panel"><h3>${t}部</h3>${a.map((x) => `<div class="row between"><span><span class="chip ${x.me ? 'acc' : ''}">${esc(x.title)}</span> ${x.pos ? posTag(x.pos) : ''} <b class="${x.me ? 'n-me' : ''}">${esc(x.name)}</b>（${esc(x.club)}）</span><span class="small muted">${esc(x.detail)}</span></div>`).join('')}</section>`; }).join('');
  const xi = c.xi.length ? `<section class="panel"><h3>${c.tier}部 ベストイレブン</h3><div class="chips">${c.xi.map((x) => `<span class="chip ${x.me ? 'acc' : ''}">${x.pos ?? ''} ${esc(x.name)}</span>`).join('')}</div></section>` : '';
  modal(`<div class="hero-banner"><div class="eyebrow">${c.season}年目</div><div class="t">年末の表彰式</div></div><div class="grid">${grp}${xi}</div>${c.effects.length ? `<div class="result-msg">${c.effects.map(esc).join('<br>')}</div>` : ''}<div class="foot"><button class="btn primary" data-act="cereDone">閉じる</button></div>`, 'wide', false);
}
ACT.cereDone = () => { closeCeremony(g()); done(); };

/* ---------- 会議 ---------- */
function docHTML(d: NonNullable<import('../core/meeting').MeetItem['doc']>) {
  return `<div class="doc"><div class="dh"><b>${esc(d.title)}</b><span class="stamp">${esc(d.stamp)}</span></div>${d.secs.map((s) => `${s.h ? `<div class="eyebrow">${esc(s.h)}</div>` : ''}<table><tbody>${s.rows.map((r) => `<tr class="${r.cls ?? ''}"><td>${esc(r.k)}</td><td>${esc(r.v)}</td></tr>`).join('')}</tbody></table>`).join('')}</div>`;
}
function showMeet() {
  const m = g().meet!; const pick = m.pick;
  const items = m.items.map((it, i) => {
    let ask = '';
    if (it.ask === 'goal' && m.goals) ask = `<div class="stack">${m.goals.map((gl, k) => `<button class="choice ${pick.goal === k ? 'sel' : ''}" data-act="mtPick" data-arg="goal:${k}"><div class="row between"><span>${esc(gl.text)}</span><span class="chip ${gl.level === 'むずかしい' ? 'bad' : gl.level === 'かんたん' ? 'good' : 'acc'}">${esc(gl.level)}</span></div></button>`).join('')}</div>`;
    if (it.ask === 'budget' && m.budgets) ask = `<div class="tabs">${m.budgets.map((b, k) => `<button class="tab ${pick.budget === k ? 'on' : ''}" data-act="mtPick" data-arg="budget:${k}">${yen(b)}</button>`).join('')}</div>`;
    if (it.ask === 'policy') ask = `<div class="tabs">${(['若手多め', 'ふつう', '勝ち優先'] as const).map((p) => `<button class="tab ${pick.policy === p ? 'on' : ''}" data-act="mtPick" data-arg="policy:${p}">${p}</button>`).join('')}</div>`;
    return `<div class="speaker"><div><div class="role">${esc(it.role)}</div><div class="nm">${esc(it.who)}</div></div><div>${it.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${ask}${it.doc ? `<details ${i === 0 ? 'open' : ''}><summary class="small muted">報告書を見る</summary>${docHTML(it.doc)}</details>` : ''}</div></div>`;
  }).join('');
  modalKeep(`<div class="eyebrow">${m.kind === 'year' ? '年に1回' : '月の終わり'}</div><h2>${esc(m.title)}</h2>${items}<div class="foot"><button class="btn primary" data-act="mtDone">${m.kind === 'year' ? 'これで決める' : '会議を終える'}</button></div>`, 'wide');
}
ACT.mtPick = (v) => { const [k, x] = v.split(':'); const p = g().meet!.pick as any; p[k] = k === 'policy' ? x : +x; showMeet(); };
ACT.mtDone = () => { closeMeeting(g()); done(); };

/* ---------- 春の昇格会議 ---------- */
function showPromo() {
  const G0 = g(); const pr = G0.promo!; const sel: number[] = S.ui.promoSel ?? (S.ui.promoSel = [...pr.rec]);
  const talk = promoTalk(G0);
  const rows = [...G0.youth].sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || ovr(b) - ovr(a)).map((p) => { const names = statNames(p); const on = sel.includes(p.id);
    return `<tr><td><button class="btn small ${on ? 'sel' : ''}" data-act="promoT" data-arg="${p.id}">${on ? '上げる' : '上げない'}</button></td><td class="num">${p.grade}年</td><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b>${pr.rec.includes(p.id) ? ' <span class="chip acc">推薦</span>' : ''}${talk.mgr.want.includes(p.id) ? ' <span class="chip">ヘッドコーチがほしい</span>' : ''}</td><td class="r num">${p.age}</td><td class="r">${ovrChip(ovr(p))}</td><td>${potHtml(G0, p, G0.owner.coaches.youth?.skill)}</td><td class="small">${(p.pos === 'GK' ? ORDER_K : ORDER_F).map((i) => `${names[i]}${val(p.a[i])}`).join(' ')}</td></tr>`; }).join('');
  modalKeep(`<div class="eyebrow">${G0.season}年目・2月</div><h2>春の昇格会議</h2><div class="muted small">ユースの子の数字は、ここで初めて見える。上げなかった3年生は卒業してクラブを去る。トップはいま${G0.squad.length}人（最大35人）。</div>
    <div class="speaker"><div><div class="role">ユースコーチ</div><div class="nm">${esc(talk.coach.who)}</div></div><div>${talk.coach.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div></div>
    <div class="speaker"><div><div class="role">ヘッドコーチ</div><div class="nm">${esc(talk.mgr.who)}</div></div><div>${talk.mgr.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>学年</th><th>POS</th><th>名前</th><th class="r">年齢</th><th class="r">総合</th><th>潜在</th><th>能力</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="foot"><span class="muted small">${sel.length}人を上げる</span><button class="btn primary" data-act="promoDone">決める</button></div>`, 'wide', false);
}
ACT.promoT = (id) => { const s: number[] = S.ui.promoSel; const k = s.indexOf(+id); if (k >= 0) s.splice(k, 1); else s.push(+id); showPromo(); };
ACT.promoDone = () => { const out = decidePromo(g(), S.ui.promoSel ?? []); S.ui.promoSel = null; for (const l of out) toast('昇格会議', l, 'good'); done(); };

/* ---------- 選手登録 ---------- */
function showReg() {
  const G0 = g(); const R = G0.regm!; const sel = R.sel;
  const ps = [...G0.squad].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos) || ovr(b) - ovr(a));
  const rows = ps.map((p) => { const on = sel.includes(p.id); const note = R.scout.find((x) => x.pid === p.id)?.text;
    return `<tr><td><button class="btn small ${on ? 'sel' : ''}" data-act="regT" data-arg="${p.id}">${on ? '登録' : '外す'}</button></td><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b>${R.rec.includes(p.id) ? ' <span class="chip acc">ヘッドコーチのおすすめ</span>' : ''}${R.coach.includes(p.id) ? ' <span class="chip">コーチ：試合で伸ばしたい</span>' : ''}${note ? ` <span class="chip">スカウト：${esc(note)}</span>` : ''}</td><td class="r num">${p.age}</td><td class="r">${ovrChip(ovr(p))}</td><td>${p.inj ? `<span class="chip bad">ケガ${p.inj}週</span>` : ''}</td></tr>`; }).join('');
  const gk = ps.filter((p) => sel.includes(p.id) && p.pos === 'GK').length;
  modalKeep(`<div class="eyebrow">${esc(R.kind)}</div><h2>選手登録の会議</h2><div class="muted small">試合に出られるのは、ここで登録した${REG_SIZE}人だけ。次の登録まで入れかえられない（4週以上のケガ人だけ入れかえられる）。</div>
    <div class="tbl-wrap"><table class="tbl"><tbody>${rows}</tbody></table></div>
    <div class="foot"><span class="${sel.length > REG_SIZE || gk < 2 ? 'bad' : 'muted'} small">${sel.length} / ${REG_SIZE}人・キーパー${gk}人${gk < 2 ? '（2人以上必要）' : ''}</span><button class="btn" data-act="regRec">おすすめにもどす</button><button class="btn primary" ${sel.length > REG_SIZE || gk < 2 ? 'disabled' : ''} data-act="regDone">登録する</button></div>`, 'wide', false);
}
ACT.regT = (id) => { const s = g().regm!.sel; const k = s.indexOf(+id); if (k >= 0) s.splice(k, 1); else if (s.length < REG_SIZE) s.push(+id); else toast('いっぱい', `登録できるのは${REG_SIZE}人まで`, 'bad'); showReg(); };
ACT.regRec = () => { const R = g().regm!; R.sel = [...R.rec]; showReg(); };
ACT.regDone = () => { const out = applyReg(g(), g().regm!.sel); for (const l of out) toast('選手登録', l); import('../core/gm').then((m) => { if (g().gm.tac.auto) m.autoXI(g()); m.cleanXI(g()); done(); }); };

/* ---------- 解任 ---------- */
function showOver() {
  const G0 = g(); const o = G0.gm.over!;
  modal(`<div class="hero-banner" style="background:var(--panel2)"><div class="eyebrow">${esc(G0.club.name)}</div><div class="t" style="color:var(--bad)">解任</div><div>${esc(o.reason)}</div></div>
  <div class="kv"><dt>在任</dt><dd>${o.season}年</dd><dt>最高の段</dt><dd>${Math.min(...G0.history.map((h) => h.tier), myTier(G0))}部</dd><dt>優勝</dt><dd>${G0.history.filter((h) => h.rank === 1).length}回</dd><dt>実績</dt><dd>${Object.keys(G0.gm.ach).length}</dd></div>
  <div class="foot"><button class="btn" data-act="overView">記録を見る</button><button class="btn primary" data-act="toTitleSave">タイトルへ</button></div>`, '', false);
}
ACT.overView = () => { S.ui.lockModal = false; closeModal(); S.view = 'history'; render(); };

/* ---------- 週の報告 ---------- */
export function showReport(rep: ReportEntry[], awakeOnly: boolean, after: () => void) {
  S.ui.afterReport = after;
  const G0 = g();
  const awake = rep.filter((e) => e.awake);
  if (awakeOnly && awake.length) {
    const e = awake[0]; const p = G0.squad.find((x) => x.id === e.pid); const names = p ? statNames(p) : [];
    modal(`<div class="awake-banner">覚醒！！</div><div style="text-align:center;font-size:18px"><b>${p ? esc(p.name) : ''}</b> ${p ? posTag(p.pos) : ''}</div>
      <div class="hero-banner"><div class="t">${names[e.awake!.i] ?? ''} ${e.awake!.from} → ${e.awake!.to}</div></div>
      <div class="chips" style="justify-content:center">${e.ups.map((v, i) => (v > 0 ? `<span class="chip good">${names[i]} +${v}</span>` : '')).join('')}</div>
      <div class="foot"><button class="btn" data-act="weekReportAll">週の報告を見る</button><button class="btn primary" data-act="reportDone">閉じる</button></div>`);
    S.ui.lastRep = rep; return;
  }
  const rows = rep.slice(0, 30).map((e) => { const p = G0.squad.find((x) => x.id === e.pid); if (!p) return ''; const names = statNames(p);
    return `<tr class="click" data-act="player" data-arg="${p.id}"><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b></td><td class="small">${e.awake ? '<span class="chip acc">覚醒</span> ' : ''}${e.ups.map((v, i) => (v >= 2 ? `<span class="up2">${names[i]}+${v}</span>` : v === 1 ? `<span class="muted">${names[i]}+1</span>` : v < 0 ? `<span class="bad">${names[i]}${v}</span>` : '')).filter(Boolean).join(' ')}</td><td class="small">${e.newSp ? `<span class="chip good">「${esc(e.newSp)}」が身についた</span>` : ''}${e.cured ? `<span class="chip">「${esc(e.cured)}」を克服</span>` : ''}${e.aptUp ? `<span class="chip">${e.aptUp}の適性アップ</span>` : ''}${e.injNew ? `<span class="chip bad">ケガ（${p.inj}週）</span>` : ''}</td></tr>`; }).join('');
  modal(`<h2>成長の報告</h2><div class="muted small">+2以上伸びた能力は緑で光る。</div><div class="tbl-wrap"><table class="tbl"><tbody>${rows || '<tr><td class="muted">変化はなかった</td></tr>'}</tbody></table></div><div class="foot"><button class="btn primary" data-act="reportDone">閉じる</button></div>`, 'wide');
}
ACT.weekReportAll = () => showReport(S.ui.lastRep ?? [], false, S.ui.afterReport ?? (() => undefined));
ACT.reportDone = () => { closeModal(); const f = S.ui.afterReport; S.ui.afterReport = null; f?.(); };

/* ---------- 選手 ---------- */
ACT.player = (id) => playerModal(+id);
export function playerModal(pid: number) {
  const G0 = g(); const mine = G0.squad.find((x) => x.id === pid) ?? G0.youth.find((x) => x.id === pid);
  if (mine) return ownPlayer(mine);
  const w = playerIndex(G0).get(pid); if (!w) { toast('見つからない', 'この選手は、もういない'); return; }
  otherPlayer(w);
}
function abBlock(p: Player, a: number[]) {
  const names = statNames(p); const ord = p.pos === 'GK' ? ORDER_K : ORDER_F;
  return `<div class="stack">${ord.map((i) => `<div class="statbar"><span>${names[i]}</span><div class="bar ab-bar"><i class="${colorOf(a[i])}" style="width:${a[i]}%"></i></div><span class="val v ${colorOf(a[i])}">${Math.floor(a[i])}</span></div>`).join('')}<div class="muted" style="font-size:11px">色：〜69 灰・70〜79 銅・80〜89 銀・90〜99 金</div></div>`;
}
function aptBlock(p: Player) { return `<div class="apt">${POS.map((q) => `<div class="a${p.apt[q]}" title="${POS_NOTE[q]}">${q}<b>${APT[p.apt[q]]}</b></div>`).join('')}</div>`; }
function spBlock(p: Player) {
  return `<div class="stack" style="gap:4px">${p.sp.map((s) => `<div style="font-size:12px"><span class="chip good">${esc(s)}</span> <span class="muted">${esc(SP_MAP[s]?.desc ?? '')}</span></div>`).join('')}${p.bad.map((s) => `<div style="font-size:12px"><span class="chip bad">${esc(s)}</span> <span class="muted">${esc(SP_MAP[s]?.desc ?? '')}</span></div>`).join('')}${!p.sp.length && !p.bad.length ? '<div class="muted small">特殊能力はまだない</div>' : ''}</div>`;
}
function ownPlayer(p: Player) {
  const G0 = g(); const o = ovr(p); const youth = p.grade != null;
  const hist = [...p.hist.map((h) => ({ label: `${h.y}年`, y: h.ovr })), { label: 'いま', y: o }];
  const fit = tacticFit(p, G0.gm.tac.style);
  const rn = G0.owner.renew[p.id]; const off = renewalOffer(p);
  const dec = G0.week >= 44;
  const names = statNames(p);
  modal(`<div class="pcard-top"><div><div class="big-ovr">${youth ? '?' : o}</div><div class="muted" style="font-size:11px;text-align:center">総合力</div></div>
    <div><div class="row">${posTag(p.pos)}<h2>${esc(p.name)}</h2><span class="num muted">${p.num ? '#' + p.num : ''}</span>${p.fav ? '★' : ''}</div>
      <div class="muted" style="font-size:13px">${p.age}歳・${p.height}cm・利き足 ${p.foot}・${esc(p.pref)}出身・${esc(p.origin)}${youth ? `・ユース${p.grade}年` : ''}</div>
      <div class="row" style="margin-top:4px">${potHtml(G0, p)}<span class="small muted">「${esc(potWord(p))}」</span>${p.gType ? `<span class="chip">成長タイプ：${esc(p.gType)}</span>` : ''}</div></div>
    <button class="btn ghost small" data-act="closeModal">閉じる</button></div>
  ${youth ? '<div class="alert info"><span>ユースの子の数字は、春の昇格会議まで見えない。</span></div>' : `<div class="grid g2"><div class="stack"><h3>能力</h3>${abBlock(p, p.a)}<h3>ポジションの適性</h3>${aptBlock(p)}</div>
  <div class="stack"><div class="kv"><dt>調子・体力</dt><dd>${condArrow(p.cond)} ${condWord(p.cond)}・${Math.round(100 - p.fat)}</dd><dt>年俸</dt><dd>${yen(p.salary)}</dd><dt>契約</dt><dd>のこり${p.contract}年</dd><dt>相場</dt><dd>${yen(marketValue(p, myTier(G0)))}</dd>
    <dt>今シーズン</dt><dd>${p.seasonApps}試合 ${p.seasonGoals}点 ${p.seasonAst ?? 0}A${p.seasonRtN ? `・平均 ${avgRt(p).toFixed(2)}` : ''}</dd><dt>このクラブで</dt><dd>${p.capps ?? 0}試合 ${p.cgoals ?? 0}点</dd><dt>通算（入団前も）</dt><dd>${p.apps}試合 ${p.goals}点</dd>
    <dt>信頼・愛着</dt><dd>${'★'.repeat(trustStars(p))}・${'♥'.repeat(loveHearts(p))}</dd><dt>戦い方との相性</dt><dd>${fit > 0 ? '◎ 合う' : fit < 0 ? '△ 合わない' : '○ ふつう'}</dd></div>
    <h3>特殊能力</h3>${spBlock(p)}
    ${(p.honors ?? []).length ? `<h3>表彰歴</h3><div class="small">${p.honors!.map((h) => `${h.y}年目 ${h.tier}部 ${esc(h.title)}（${esc(h.club)}）`).join('<br>')}</div>` : ''}
    ${(p.potLog ?? []).length ? `<h3>伸びしろの見立て</h3><div class="small">${p.potLog!.map((x) => `${x.y}年目 ${x.arrow}（${esc(x.why)}）`).join('<br>')}</div>` : ''}</div></div>
  <div><h3>総合力の移り変わり</h3>${lineChart('pl' + p.id, hist, { h: 120, aria: '総合力の移り変わり' })}</div>
  <section class="stack"><h3>マネジメント</h3>
    <div class="row"><label>個別練習</label><select class="input" style="width:auto" data-change="tf" data-arg="${p.id}"><option value="-1">全体練習に合わせる</option>${names.map((n, i) => `<option value="${i}" ${p.tf === i ? 'selected' : ''}>${n}を重点的に</option>`).join('')}</select>
      <button class="btn small ${p.fav ? 'sel' : ''}" data-act="fav" data-arg="${p.id}">${p.fav ? 'お気に入り ★' : 'お気に入りにする'}</button>
      <button class="btn small ${p.listed ? 'sel' : ''}" data-act="listP" data-arg="${p.id}">${p.listed ? '売りに出し中' : '売りに出す'}</button>
      <button class="btn small danger" data-act="releaseAsk" data-arg="${p.id}">契約を切る（${yen(releaseCost(p))}）</button></div>
    ${dec && p.contract <= 1 ? `<div class="alert"><span>契約が今年で切れる。更新の案：${off.years}年・年俸 ${yen(off.salary)}${rn ? `（いまの決定：${rn.no ? '更新しない' : `${rn.years}年で更新`}）` : '（決めなければ、この案で更新する）'}</span><span class="row">${[1, 2, 3, 4].map((y) => `<button class="btn small ${rn && !rn.no && rn.years === y ? 'sel' : ''}" data-act="renew" data-arg="${p.id}:${y}">${y}年</button>`).join('')}<button class="btn small ${rn?.no ? 'sel' : ''}" data-act="renew" data-arg="${p.id}:0">更新しない</button></span></div>` : p.contract <= 1 ? '<div class="muted small">契約は今年で切れる。12月に更新するか決める。</div>' : ''}
  </section>`}`, 'wide');
}
ACT.fav = (id) => { const p = g().squad.find((x) => x.id === +id); if (p) { p.fav = !p.fav; save(); ownPlayer(p); render(); } };
ACT.listP = (id) => { const p = g().squad.find((x) => x.id === +id)!; listPlayer(g(), p.id, !p.listed); save(); ownPlayer(p); render(); };
ACT.renew = (v) => { const [id, y] = v.split(':').map(Number); setRenew(g(), id, y || 1, y === 0); save(); ownPlayer(g().squad.find((x) => x.id === id)!); render(); };
CHANGE.tf = CHANGE.tf ?? ((v, id) => { const p = g().squad.find((x) => x.id === +id); if (p) { p.tf = +v >= 0 ? +v : undefined; save(); } });
function otherPlayer(w: NonNullable<ReturnType<ReturnType<typeof playerIndex>['get']>>) {
  const G0 = g(); const p = w.p; const k = G0.owner.mk.known[p.id]; const full = !!k?.full;
  const where = w.club ? `${w.club.tier}部 ${esc(w.club.name)}` : w.kind === 'free' ? 'フリー' : esc(k?.club ?? 'アマチュア');
  const fee = w.kind === 'pro' ? valueOf(w) : w.kind === 'free' ? 0 : k?.fee ?? 0;
  const sc = w.club ? sellChance(w.club, p) : 1; const jc = w.kind === 'ama' ? 1 : joinChance(fromTierOf(w), myTier(G0), 0);
  const blocked = isBlocked(G0, p.id);
  const canNego = w.kind === 'ama' ? true : marketOpen(G0) && !blocked;
  modal(`<div class="pcard-top"><div><div class="big-ovr">${full ? Math.round(k!.ovr) : '<span class="fog" style="font-size:28px">' + ovrRange(ovr(p)) + '</span>'}</div><div class="muted" style="font-size:11px;text-align:center">総合力${full && k!.season < G0.season ? '（去年の情報）' : ''}</div></div>
    <div><div class="row">${posTag(p.pos)}<h2>${esc(p.name)}</h2></div><div class="muted" style="font-size:13px">${p.age}歳・${p.height}cm・${esc(p.pref)}出身・${where}</div>
      <div class="row" style="margin-top:4px">${full ? potHtml(G0, p, Math.max(0.2, ...G0.owner.scouts.map((s) => s.skill))) : '<span class="fog">潜在 ？</span>'}${shortList(G0).includes(p.id) ? '<span class="chip acc">候補</span>' : ''}</div></div>
    <button class="btn ghost small" data-act="closeModal">閉じる</button></div>
  ${full ? `<div class="grid g2"><div class="stack"><h3>能力（スカウトが調べたとき）</h3>${abBlock(p, k!.a ?? p.a)}<h3>ポジションの適性</h3>${aptBlock(p)}</div><div class="stack"><h3>スカウトのひとこと</h3><div class="result-msg">${esc(k!.note ?? '')}${k!.scout ? `（${esc(k!.scout)}）` : ''}</div><h3>特殊能力</h3>${spBlock(p)}</div></div>`
    : `<div class="alert info"><span>この選手は、まだスカウトが調べていない。わかるのは名前・ポジション・年齢と、総合力のおおよそだけ。</span><button class="btn small" data-act="ask" data-arg="${p.id}">${(G0.owner.mk.ask ?? []).includes(p.id) ? '調べるのをやめる' : 'スカウトに調べてもらう'}</button></div>`}
  <div class="kv"><dt>移籍金の相場</dt><dd>${yen(fee)}</dd><dt>給料の目安</dt><dd>${yen(Math.round(p.salary))}/年</dd>${w.club ? `<dt>相手が売ってくれる見こみ</dt><dd>${chanceWord(sc)}</dd>` : ''}<dt>本人が来てくれる見こみ</dt><dd>${chanceWord(jc)}</dd></div>
  <div class="foot">${full ? `<button class="btn" data-act="short" data-arg="${p.id}">${shortList(G0).includes(p.id) ? '候補から外す' : '候補リストに入れる'}</button>` : ''}${full ? `<button class="btn ghost" data-act="forget" data-arg="${p.id}">報告から消す</button>` : ''}
    ${w.kind === 'ama' ? `<button class="btn primary" data-act="signAma" data-arg="${p.id}">契約する（契約金 ${yen(fee)}）</button>` : `<button class="btn primary" ${canNego ? '' : 'disabled'} data-act="nego" data-arg="${p.id}">${blocked ? 'この期間はもう申し込めない' : marketOpen(G0) ? '交渉する' : '移籍の期間に交渉できる'}</button>`}</div>`, 'wide');
}
ACT.signAma = (id) => { const r = new Rng(g().rng); const e = bid(g(), +id, 0, r); g().rng = r.s; if (e) toast('契約できない', e, 'bad'); else { toast('契約した', 'トップに入った', 'good'); closeModal(); } save(); render(); };

/* ---------- 交渉 ---------- */
export function openNego(pid: number) {
  const n = startNego(g(), pid); if (typeof n === 'string') { toast('交渉できない', n, 'bad'); return; }
  S.ui.nego = n; S.ui.negoBase = { fee: n.fee, sal: n.salary }; negoModal();
}
function negoModal() {
  const n: Nego = S.ui.nego; const w = playerIndex(g()).get(n.pid); const p = w?.p;
  const base = S.ui.negoBase as { fee: number; sal: number };
  const log = n.log.map((l) => `<div class="fe ${l.me ? 'chance me' : 'talk'}"><span class="m">${l.me ? 'GM' : ''}</span><span class="t">${esc(l.t)}</span></div>`).join('');
  let ctl = '';
  if (!n.end) {
    if (n.side === 'club') ctl = `<h3>移籍金</h3><div class="tabs">${FEE_STEPS.map((m) => { const v = Math.round(base.fee * m / 100) * 100; return `<button class="tab ${n.fee === v ? 'on' : ''}" data-act="ngFee" data-arg="${v}">${yen(v)}（${m === 1 ? '相場' : m < 1 ? '安め' : '高め'}）</button>`; }).join('')}${n.ask ? `<button class="tab ${n.fee === n.ask ? 'on' : ''}" data-act="ngFee" data-arg="${n.ask}">相手の言い値 ${yen(n.ask)}</button>` : ''}</div>`;
    else ctl = `<h3>給料（1年）</h3><div class="tabs">${SAL_STEPS.map((m) => { const v = Math.round(base.sal * m / 10) * 10; return `<button class="tab ${n.salary === v ? 'on' : ''}" data-act="ngSal" data-arg="${v}">${yen(v)}</button>`; }).join('')}${n.sAsk ? `<button class="tab ${n.salary === n.sAsk ? 'on' : ''}" data-act="ngSal" data-arg="${n.sAsk}">本人の希望 ${yen(n.sAsk)}</button>` : ''}</div>
      <h3>契約の年数</h3><div class="tabs">${[1, 2, 3, 4].map((y) => `<button class="tab ${n.years === y ? 'on' : ''}" data-act="ngYears" data-arg="${y}">${y}年</button>`).join('')}</div>`;
  }
  modalKeep(`<h2>${p ? esc(p.name) : ''}との交渉</h2><div class="muted small">${n.side === 'club' ? '① 相手のクラブと移籍金' : '② 選手本人と給料・年数'}・3往復まで。決裂すると、この移籍の期間はもう申し込めない。お金 ${yen(g().owner.money)}</div>
    <div class="feed" style="height:220px">${log}</div>${ctl}
    <div class="foot">${n.end ? `<span class="${n.end === 'ok' ? 'good' : 'bad'}">${n.end === 'ok' ? '獲得が決まった！' : '交渉はまとまらなかった'}</span><button class="btn primary" data-act="ngClose">閉じる</button>` : `<button class="btn" data-act="ngClose">やめる</button><button class="btn primary" data-act="ngGo">この条件で出す</button>`}</div>`, 'wide', false);
  const f = document.querySelector('#modal .feed'); if (f) f.scrollTop = f.scrollHeight;
}
ACT.ngFee = (v) => { S.ui.nego.fee = +v; negoModal(); };
ACT.ngSal = (v) => { S.ui.nego.salary = +v; negoModal(); };
ACT.ngYears = (v) => { S.ui.nego.years = +v; negoModal(); };
ACT.ngGo = () => { const r = new Rng(g().rng); const e = negoTurn(g(), S.ui.nego, r); g().rng = r.s; if (e) toast('出せない', e, 'bad'); if (S.ui.nego.end === 'ok') { toast('獲得', 'トップに入った', 'good'); } save(); negoModal(); render(); };
ACT.ngClose = () => { S.ui.nego = null; S.ui.lockModal = false; closeModal(); render(); };
export { DIFFS, evalWord, fmt, canSwapOut, swapReg, clubById, ME };
