/* PC版のまとめ役：画面の枠・メニュー・週の進め方・セーブ */
import { S, G, ACT, CHANGE, $, esc, yen, fmt, moneyCls, toast, modal, closeModal, modalOpen, bindEvents } from './util';
import { playWeek, myTier, myRank, hasMyMatch, eventOf, ME, standings, type GameState, type PlayResult } from '../core/game';
import { monthOf, weekOfMonth, isWindow, CUP_ROUND_NAMES, AWARD_WEEK } from '../core/calendar';
import { unread } from '../core/meeting';
import { DIFFS } from '../core/gm';
import { saveTo, loadFrom, slotKey, safeStorage, listSlots, removeSave } from '../core/save';
import { emblemSVG } from '../ui/emblem';
import { mergeReports } from '../core/growth';
import { VIEWS } from './views';
import { showBlocker, blockerOf, showReport } from './modals';
import { playMatch } from './matchplay';
import { titleHTML } from './newgame';
import type { MatchView, ReportEntry } from '../core/types';

const NAV: [string, string][] = [['home', 'ホーム'], ['schedule', '日程と結果'], ['table', '順位表・天皇杯'], ['-', ''], ['squad', 'トップチーム'], ['tactics', '戦術'], ['training', '練習'], ['youth', 'ユース'], ['-', ''],
  ['transfer', '移籍市場'], ['scout', 'スカウト'], ['staff', 'スタッフ'], ['facilities', '施設'], ['finance', '財務'], ['-', ''], ['inbox', 'メッセージ'], ['achievements', '実績・ミッション'], ['history', 'クラブ史'], ['system', 'セーブ・設定']];

export function save(silent = true) {
  if (!S.G) return;
  const ok = saveTo(S.kv, slotKey(S.slot), S.G);
  if (!ok && !silent) toast('保存できませんでした', 'ブラウザの保存領域が使えません。「セーブ・設定」からセーブコードを書き出してください', 'bad');
  if (ok && !silent) toast('保存しました', `スロット${S.slot}`, 'good');
}
export function load(n: number): boolean {
  const g = loadFrom(S.kv, slotKey(n)); if (!g || !g.gm) return false;
  S.G = g; S.slot = n; S.view = 'home'; return true;
}
export const slots = () => listSlots(S.kv).filter((s) => s.key !== 'sodate-club:auto');
export const delSlot = (n: number) => removeSave(S.kv, slotKey(n));

export function render() {
  const root = $('#app');
  if (!S.G) { root.innerHTML = titleHTML(); return; }
  const g = G(); const tier = myTier(g); const row = g.leagues[tier].table[ME];
  const trust = Math.round(g.mgrEval ?? 60); const tc = trust >= 60 ? 'var(--good)' : trust >= 30 ? 'var(--warn)' : 'var(--bad)';
  const n = unread(g); const ev = eventOf(g);
  const block = blockerOf(g);
  const label = g.gm.over ? '結果を見る' : block ? BLOCK_LABEL[block] : hasMyMatch(g) ? '試合へ' : '次の週へ';
  const date = `${g.season}年目 ${monthOf(g.week)}月 第${weekOfMonth(g.week)}週`;
  const evText = ev.kind === 'league' ? `リーグ第${ev.round}節` : ev.kind === 'cup' ? `天皇杯 ${CUP_ROUND_NAMES[ev.round]}` : ev.kind === 'off' ? 'オフ' : ev.kind === 'camp' ? '春のキャンプ' : ev.kind === 'promo' ? '昇格会議' : ev.kind === 'dec' ? '年末' : '試合なし';
  const badges: Record<string, number> = { inbox: n, transfer: g.pending.length };
  const nav = NAV.map(([k, t]) => (k === '-' ? '<div class="sep"></div>' : `<button class="${S.view === k ? 'on' : ''}" data-act="nav" data-arg="${k}">${t}${badges[k] ? `<span class="badge">${badges[k]}</span>` : ''}</button>`)).join('');
  const pl = row.w + row.d + row.l;
  root.innerHTML = `<div class="app">
    <header class="hdr">
      <div class="club"><span class="emb">${emblemSVG(g.club.emblem)}</span><div><div class="cname">${esc(g.club.name)}</div><div class="csub">${esc(g.club.city)}・${tier}部・${DIFFS[g.gm.diff].n}</div></div></div>
      <div class="kpis">
        <div class="kpi"><span class="k">日付</span><span class="v">${date} <span class="muted" style="font-size:13px">${evText}</span></span></div>
        <div class="kpi"><span class="k">お金</span><span class="v ${moneyCls(g.owner.money)}">${yen(g.owner.money)}</span></div>
        ${g.owner.debt ? `<div class="kpi"><span class="k">借金</span><span class="v bad">${yen(g.owner.debt)}</span></div>` : ''}
        <div class="kpi"><span class="k">人気</span><span class="v">${Math.round(g.owner.pop)}</span></div>
        <div class="kpi"><span class="k">順位</span><span class="v">${pl ? myRank(g) + '<span class="muted" style="font-size:13px">位 / 勝点' + (row.w * 3 + row.d) + '</span>' : '<span class="muted" style="font-size:14px">開幕前</span>'}</span></div>
        <div class="kpi" title="オーナーの信頼。0になると解任される（イージーをのぞく）"><span class="k">オーナーの信頼 ${trust}</span><div class="trustbar"><i style="width:${trust}%;background:${tc}"></i></div></div>
        ${isWindow(g.week) ? '<span class="chip acc">移籍の期間</span>' : ''}
      </div>
      <button class="btn" data-act="nav" data-arg="inbox">メッセージ${n ? `<span class="badge">${n}</span>` : ''}</button>
      <button class="btn" data-act="skip" title="次に決めることがあるところまで、試合を見ずに進める">まとめて進む</button>
      <button class="btn primary next-btn" data-act="next">${label} <span class="wk">▶</span></button>
    </header>
    <nav class="nav" aria-label="メニュー">${nav}</nav>
    <main class="main" id="main">${(VIEWS[S.view] ?? VIEWS.home)()}</main>
  </div>`;
}
const BLOCK_LABEL: Record<string, string> = { sponsor: 'スポンサーを選ぶ', event: '出来事に答える', cere: '表彰式を見る', meet: '会議に出る', promo: '昇格会議に出る', reg: '選手登録を決める', over: '結果を見る' };

/* ---------- 週を進める ---------- */
export function nextWeek() {
  const g = G();
  const b = blockerOf(g); if (b) { showBlocker(b); return; }
  const res = playWeek(g); save();
  S.ui.lastRes = { report: res.report, news: res.news, season: g.season };
  const done = () => { afterWeek(res); };
  if (res.match) playMatch(res.match, res, done); else done();
}
function afterWeek(res: PlayResult) {
  render();
  for (const t of res.toasts) toast(t.title, t.text, t.kind);
  const awake = res.report.filter((e) => e.awake);
  if (awake.length) { showReport(res.report, true, () => chain()); return; }
  chain();
}
/** 決めることがあれば、順に出す */
export function chain() { const b = blockerOf(G()); if (b && !modalOpen()) showBlocker(b); }
/** 次に決めることまで、試合を見ずに進める（最大8週） */
export function skipWeeks() {
  const g = G(); if (blockerOf(g)) { showBlocker(blockerOf(g)!); return; }
  const results: { m: MatchView; title: string }[] = []; const reps: ReportEntry[] = []; let toasts: PlayResult['toasts'] = []; let n = 0;
  while (n < 8) {
    const res = playWeek(g); n++;
    if (res.match) results.push({ m: res.match, title: res.match.title });
    reps.push(...res.report); toasts = toasts.concat(res.toasts);
    if (blockerOf(g) || res.report.some((e) => e.awake) || res.seasonEnd || g.pending.length || g.week === AWARD_WEEK) break;
  }
  save(); render();
  for (const t of toasts.slice(-6)) toast(t.title, t.text, t.kind);
  const lines = results.map(({ m }) => { const my = m.home.me ? m.score[0] : m.score[1], op = m.home.me ? m.score[1] : m.score[0]; const opp = m.home.me ? m.away.name : m.home.name; const r = m.pk ? (m.home.me ? m.pk[0] > m.pk[1] : m.pk[1] > m.pk[0]) ? 'W' : 'L' : my > op ? 'W' : my < op ? 'L' : 'D';
    return `<div class="row between"><span><span class="form-chip ${r}">${r === 'W' ? '勝' : r === 'L' ? '敗' : '分'}</span> ${esc(m.title)} 対 ${esc(opp)}</span><b class="num" style="font-size:16px">${my} - ${op}${m.pk ? `（PK ${m.home.me ? m.pk[0] : m.pk[1]}-${m.home.me ? m.pk[1] : m.pk[0]}）` : ''}</b></div>`; }).join('');
  const merged = mergeReports(reps);
  S.ui.lastRes = { report: merged, news: [], season: g.season };
  modal(`<h2>${n}週すすめた</h2>${lines ? `<div class="stack">${lines}</div>` : '<div class="muted">この間、自分のクラブの試合はなかった。</div>'}
    <div class="foot"><button class="btn" data-act="weekReport">成長の報告を見る</button><button class="btn primary" data-act="closeChain">閉じる</button></div>`);
}
ACT.next = () => { if (G().gm.over) { showBlocker('over'); return; } nextWeek(); };
ACT.skip = () => { if (G().gm.over) { showBlocker('over'); return; } skipWeeks(); };
ACT.closeChain = () => { closeModal(); chain(); };
ACT.weekReport = () => { const r = S.ui.lastRes; showReport(r?.report ?? [], false, () => chain()); };
ACT.nav = (v) => { S.view = v; S.ui.sel = null; render(); window.scrollTo(0, 0); };
ACT.saveNow = () => save(false);

export function boot() {
  S.kv = safeStorage();
  bindEvents();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOpen() && !S.ui.lockModal) closeModal();
    if ((e.key === 'Enter' || e.key === ' ') && e.ctrlKey && S.G && !modalOpen()) { e.preventDefault(); ACT.next('', document.body, e); }
  });
  render();
}
export { standings, fmt, CHANGE };
export type { GameState };
