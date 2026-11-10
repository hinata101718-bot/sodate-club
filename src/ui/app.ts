/* 画面のまとめ役：タブ・ホーム・選手の一覧・順位・設定とセーブ */
import { advanceToDecision, advanceWeek, answerOffer, monthOf, newGame, standings, type GameState } from '../core/game';
import { ovr } from '../core/player';
import { STYLES } from '../core/constants';
import { obeyWord } from '../core/staff';
import { mgrShort, type Policy } from '../core/match';
import { AUTO_KEY, listSlots, loadFrom, removeSave, safeStorage, saveTo, type KV } from '../core/save';
import type { Player } from '../core/types';
import { $, $$, closeSheet, esc, posTag, sheet, toast, val } from './dom';
import { applyClubColor, applyThemeMode } from './theme';
import { emblemSVG } from './emblem';
import { openMatch } from './matchview';
import { openReport } from './report';
import { openPlayer } from './playerview';
import { setSound, soundOn, sfx } from './sound';

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
  app.G = g ?? newGame((Date.now() % 1e9) >>> 0);
  if (!g) autosave();
  $$<HTMLButtonElement>('.navbtn').forEach((b) => b.addEventListener('click', () => { sfx('tap'); setTab(b.dataset.tab!); }));
  $('#menuBtn').addEventListener('click', () => { sfx('tap'); setTab('settings'); });
  render();
}
export function setTab(t: string) {
  app.tab = t;
  $$('.navbtn').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'));
  render(); window.scrollTo(0, 0);
}
export function render() {
  const G = app.G;
  applyClubColor(G.club.color);
  $('#crest').innerHTML = emblemSVG(G.club.emblem);
  $('#clubName').textContent = G.club.name;
  $('#clubSub').textContent = `${G.club.pref} ${G.club.city} ・ ${G.tier}部 ・ ${G.season}年目 ${monthOf(G.week)}`;
  const v = $('#view');
  const views: Record<string, () => string> = { home: homeHTML, squad: squadHTML, table: tableHTML, settings: settingsHTML };
  v.innerHTML = (views[app.tab] || homeHTML)();
  bindView(v);
}

function homeHTML(): string {
  const G = app.G;
  const rows = standings(G); const rank = rows.findIndex((r) => r.c.me) + 1;
  const done = G.week >= 22;
  const round = done ? null : G.fixtures[G.week];
  const pair = round ? round.find(([h, a]) => G.clubs[h].me || G.clubs[a].me) : null;
  const opp = pair ? (G.clubs[pair[0]].me ? G.clubs[pair[1]] : G.clubs[pair[0]]) : null;
  const home = pair ? G.clubs[pair[0]].me : false;
  const tbl = G.table[0];
  const pend = G.pending.map((e, i) => { const p = find(e.pid); if (!p) return ''; return `<div class="item"><span class="grow"><b>${esc(e.club)}</b> から ${esc(p.name)} にオファー（${e.price.toLocaleString()}万円）</span><button class="btn small primary" data-offer="${i}">見る</button></div>`; }).join('');
  const lastRep = G.lastReport && G.lastReport.length ? `<div class="item"><span class="grow">先週の報告：${G.lastReport.filter((r) => r.ups.some((v) => v > 0)).length}人が伸びた</span><button class="btn small ghost" data-act="report">見る</button></div>` : '';
  const lm = G.lastMatch;
  const lastM = lm ? `<div class="item"><span class="grow">前の試合 ${esc(lm.home.name)} ${lm.score[0]}-${lm.score[1]} ${esc(lm.away.name)}</span><button class="btn small ghost" data-act="replay">見どころ</button></div>` : '';
  return `
  <section class="card"><h2>次の目標</h2>
    <div class="goal">${G.tier}部で2位以内に入って昇格</div>
    <div class="muted">いま ${rank}位 ・ 勝ち点 ${tbl.p}（${tbl.w}勝${tbl.d}分${tbl.l}敗）</div>
    ${G.lastSeason ? `<div class="muted">${G.lastSeason.season}年目は ${G.lastSeason.rank}位${G.lastSeason.up ? 'で昇格！' : ''}</div>` : ''}
  </section>
  <section class="card"><h2>${done ? 'シーズン終了' : '次の試合 ・ 第' + (G.week + 1) + '節'}</h2>
    ${done ? `<div class="goal">${rank}位でシーズンを終えた</div><div class="muted">「1週進む」で次のシーズンへ。選手はみんな1つ年をとる。</div>`
      : `<div class="next-match"><span class="tag ${home ? '' : 'away'}">${home ? 'ホーム' : 'アウェイ'}</span><span class="grow">${esc(opp!.name)}</span><span class="muted small">${esc(opp!.mgr.style)}</span></div>`}
  </section>
  ${pend || lastRep || lastM ? `<section class="card notice"><h2>今週のお知らせ</h2>${pend}${lastM}${lastRep}</section>` : ''}
  <div class="btns">
    <button class="btn primary" data-act="week">1週進む</button>
    <button class="btn ghost" data-act="skip">次に決めることまで進む</button>
  </div>
  <section class="card"><h2>${esc(mgrShort(G.mgr))}への方針（若手の使い方）</h2>
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
  return `<section class="card"><h2>トップチーム ${list.length}人</h2><div class="plist">${list.map(plRow).join('')}</div></section>`;
}
export function plRow(p: Player): string {
  const o = ovr(p);
  return `<button class="pl" data-pid="${p.id}">${posTag(p.pos)}<span style="min-width:0"><span class="pname"><span class="num">${p.num || ''}</span>${esc(p.name)}${p.req ? ' <span class="tag">起用を依頼中</span>' : ''}</span><br><span class="pmeta">${p.age}歳 ・ ${p.seasonApps}試合 ${p.seasonGoals}点${p.inj ? ' ・ ケガ（あと' + p.inj + '週）' : ''}${p.cond >= 1 ? ' ・ 好調' : p.cond <= -1 ? ' ・ 不調' : ''}</span></span><span class="ovr">${val(o)}</span></button>`;
}
function tableHTML(): string {
  const G = app.G; const rows = standings(G);
  return `<section class="card"><h2>${G.tier}部 ・ 第${G.week}節まで</h2><div style="overflow-x:auto"><table>
  <thead><tr><th class="l">#</th><th class="l">クラブ</th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>差</th><th>点</th></tr></thead><tbody>
  ${rows.map((r, i) => `<tr class="${r.c.me ? 'me' : ''} ${i < 2 ? 'up' : ''} ${i >= 10 ? 'down' : ''}"><td class="l">${i + 1}</td><td class="l club">${esc(r.c.me ? G.club.name : r.c.name)}</td><td>${r.w + r.d + r.l}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.p}</b></td></tr>`).join('')}
  </tbody></table></div><div class="muted small" style="margin-top:8px">緑の線は昇格（上位2つ）、赤の線は降格（下位2つ）。差は得失点差（取った点−取られた点）。</div></section>`;
}
function settingsHTML(): string {
  const slots = listSlots(app.kv); const pr = readPrefs();
  const fmt = (s: string) => { try { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return ''; } };
  return `<section class="card"><h2>セーブ</h2><div class="list">${slots.map((s) => `<div class="slot"><div class="grow"><b>${s.label}</b><div class="muted small">${s.exists ? esc(s.summary) + ' ・ ' + fmt(s.savedAt) : s.broken ? '読めないデータ' : 'まだない'}</div></div>
      ${s.key === AUTO_KEY ? '' : `<button class="btn small ghost" data-save="${s.key}">ここに保存</button>`}${s.exists ? `<button class="btn small primary" data-load="${s.key}">読む</button>` : ''}</div>`).join('')}</div>
    <div class="muted small" style="margin-top:8px">自動セーブは、1週進むたびに保存されます。データはこのブラウザの中にだけあります。</div></section>
  <section class="card"><h2>画面</h2><div class="seg" role="group" aria-label="画面の明るさ">${[['auto', '端末に合わせる'], ['light', '明るい'], ['dark', '暗い']].map(([k, l]) => `<button data-theme-set="${k}" aria-pressed="${pr.theme === k}">${l}</button>`).join('')}</div></section>
  <section class="card"><h2>音</h2><div class="seg" role="group" aria-label="効果音">${[['off', 'オフ'], ['on', 'オン']].map(([k, l]) => `<button data-sound="${k}" aria-pressed="${(pr.sound ? 'on' : 'off') === k}">${l}</button>`).join('')}</div><div class="muted small" style="margin-top:6px">ボタン・ゴール・覚醒などの短い効果音だけです。</div></section>
  <section class="card"><h2>最初から</h2><div class="confirm" id="resetBox"><button class="btn small danger" data-act="reset">新しいクラブで始める</button></div><div class="muted small" style="margin-top:6px">手動のセーブは消えません。</div></section>`;
}

function bindView(v: HTMLElement) {
  const G = app.G;
  $$<HTMLElement>('[data-act]', v).forEach((b) => b.addEventListener('click', () => act(b.dataset.act!)));
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
export function showPlayer(id: number, back: () => void) {
  const p = find(id); if (!p) return;
  openPlayer(p, {
    report: (app.G.lastReport || []).find((r) => r.pid === id) || null,
    coachName: 'コーチ', coachSkill: 0.6, mgrName: mgrShort(app.G.mgr), mgrObeyWord: obeyWord(app.G.mgr),
    onReq: (pl) => { pl.req = !pl.req; autosave(); }, back,
  });
}
function afterWeek(res: ReturnType<typeof advanceWeek>) {
  autosave(); render();
  if (res.seasonEnd) { toast('新しいシーズンが始まった'); return; }
  const rep = () => openReport(res.report, find, showPlayer, render);
  if (res.match) openMatch(res.match, app.G.club.color, rep); else rep();
}
function act(a: string) {
  const G = app.G;
  if (a === 'week') { sfx('tap'); afterWeek(advanceWeek(G)); }
  if (a === 'skip') {
    sfx('tap');
    const r = advanceToDecision(G); autosave(); render();
    if (r.seasonEnd && r.weeks === 1) { toast('新しいシーズンが始まった'); return; }
    openReport(r.report, find, showPlayer, render, `${r.weeks}週ぶんの報告`);
  }
  if (a === 'report') openReport(G.lastReport || [], find, showPlayer, render);
  if (a === 'replay' && G.lastMatch) openMatch(G.lastMatch, G.club.color, null);
  if (a === 'reset') {
    const box = $('#resetBox');
    box.innerHTML = `<span class="muted">いまのクラブは自動セーブから消えます。始めますか？</span><button class="btn small primary" data-act="reset2">始める</button><button class="btn small ghost" data-act="cancel">やめる</button>`;
    $$<HTMLElement>('[data-act]', box).forEach((b) => b.addEventListener('click', () => act(b.dataset.act!)));
  }
  if (a === 'reset2') { removeSave(app.kv, AUTO_KEY); startNew(); }
  if (a === 'cancel') render();
}
export let startNew = () => { app.G = newGame((Date.now() % 1e9) >>> 0); autosave(); setTab('home'); };
export function setStartNew(f: () => void) { startNew = f; }
function openOffer(i: number) {
  const G = app.G; const e = G.pending[i]; const p = find(e.pid); if (!p) return;
  sheet(`<div class="bar"><h2>オファーが届いた</h2></div>
    <section class="card"><div><b>${esc(e.club)}</b> が ${esc(p.name)}（${p.age}歳 ・ ${p.pos} ・ 総合力 ${ovr(p)}）を <b>${e.price.toLocaleString()}万円</b> でほしいと言っている。</div>
    <div class="muted" style="margin-top:6px">受けると、選手はクラブを去る。値段の交渉はできない。</div>
    <div class="btns" style="margin-top:12px"><button class="btn primary" id="oYes">受ける</button><button class="btn ghost" id="oNo">断る</button></div></section>`);
  $('#oYes').addEventListener('click', () => { answerOffer(G, i, true); autosave(); closeSheet(); render(); toast(`${p.name} が移籍した`); });
  $('#oNo').addEventListener('click', () => { answerOffer(G, i, false); autosave(); closeSheet(); render(); });
}
export { soundOn };
