/* 効果音（PC版）
   - 音はすべて CC0（自由に使える）の録音。出典は docs/pc/sound.md と「セーブ・設定」の画面
   - はじめから音あり。音量は控えめ（50%）。「セーブ・設定」で音量とオフを変えられる（ブラウザに覚えておく）
   - ブラウザの決まりで、最初にどこかを押すまでは音が出ない。最初に押したときに音の準備をする
   - 試合：笛・ボールをける音・シュート・セーブ・ゴールの歓声・ため息・スタンドのざわめき（ボールがゴールに近いほど大きく）
   - 結果：勝利・引き分け・敗戦・昇格や優勝のファンファーレ、覚醒・実績解除の短い曲
   - 画面：ボタン・週を進める・メッセージ（トースト）の小さな音 */
import { S, hooks } from './util';
import whistle_short from './sfx/whistle_short.mp3';
import whistle_long from './sfx/whistle_long.mp3';
import whistle_end from './sfx/whistle_end.mp3';
import kick1 from './sfx/kick1.mp3';
import kick2 from './sfx/kick2.mp3';
import kick3 from './sfx/kick3.mp3';
import crowd_loop from './sfx/crowd_loop.mp3';
import goal_cheer from './sfx/goal_cheer.mp3';
import opp_goal from './sfx/opp_goal.mp3';
import near_miss from './sfx/near_miss.mp3';
import save_clap from './sfx/save_clap.mp3';
import win_crowd from './sfx/win_crowd.mp3';
import big_applause from './sfx/big_applause.mp3';
import j_win from './sfx/j_win.mp3';
import j_bigwin from './sfx/j_bigwin.mp3';
import j_lose from './sfx/j_lose.mp3';
import j_draw from './sfx/j_draw.mp3';
import j_ach from './sfx/j_ach.mp3';
import j_awake from './sfx/j_awake.mp3';
import ui_click from './sfx/ui_click.mp3';
import ui_select from './sfx/ui_select.mp3';
import ui_next from './sfx/ui_next.mp3';
import ui_ok from './sfx/ui_ok.mp3';
import ui_open from './sfx/ui_open.mp3';
import ui_close from './sfx/ui_close.mp3';
import ui_toggle from './sfx/ui_toggle.mp3';
import ui_error from './sfx/ui_error.mp3';
import ui_message from './sfx/ui_message.mp3';

const URLS = { whistle_short, whistle_long, whistle_end, kick1, kick2, kick3, crowd_loop, goal_cheer, opp_goal, near_miss, save_clap, win_crowd, big_applause, j_win, j_bigwin, j_lose, j_draw, j_ach, j_awake, ui_click, ui_select, ui_next, ui_ok, ui_open, ui_close, ui_toggle, ui_error, ui_message };
export type Sfx = keyof typeof URLS;
/** 音ごとの大きさ（全体の音量にかける） */
const GAIN: Partial<Record<Sfx, number>> = {
  whistle_short: 0.55, whistle_long: 0.6, whistle_end: 0.65, kick1: 0.35, kick2: 0.35, kick3: 0.35, goal_cheer: 0.8, opp_goal: 0.7, near_miss: 0.65, save_clap: 0.35,
  win_crowd: 0.55, big_applause: 0.6, j_win: 0.6, j_bigwin: 0.65, j_lose: 0.55, j_draw: 0.5, j_ach: 0.5, j_awake: 0.55,
  ui_click: 0.25, ui_select: 0.25, ui_next: 0.3, ui_ok: 0.3, ui_open: 0.22, ui_close: 0.22, ui_toggle: 0.25, ui_error: 0.3, ui_message: 0.25,
};
const KEY = 'sodate-club:sound';
export interface SoundSet { on: boolean; vol: number }
let set: SoundSet = { on: true, vol: 0.5 };
let ctx: AudioContext | null = null; let master: GainNode | null = null;
const bufs = new Map<Sfx, AudioBuffer>(); const loading = new Map<Sfx, Promise<AudioBuffer | null>>();

export function soundSettings(): SoundSet { return set; }
export function loadSoundSettings() {
  try { const v = S.kv?.getItem(KEY); if (v) { const o = JSON.parse(v); set = { on: o.on !== false, vol: typeof o.vol === 'number' ? Math.max(0, Math.min(1, o.vol)) : 0.5 }; } } catch { /* 覚えていなければ、はじめの設定 */ }
}
export function setSound(p: Partial<SoundSet>) {
  set = { ...set, ...p };
  try { S.kv?.setItem(KEY, JSON.stringify(set)); } catch { /* 覚えられなくても音は変わる */ }
  if (master) master.gain.value = set.on ? set.vol : 0;
  if (!set.on) crowdStop();
}

/** 音の準備（ブラウザの決まりで、ユーザーが押したあとでないと作れない） */
function ensure(): AudioContext | null {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return ctx; }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = set.on ? set.vol : 0; master.connect(ctx.destination);
    /* よく使う音は先に読んでおく */
    for (const n of ['ui_click', 'ui_select', 'ui_next', 'kick1', 'kick2', 'kick3', 'whistle_short', 'crowd_loop', 'goal_cheer'] as Sfx[]) void load(n);
  } catch { ctx = null; }
  return ctx;
}
function load(n: Sfx): Promise<AudioBuffer | null> {
  const b = bufs.get(n); if (b) return Promise.resolve(b);
  let p = loading.get(n);
  if (!p) {
    p = fetch(URLS[n]).then((r) => r.arrayBuffer()).then((a) => new Promise<AudioBuffer>((ok, ng) => ctx!.decodeAudioData(a, ok, ng))).then((x) => { bufs.set(n, x); return x; }).catch(() => null);
    loading.set(n, p);
  }
  return p;
}
/** 音を鳴らす（読みこみ中なら、読めたらすぐ鳴らす。0.4秒より遅れたら鳴らさない） */
export function play(n: Sfx, vol = 1, rate = 1) {
  if (!set.on || set.vol <= 0) return;
  const c = ensure(); if (!c || !master) return;
  const t0 = performance.now();
  const go = (b: AudioBuffer) => {
    const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = (GAIN[n] ?? 0.5) * vol; src.connect(g); g.connect(master!); src.start();
  };
  const b = bufs.get(n); if (b) { go(b); return; }
  void load(n).then((x) => { if (x && performance.now() - t0 < 400) go(x); });
}

/** 先に読んでおく（「結果へ」のように重い計算のあとで鳴らす音が、遅れて消えないように） */
export function preload(names: Sfx[]) { if (!ensure()) return; for (const n of names) void load(n); }
const MATCH_SFX: Sfx[] = ['whistle_long', 'whistle_end', 'opp_goal', 'near_miss', 'save_clap', 'win_crowd', 'big_applause', 'j_win', 'j_bigwin', 'j_lose', 'j_draw'];

/* ---------- スタンドのざわめき（つなぎ目が聞こえないよう、2つを重ねてくり返す） ---------- */
let crowd: { g: GainNode; srcs: AudioBufferSourceNode[]; timer: number } | null = null;
export function crowdStart() {
  if (!set.on || crowd) return; const c = ensure(); if (!c || !master) return;
  preload(MATCH_SFX);
  const g = c.createGain(); g.gain.value = 0; g.connect(master);
  crowd = { g, srcs: [], timer: 0 };
  void load('crowd_loop').then((b) => {
    if (!b || !crowd || crowd.g !== g) return;
    const X = 2.5; const len = b.duration;
    const once = (at: number) => {
      const s = c.createBufferSource(); s.buffer = b; const e = c.createGain(); s.connect(e); e.connect(g);
      e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(1, at + X); e.gain.setValueAtTime(1, at + len - X); e.gain.linearRampToValueAtTime(0, at + len);
      s.start(at); crowd!.srcs.push(s); if (crowd!.srcs.length > 4) crowd!.srcs.shift();
    };
    let next = c.currentTime + 0.05; once(next); next += len - X;
    const tick = () => { if (!crowd || crowd.g !== g) return; while (next < c.currentTime + 4) { once(next); next += len - X; } crowd.timer = window.setTimeout(tick, 1000); };
    tick();
  });
}
/** ざわめきの大きさ（0〜1）。急に変えずに、なめらかに寄せる */
export function crowdLevel(v: number) {
  if (!crowd || !ctx) return;
  crowd.g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.5, ctx.currentTime, 0.6);
}
export function crowdStop() {
  if (!crowd) return; const c = crowd; crowd = null; clearTimeout(c.timer);
  if (ctx) { c.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { for (const s of c.srcs) { try { s.stop(); } catch { /* もう止まっている */ } } c.g.disconnect(); }, 1800); }
}

/* ---------- 画面の操作の音 ---------- */
const QUIET = new Set(['bg', 'mOff', 'mOn']);
const ACT_SFX: Record<string, Sfx> = { next: 'ui_next', skip: 'ui_next', nav: 'ui_select', mSpd: 'ui_select', mFeed: 'ui_select', mTilt: 'ui_select', mPause: 'ui_toggle', closeModal: 'ui_close', closeChain: 'ui_close', mClose: 'ui_close', confirmOk: 'ui_ok', mSub: 'ui_ok', player: 'ui_open' };
let lastToast = 0;
/** トーストの音（たくさん出るときは、いちばん大事な1つだけ） */
export function toastSound(kind: string) {
  const now = performance.now(); if (now - lastToast < 350) return; lastToast = now;
  if (kind === 'ach') play('j_ach'); else if (kind === 'bad' || kind === 'warn') play('ui_error'); else if (kind === 'good') play('ui_ok', 0.8); else play('ui_message');
}
export function bindSound() {
  loadSoundSettings();
  hooks.toast = toastSound;
  const unlock = () => { ensure(); };
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!el) return;
    const a = el.dataset.act!; if (QUIET.has(a) || (el as HTMLButtonElement).disabled) return;
    play(ACT_SFX[a] ?? 'ui_click');
  }, { capture: true });
  document.addEventListener('change', (e) => { const el = e.target as HTMLElement; if (el.matches('input[type=checkbox],input[type=radio],select')) play('ui_toggle'); }, { capture: true });
}

/** 出典（画面と docs に出す） */
export const SOUND_CREDITS = [
  '笛：Rosa-Orenes256「Referee whistle sound」・SpliceSound「Referee whistle blow, gymnasium」',
  'ボールをける音：bittermelonheart「Soccer Ball Kick」・musita182「Soccer Kick」・Nicolas4677「Ball Kick」',
  '歓声・拍手：FoolBoyMedia「Crowd Cheer」・AlaskaRobotics「cheering and clapping crowd 2」・Bansemer「Large crowd applause」',
  'ため息：ShangusBurger「Crowd Sigh In Disappointment」',
  'スタンドのざわめき：neilraouf「Milan Derby (Milan vs Inter) at San Siro Stadium」',
  '（ここまで Freesound・CC0）',
  '画面の音：Kenney「Interface Sounds」、短い曲：Kenney「Music Jingles」（kenney.nl・CC0）',
];
