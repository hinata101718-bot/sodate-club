/* 画面のまとめ役：タブ・ホーム・選手の一覧・順位・設定とセーブ */
import { advanceToDecision, advanceWeek, answerOffer, newGame, standings, myTier, myRank, eventOf, currentGoal, cupAlive, clubName, clubById, dateText, cupResultText, ME, type GameState } from '../core/game';
import { CUP_ROUND_NAMES, monthOf, isWindow } from '../core/calendar';
import { openNewClub } from './newclub';
import { youthHTML, bindYouth } from './youthview';
import { peopleHTML, facHTML, moneyHTML, transferHTML, bindOwner, setTrView } from './ownerview';
import { listPlayer, renewalOffer, setRenew } from '../core/owner';
import { ovr } from '../core/player';
import { STYLES } from '../core/constants';
import { obeyWord } from '../core/staff';
import { mgrShort, type Policy } from '../core/match';
import { AUTO_KEY, listSlots, loadFrom, removeSave, safeStorage, saveTo, type KV } from '../core/save';
import type { Player } from '../core/types';
import { $, $$, closeSheet, esc, posTag, sheet, toast, val, yen } from './dom';
import { applyClubColor, applyThemeMode } from './theme';
import { emblemSVG } from './emblem';
import { openMatch } from './matchview';
import { openReport } from './report';
import { openPlayer } from './playerview';
import { mv } from './marketview';
import { marketValue } from '../core/market';
import { setSound, soundOn, sfx } from './sound';
import { buildLabel } from './update';

export const app = { G: null as unknown as GameState, kv: null as unknown as KV, tab: 'home' };
const PREFS_KEY = 'sodate-club:prefs';
interface UiPrefs { theme: string; sound: boolean; }
function readPrefs(): UiPrefs { try { return { theme: 'auto', sound: false, ...JSON.parse(app.kv.getItem(PREFS_KEY) || '{}') }; } catch { return { theme: 'auto', sound: false }; } }
function writePrefs(p: UiPrefs) { try { app.kv.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* なにもしない */ } }

export function autosave() { if (!saveTo(app.kv, AUTO_KEY, app.G)) toast('保存できませんでした（ブラウザの保存領域がいっぱいかもしれません）'); }
const find = (id: number) => app.G.squad.find((p) => p.id === id);

export function boot() {
  app.kv = safeStorage();
  const pr = readPrefs(); applyThemeMode(pr.theme); setSound(pr.sound);
  const g = loadFrom(app.kv, AUTO_KEY);
  if (g) app.G = g;
  $$<HTMLButtonElement>('.navbtn').forEach((b) => { b.innerHTML = ICON[b.dataset.tab === 'team' ? 'teamNav' : b.dataset.tab!] + b.innerHTML; b.addEventListener('click', () => { sfx('tap'); setTab(b.dataset.tab!); }); });
  $('#menuBtn').addEventListener('click', () => { sfx('tap'); setTab('settings'); });
  if (g) render(); else startNew(false);
}
/* 下のメニューは4つ（ホーム・チーム・経営・リーグ）。チーム・経営・リーグは、押すと大きなアイコンが並ぶ（問82：サカつくを手本に） */
const GROUP_OF: Record<string, string> = { home: 'home', team: 'team', squad: 'team', youth: 'team', tr: 'team', biz: 'biz', fac: 'biz', people: 'biz', money: 'biz', league: 'league', table: 'league', cup: 'league', rec: 'league' };
const PAGE_TITLE: Record<string, string> = { squad: 'トップチーム', youth: 'ユース', tr: '移籍', fac: '施設', people: 'スタッフ', money: 'お金', table: '順位表', cup: '勝ち抜きの大会', rec: 'リーグの歴史' };
const GROUP_NAME: Record<string, string> = { team: 'チーム', biz: '経営', league: 'リーグ' };
export function setTab(t: string) {
  app.tab = t;
  $$('.navbtn').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === (GROUP_OF[t] ?? t) ? 'page' : 'false'));
  render(); window.scrollTo(0, 0);
}
export function render() {
  const G = app.G;
  applyClubColor(G.club.color);
  $('#crest').innerHTML = emblemSVG(G.club.emblem);
  $('#clubName').textContent = G.club.name;
  const t0 = G.leagues[myTier(G)].table[ME]; const pl = t0.w + t0.d + t0.l;
  $('#clubSub').textContent = `${G.season}年目${monthOf(G.week)}月・${myTier(G)}部${pl ? `${myRank(G)}位` : ''}・お金 ${yen(G.owner.money)}`;
  const v = $('#view');
  const views: Record<string, () => string> = { home: homeHTML, team: () => hubHTML('team'), biz: () => hubHTML('biz'), league: () => hubHTML('league'), squad: squadHTML, tr: () => transferHTML(G), youth: () => youthHTML(G, promoSel()), people: () => peopleHTML(G), fac: () => facHTML(G), money: () => moneyHTML(G), table: tableHTML, cup: () => cupHTML(G), rec: () => recordHTML(G), settings: settingsHTML };
  const grp = GROUP_OF[app.tab];
  const crumb = PAGE_TITLE[app.tab] && grp ? `<div class="crumb"><button class="btn small ghost" data-go="${grp}">‹ ${GROUP_NAME[grp]}</button><h2>${PAGE_TITLE[app.tab]}</h2></div>` : '';
  v.innerHTML = crumb + (views[app.tab] || homeHTML)();
  bindView(v);
  bindOwner(G, v, (msg) => { if (msg) toast(msg); autosave(); render(); }, (id) => { const c = G.owner.cands.find((x) => x.id === id); if (c) openPlayer(c.p, { coachName: c.scout ? 'スカウト' : 'コーチ', coachSkill: 0.5, back: render }); });
  $$<HTMLElement>('[data-go-cond]', v).forEach((b) => b.addEventListener('click', () => { mv.sub = 'cond'; setTrView('scout'); setTab('tr'); }));
  if (app.tab === 'youth') bindYouth(G, v, promoSel(), render, (msgs) => { selCache = null; autosave(); setTab('home'); msgs.forEach((m) => void m); });
}
let selCache: { key: string; set: Set<number> } | null = null;
function promoSel(): Set<number> {
  const G = app.G; const key = `${G.season}-${G.week}`;
  if (!G.promo?.open) { selCache = null; return new Set(); }
  if (!selCache || selCache.key !== key) selCache = { key, set: new Set(G.promo.rec) };
  return selCache.set;
}

function nextHTML(G: GameState): string {
  const e = eventOf(G);
  const oppLine = (opp: number, home: boolean | null, extra = '') => { const c = clubById(G, opp); return `<div class="next-match">${home == null ? '<span class="tag">中立</span>' : `<span class="tag ${home ? '' : 'away'}">${home ? 'ホーム' : 'アウェイ'}</span>`}<span class="grow">${esc(c.name)}</span><span class="muted small">${c.tier}部${oppRank(c.id, c.tier)} ・ ${esc(c.mgr.style)}</span></div>${extra}`; };
  /* 問85：順位表のボタンのかわりに、相手の順位を出す */
  const oppRank = (id: number, tier: number) => { const rows = standings(G, tier); const r = rows[0] && rows[0].w + rows[0].d + rows[0].l ? rows.findIndex((x) => x.id === id) + 1 : 0; return r ? ` ${r}位` : ''; };
  if (e.kind === 'league') return `<h2>今週の試合 ・ リーグ第${e.round}節</h2>${oppLine(e.opp, e.home)}`;
  if (e.kind === 'cup') {
    const nm = CUP_ROUND_NAMES[e.round];
    if (!cupAlive(G)) return `<h2>今週 ・ 勝ち抜きの大会 ${nm}</h2><div class="muted">大会はもう負けている。今週は試合がない。</div>`;
    if (e.round === 0 && myTier(G) === 1) return `<h2>今週 ・ 勝ち抜きの大会 ${nm}</h2><div class="muted">1部のクラブは、2回戦か3回戦から出る。</div>`;
    if (e.round === 1 && myTier(G) === 1 && (clubById(G, ME).prevRank || 99) <= 8) return `<h2>今週 ・ 勝ち抜きの大会 ${nm}</h2><div class="muted">去年の上位8つは、3回戦から出る。</div>`;
    return `<h2>今週の試合 ・ 勝ち抜きの大会 ${nm}</h2><div class="goal">相手は今週の抽選で決まる</div><div class="muted">引き分けなら、すぐにPK戦。${e.round === 5 ? '決勝は中立の会場。' : ''}</div>`;
  }
  const txt: Record<string, [string, string]> = {
    off: ['1月 ・ オフの休み', 'ケガと疲れが回復する。練習はお休み。'],
    promo: ['2月 ・ 春の昇格会議', 'ユースからトップに上げる子を決める時期。'],
    camp: ['2月 ・ 春のキャンプ', '選手が伸びやすい特別な期間。'],
    rest: ['今週は試合がない', '練習で少しずつ伸びる週。'],
    dec: ['12月 ・ 年末', '表彰・契約更新・冬の移籍の期間。'],
  };
  const [h, m] = txt[e.kind];
  return `<h2>今週</h2><div class="goal">${h}</div><div class="muted">${m}</div>`;
}
function homeHTML(): string {
  const G = app.G;
  const rank = myRank(G); const tier = myTier(G);
  const tbl = G.leagues[tier].table[ME];
  const pend = G.pending.map((e, i) => { const p = find(e.pid); if (!p) return ''; return `<div class="item"><span class="grow"><b>${esc(e.club)}</b> から ${esc(p.name)} にオファー（${e.price.toLocaleString()}万円）</span><button class="btn small primary" data-offer="${i}">見る</button></div>`; }).join('');
  const news = (G.news || []).filter(Boolean).map((n) => `<div class="item"><span class="grow">${esc(n)}</span></div>`).join('');
  const walk = G.owner.cands.filter((c) => c.src === 'trial').length + G.owner.trials.filter((p) => p.trialMonths === 0).length;
  const scoutN = Object.values(G.owner.mk.known).filter((k) => k.src === 'scout' && k.season === G.season && k.week === G.week - 1).length;
  const owner = (walk ? `<div class="item"><span class="grow">練習生のことで決めることがある</span><button class="btn small primary" data-go-tr="1">見る</button></div>` : '') + (scoutN ? `<div class="item"><span class="grow">スカウトが${scoutN}人の選手を調べてきた</span><button class="btn small ghost" data-go-tr="1">スカウトの報告を見る</button></div>` : '');
  const promo = G.promo?.open ? `<div class="item"><span class="grow"><b>春の昇格会議</b>：ユースからトップに上げる子を決める（決めずに進むと、コーチのおすすめどおりになる）</span><button class="btn small primary" data-go="youth">決める</button></div>` : '';
  const notes = G.yearNotes?.length && G.week >= 44 ? `<div class="item"><span class="grow">コーチから、選手${G.yearNotes.length}人についてのひとこと</span><button class="btn small ghost" data-act="notes">見る</button></div>` : '';
  const yrep = G.youthLog.length && G.youthLog[G.youthLog.length - 1].season === G.season && G.week >= 8 && G.week % 4 === 1 ? `<div class="item"><span class="grow">ユースの報告会議（${G.youthLog[G.youthLog.length - 1].month}月）</span><button class="btn small ghost" data-go="youth">見る</button></div>` : '';
  const lastRep = G.lastReport && G.lastReport.length ? `<div class="item"><span class="grow">先週の報告：${G.lastReport.filter((r) => r.ups.some((v) => v > 0)).length}人が伸びた</span><button class="btn small ghost" data-act="report">見る</button></div>` : '';
  const lm = G.lastMatch;
  const lastM = lm ? `<div class="item"><span class="grow">前の試合 ${esc(lm.home.name)} ${lm.score[0]}-${lm.score[1]} ${esc(lm.away.name)}${lm.pk ? `（PK ${lm.pk.join('-')}）` : ''}</span><button class="btn small ghost" data-act="replay">見どころ</button></div>` : '';
  const last = G.history[G.history.length - 1];
  return `
  <section class="card"><h2>いまの位置と目標</h2>
    <div class="goal">${tbl.w + tbl.d + tbl.l ? `${tier}部 ${rank}位 <span class="muted small">勝ち点 ${tbl.p}（${tbl.w}勝${tbl.d}分${tbl.l}敗）</span>` : `${tier}部 ・ 開幕前`}</div>
    <div style="margin-top:4px">目標：<b>${esc(currentGoal(G))}</b></div>
    ${G.owner.debt ? `<div class="muted small">借金 ${yen(G.owner.debt)}</div>` : ''}
    ${last ? `<div class="muted small">${last.season}年目は ${last.tier}部 ${last.rank}位${last.promoted ? 'で昇格！' : last.relegated ? 'で降格' : ''}・大会は${esc(last.cup)}</div>` : ''}</section>
  <section class="card">${nextHTML(G)}</section>
  ${pend || promo || owner || notes || yrep || news || lastRep || lastM ? `<section class="card notice"><h2>今週のお知らせ</h2>${promo}${pend}${owner}${notes}${news}${yrep}${lastM}${lastRep}</section>` : ''}
  <div class="btns">
    <button class="btn primary" data-act="week">1週進む</button>
    <button class="btn ghost" data-act="skip">次に決めることまで進む</button>
  </div>
`;
}
/** 監督への方針（問84：トップチームの画面に置く） */
function policyHTML(G: GameState): string {
  return `  <section class="card"><h2>${esc(mgrShort(G.mgr))}への方針（若手の使い方）</h2>
    <div class="seg" role="group" aria-label="若手の使い方">
      ${(['若手多め', 'ふつう', '勝ち優先'] as Policy[]).map((x) => `<button data-pol="${x}" aria-pressed="${G.policy === x}">${x}</button>`).join('')}
    </div>
    <div class="muted" style="margin-top:8px">監督：${esc(G.mgr.name)} ・ ${esc(G.mgr.style)}（${esc(STYLES[G.mgr.style].note)}）・ 並び方 ${G.mgr.forms.join(' / ')}</div>
  </section>`;
}
function squadHTML(): string {
  const G = app.G;
  const order: Record<string, number> = { GK: 0, CB: 1, SB: 2, DM: 3, CM: 4, AM: 5, WG: 6, ST: 7 };
  const list = [...G.squad].sort((a, b) => order[a.pos] - order[b.pos] || ovr(b) - ovr(a));
  return policyHTML(G) + `<section class="card"><h2>${list.length}人</h2><div class="plist">${list.map(plRow).join('')}</div></section>`;
}
/** チーム・経営・リーグの入り口：大きなアイコンと、ひとことの様子だけ（くわしくは押してから：問82のD） */
function hubHTML(g: string): string {
  const G = app.G;
  const t0 = G.leagues[myTier(G)].table[ME]; const pl = t0.w + t0.d + t0.l;
  const offers = G.pending.length; const bids = G.owner.mk.bids.length;
  const tiles: Record<string, [string, string, string, string][]> = {
    team: [
      ['squad', 'トップチーム', `${G.squad.length}人${G.squad.some((p) => p.inj) ? ` ・ ケガ${G.squad.filter((p) => p.inj).length}人` : ''}`, ICON.team],
      ['youth', 'ユース', `${G.youth.length}人${G.promo?.open ? ' ・ 昇格会議' : ''}`, ICON.youth],
      ['tr', '移籍', `${isWindow(G.week) ? '移籍の期間中' : '期間外'}${offers ? ` ・ オファー${offers}件` : ''}${bids ? ` ・ 申し込み中${bids}件` : ` ・ 候補${(G.owner.mk.short ?? []).length}人`}`, ICON.tr],
    ],
    biz: [
      ['fac', '施設', G.owner.build ? '工事中' : '強化できる', ICON.fac],
      ['people', 'スタッフ', `監督・コーチ・スカウト${G.owner.scouts.length}人`, ICON.people],
      ['money', 'お金', yen(G.owner.money), ICON.money],
    ],
    league: [
      ['table', '順位表', `${myTier(G)}部${pl ? ` ${myRank(G)}位` : ' ・ 開幕前'}`, ICON.table],
      ['cup', '勝ち抜きの大会', cupResultText(G), ICON.cup],
      ['rec', 'リーグの歴史', G.history.length ? `${G.history.length}年ぶん` : '1年目が終わるとのる', ICON.rec],
    ],
  };
  return `<div class="hub">${tiles[g].map(([k, l, s, ic]) => `<button class="hubtile" data-go="${k}">${ic}<span class="hl">${l}</span><span class="hs">${esc(s)}</span></button>`).join('')}</div>`;
}
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON: Record<string, string> = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  teamNav: svg('<path d="M7 4l-4 3 2 3 2-1v11h10V9l2 1 2-3-4-3h-3a2 2 0 0 1-4 0z"/>'),
  biz: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2"/><path d="M3 13h18"/>'),
  league: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8 20h8"/>'),
  team: svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 15c3 0 6 2 6 5"/>'),
  youth: svg('<path d="M12 21V11"/><path d="M12 11c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>'),
  tr: svg('<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>'),
  fac: svg('<path d="M3 20h18"/><path d="M5 20V8l7-4 7 4v12"/><rect x="9" y="12" width="6" height="8"/>'),
  people: svg('<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/><path d="M12 14l-1.5 3 1.5 4 1.5-4z"/>'),
  money: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>'),
  table: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>'),
  cup: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M12 13v4"/><path d="M8 20h8"/>'),
  rec: svg('<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h7M9 14h7M9 18h4"/>'),
};
export function plRow(p: Player): string {
  const o = ovr(p);
  return `<button class="pl" data-pid="${p.id}">${posTag(p.pos)}<span style="min-width:0"><span class="pname"><span class="num">${p.num || ''}</span>${esc(p.name)}${p.req ? ' <span class="tag">起用を依頼中</span>' : ''}${p.retiring ? ' <span class="tag bad">今季で引退</span>' : ''}${p.listed ? ' <span class="tag away">売りに出している</span>' : ''}</span><br><span class="pmeta">${p.age}歳 ・ ${p.seasonApps}試合 ${p.seasonGoals}点${p.inj ? ' ・ ケガ（あと' + p.inj + '週）' : ''}${p.cond >= 1 ? ' ・ 好調' : p.cond <= -1 ? ' ・ 不調' : ''}${p.fat >= 40 ? ' ・ 疲れ' : ''}</span></span><span class="ovr">${val(o)}</span></button>`;
}
let tableView = 'mine';
function tableHTML(): string {
  const G = app.G; const tier = myTier(G);
  const views: [string, string][] = [['mine', `${tier}部`], ...[1, 2, 3].filter((t) => t !== tier).map((t) => [`t${t}`, `${t}部`] as [string, string])];
  const seg = `<div class="seg tight" role="group" aria-label="表の切りかえ">${views.map(([k, l]) => `<button data-tv="${k}" aria-pressed="${tableView === k}">${l}</button>`).join('')}</div>`;
  let body = '';
  {
    const t = tableView === 'mine' ? tier : +tableView.slice(1);
    const rows = standings(G, t); const played = rows[0] ? rows[0].w + rows[0].d + rows[0].l : 0;
    body = `<section class="card"><h2>${t}部 ・ ${played}試合まで</h2><div style="overflow-x:auto"><table>
    <thead><tr><th class="l">#</th><th class="l">クラブ</th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>差</th><th>点</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${r.id === ME ? 'me' : ''} ${i < 2 && t > 1 ? 'up' : ''} ${i >= 10 && t < 3 ? 'down' : ''}"><td class="l">${i + 1}</td><td class="l club">${esc(clubName(G, r.id))}</td><td>${r.w + r.d + r.l}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.p}</b></td></tr>`).join('')}
    </tbody></table></div><div class="muted small" style="margin-top:8px">${t > 1 ? '緑の線は昇格（上位2つ）。' : '1位が優勝。'}${t < 3 ? '赤の線は降格（下位2つ）。' : ''}勝ち3点・引き分け1点。並んだら得失点差（取った点−取られた点）で決める。</div></section>`;
  }
  return seg + body;
}
function cupHTML(G: GameState): string {
  const rounds = G.cup.rounds;
  const res = cupResultText(G);
  const head = `<section class="card"><h2>勝ち抜きの大会 ・ ${G.season}年目</h2><div class="muted">全36クラブが出る。1回戦は3部と2部、2回戦から1部の下位4つ、3回戦から1部の上位8つが出てくる。引き分けはすぐにPK戦。</div>
    <div style="margin-top:6px">自分のクラブ：<b>${esc(res)}</b>${G.cup.champion != null ? ` ・ 優勝は ${esc(clubName(G, G.cup.champion))}` : ''}</div></section>`;
  if (!rounds.length) return head + `<section class="card muted">まだ始まっていない。1回戦は ${monthOf(G.sched.cup[0] ?? 13)}月。</section>`;
  return head + [...rounds].map((rd, i) => ({ rd, i })).reverse().map(({ rd, i }) => `<section class="card"><h2>${CUP_ROUND_NAMES[i]}</h2><div class="bracket">${rd.map((t) => `<div class="m ${t.a === ME || t.b === ME ? 'me' : ''}"><span class="${t.w === t.a ? 'w' : ''}">${esc(clubName(G, t.a))}</span><span>${t.s ? t.s.join('-') : ''}${t.pk ? `<br><span class="small">PK ${t.pk.join('-')}</span>` : ''}</span><span class="${t.w === t.b ? 'w' : ''}" style="text-align:right">${esc(clubName(G, t.b))}</span></div>`).join('')}</div></section>`).join('');
}
function recordHTML(G: GameState): string {
  if (!G.history.length) return `<section class="card muted">1年目が終わると、ここに記録がのります。</section>`;
  const done = G.goals.map((g) => `<li>${g.season}年目：${esc(goalText(g.id))}</li>`).join('');
  return `${done ? `<section class="card"><h2>達成した目標</h2><ul style="margin:0;padding-left:1.2em">${done}</ul></section>` : ''}` + [...G.history].reverse().map((h) => `<section class="card"><h2>${h.season}年目</h2>
    <div class="goal">${h.tier}部 ${h.rank}位${h.promoted ? ' ・ 昇格' : h.relegated ? ' ・ 降格' : ''}</div><div class="muted">勝ち抜きの大会：${esc(h.cup)}（優勝 ${esc(h.cupChampion)}）・ 1部の優勝 ${esc(h.champion[1] || '')}</div>
    <h3>年末の表彰</h3><div class="list">${h.awards.map((a) => `<div class="row"><span class="tag ${a.me ? 'gold' : ''}">${a.tier}部</span><span class="grow">${esc(a.title)}：<b>${esc(a.name)}</b> <span class="muted small">${esc(a.club)} ・ ${esc(a.detail)}</span></span></div>`).join('')}</div></section>`).join('');
}
import { GOALS } from '../core/game';
const goalText = (id: string) => GOALS.find((g) => g.id === id)?.text ?? id;
function settingsHTML(): string {
  const slots = listSlots(app.kv); const pr = readPrefs();
  const fmt = (s: string) => { try { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return ''; } };
  return `<section class="card"><h2>セーブ</h2><div class="list">${slots.map((s) => `<div class="slot"><div class="grow"><b>${s.label}</b><div class="muted small">${s.exists ? esc(s.summary) + ' ・ ' + fmt(s.savedAt) : s.broken ? '読めないデータ' : 'まだない'}</div></div>
      ${s.key === AUTO_KEY ? '' : `<button class="btn small ghost" data-save="${s.key}">ここに保存</button>`}${s.exists ? `<button class="btn small primary" data-load="${s.key}">読む</button>` : ''}</div>`).join('')}</div>
    <div class="muted small" style="margin-top:8px">自動セーブは、1週進むたびに保存されます。データはこのブラウザの中にだけあります。</div></section>
  <section class="card"><h2>画面</h2><div class="seg" role="group" aria-label="画面の明るさ">${[['auto', '端末に合わせる'], ['light', '明るい'], ['dark', '暗い']].map(([k, l]) => `<button data-theme-set="${k}" aria-pressed="${pr.theme === k}">${l}</button>`).join('')}</div></section>
  <section class="card"><h2>音</h2><div class="seg" role="group" aria-label="効果音">${[['off', 'オフ'], ['on', 'オン']].map(([k, l]) => `<button data-sound="${k}" aria-pressed="${(pr.sound ? 'on' : 'off') === k}">${l}</button>`).join('')}</div><div class="muted small" style="margin-top:6px">ボタン・ゴール・覚醒などの短い効果音だけです。</div></section>
  <section class="card"><h2>このゲームの版</h2><div class="small">${buildLabel()} に作った版</div><button class="btn small ghost" data-act="reload" style="margin-top:8px">最新の版を読みこみ直す</button><div class="muted small" style="margin-top:6px">セーブはそのまま残ります。</div></section>
  <section class="card"><h2>最初から</h2><div class="confirm" id="resetBox"><button class="btn small danger" data-act="reset">新しいクラブで始める</button></div><div class="muted small" style="margin-top:6px">手動のセーブは消えません。</div></section>`;
}

function bindView(v: HTMLElement) {
  const G = app.G;
  $$<HTMLElement>('[data-act]', v).forEach((b) => b.addEventListener('click', () => act(b.dataset.act!)));
  $$<HTMLElement>('[data-go-tr]', v).forEach((b) => b.addEventListener('click', () => { mv.sub = 'known'; setTrView('scout'); setTab('tr'); }));
  $$<HTMLElement>('[data-go]', v).forEach((b) => b.addEventListener('click', () => setTab(b.dataset.go!)));
  $$<HTMLElement>('[data-tv]', v).forEach((b) => b.addEventListener('click', () => { tableView = b.dataset.tv!; render(); }));
  $$<HTMLElement>('[data-pol]', v).forEach((b) => b.addEventListener('click', () => { G.policy = b.dataset.pol as Policy; sfx('tap'); autosave(); render(); }));
  $$<HTMLElement>('[data-pid]', v).forEach((b) => b.addEventListener('click', () => showPlayer(+b.dataset.pid!, render)));
  $$<HTMLElement>('[data-offer]', v).forEach((b) => b.addEventListener('click', () => openOffer(+b.dataset.offer!)));
  $$<HTMLElement>('[data-save]', v).forEach((b) => b.addEventListener('click', () => { const ok = saveTo(app.kv, b.dataset.save!, app.G); toast(ok ? '保存しました' : '保存できませんでした'); render(); }));
  $$<HTMLElement>('[data-load]', v).forEach((b) => b.addEventListener('click', () => {
    const g = loadFrom(app.kv, b.dataset.load!);
    if (!g) { toast('読めませんでした'); return; }
    app.G = g; autosave(); toast('読みこみました'); setTab('home');
  }));
  $$<HTMLElement>('[data-theme-set]', v).forEach((b) => b.addEventListener('click', () => { const p = readPrefs(); p.theme = b.dataset.themeSet!; writePrefs(p); applyThemeMode(p.theme); render(); }));
  $$<HTMLElement>('[data-sound]', v).forEach((b) => b.addEventListener('click', () => { const p = readPrefs(); p.sound = b.dataset.sound === 'on'; writePrefs(p); setSound(p.sound); sfx('tap'); render(); }));
}
function posCoach(pos: string): { name: string; skill: number } {
  const C = app.G.owner.coaches; const c = pos === 'GK' ? C.gk : ['CB', 'SB', 'DM'].includes(pos) ? C.def : C.off;
  const role = pos === 'GK' ? 'キーパーコーチ' : ['CB', 'SB', 'DM'].includes(pos) ? 'ディフェンスコーチ' : 'オフェンスコーチ';
  return c ? { name: role, skill: c.skill } : { name: '監督', skill: 0.3 };
}
export function showPlayer(id: number, back: () => void) {
  const p = find(id); if (!p) return;
  openPlayer(p, {
    report: (app.G.lastReport || []).find((r) => r.pid === id) || null,
    coachName: posCoach(p.pos).name, coachSkill: posCoach(p.pos).skill, mgrName: mgrShort(app.G.mgr), mgrObeyWord: obeyWord(app.G.mgr),
    onReq: (pl) => { pl.req = !pl.req; autosave(); }, back,
    extraHTML: contractHTML(p),
    bindExtra: (root) => {
      root.querySelector('#pSell')?.addEventListener('click', () => { listPlayer(app.G, p.id, !p.listed); autosave(); showPlayer(id, back); });
      root.querySelectorAll<HTMLElement>('[data-renew]').forEach((b) => b.addEventListener('click', () => { const v = b.dataset.renew!; setRenew(app.G, p.id, v === 'no' ? 1 : +v, v === 'no'); autosave(); showPlayer(id, back); }));
    },
  });
}
function contractHTML(p: Player): string {
  const G = app.G; const d = G.owner.renew[p.id]; const off = renewalOffer(p);
  const renew = p.contract <= 1 && G.week >= 44 ? `<h3>契約更新（今年で切れる）</h3><div class="muted small">更新すると給料は 年${off.salary.toLocaleString()}万円 になる。決めないときは、${off.years}年で更新する。</div>
    <div class="seg" role="group" aria-label="契約の年数" style="margin-top:6px">${[1, 2, 3, 4].map((y) => `<button data-renew="${y}" aria-pressed="${!!d && !d.no && d.years === y}">${y}年</button>`).join('')}<button data-renew="no" aria-pressed="${!!d?.no}">更新しない</button></div>` : p.contract <= 1 ? '<div class="muted small">契約は今年で切れる。12月の契約更新の時期に、更新するかを決める。</div>' : '';
  return `<section class="card"><h2>契約と移籍</h2><div>あと${p.contract}年 ・ 年${p.salary.toLocaleString()}万円</div><div>市場の値段（いま売るとだいたい）：<b>${yen(marketValue(p, myTier(G)))}</b></div>${renew}
    <button class="btn ${p.listed ? 'primary' : 'ghost'} wide" id="pSell" style="margin-top:10px">${p.listed ? '売りに出すのをやめる' : '売りに出す'}</button><div class="muted small" style="margin-top:6px">売りに出すと、移籍の期間に買い手を探す。買い手が見つかると、オファーとして届く。</div></section>`;
}
function afterWeek(res: ReturnType<typeof advanceWeek>) {
  autosave(); render();
  const rep = () => openReport(res.report, find, showPlayer, render);
  if (res.match) openMatch(res.match, app.G.club.color, rep); else rep();
}
function act(a: string) {
  const G = app.G;
  if (a === 'reload') { autosave(); location.reload(); return; }
  if (a === 'week') { sfx('tap'); afterWeek(advanceWeek(G)); }
  if (a === 'skip') {
    sfx('tap');
    const r = advanceToDecision(G); autosave(); render();
    openReport(r.report, find, showPlayer, render, `${r.weeks}週ぶんの報告`);
  }
  if (a === 'notes') {
    sheet(`<div class="bar"><h2>コーチのひとこと（年末）</h2></div><div class="list">${G.yearNotes.map((n) => `<div class="card"><b>${esc(n.name)}</b><div>「${esc(n.text)}」</div></div>`).join('')}</div>`, `<div class="in2 one"><button class="btn primary" id="nClose">もどる</button></div>`);
    $('#nClose').addEventListener('click', () => { closeSheet(); render(); });
  }
  if (a === 'report') openReport(G.lastReport || [], find, showPlayer, render);
  if (a === 'replay' && G.lastMatch) openMatch(G.lastMatch, G.club.color, null);
  if (a === 'reset') {
    const box = $('#resetBox');
    box.innerHTML = `<span class="muted">いまのクラブは自動セーブから消えます（クラブを作り終えたとき）。進みますか？</span><button class="btn small primary" data-act="reset2">進む</button><button class="btn small ghost" data-act="cancel">やめる</button>`;
    $$<HTMLElement>('[data-act]', box).forEach((b) => b.addEventListener('click', () => act(b.dataset.act!)));
  }
  if (a === 'reset2') startNew(true);
  if (a === 'cancel') render();
}
export function startNew(cancelable: boolean) {
  openNewClub((c) => {
    removeSave(app.kv, AUTO_KEY);
    app.G = newGame({ seed: (Date.now() % 1e9) >>> 0, pref: c.pref, name: c.name, color: c.color, emblem: c.emblem });
    autosave(); setTab('home');
  }, cancelable ? () => render() : null);
}
function openOffer(i: number) {
  const G = app.G; const e = G.pending[i]; const p = find(e.pid); if (!p) return;
  sheet(`<div class="bar"><h2>オファーが届いた</h2></div>
    <section class="card"><div><b>${esc(e.club)}</b> が ${esc(p.name)}（${p.age}歳 ・ ${p.pos} ・ 総合力 ${ovr(p)}）を <b>${e.price.toLocaleString()}万円</b> でほしいと言っている。</div>
    <div class="muted" style="margin-top:6px">受けると、選手はクラブを去る。値段の交渉はできない。</div>
    <div class="btns" style="margin-top:12px"><button class="btn primary" id="oYes">受ける</button><button class="btn ghost" id="oNo">断る</button></div></section>`);
  $('#oYes').addEventListener('click', () => { const e2 = answerOffer(G, i, true); autosave(); closeSheet(); render(); toast(e2 ?? `${p.name} が移籍した`); });
  $('#oNo').addEventListener('click', () => { answerOffer(G, i, false); autosave(); closeSheet(); render(); });
}
export { soundOn };
