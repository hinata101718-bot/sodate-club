/* 試合の画面（本当の90分）
   - 時計は試合の時間で進む。「ふつう」は1秒＝1秒（90分）。2倍・4倍・6倍・10倍
   - 実況の場面は、その分の時刻に始まる。行と行の間は試合の時間で数秒。速くしても、場面の中は1行を読めるくらいに落とす
   - 場面のない時間は、実データから学んだボール回し（パス・ドリブル・奪われる・外に出る）が続く
   - 22人は、実データから学んだ立ち位置（役割・ボールの位置・ボールを持っているか）へ、なめらかに動く
   - 「見どころだけ」：見どころの場面の少し前まで時間を飛ばす
   - 終わったら試合の図（流れ・シュート・1対1・交代・評価点） */
import { S, ACT, $, esc, posTag, fmt, G } from './util';
import { lineHTML } from '../ui/dom';
import { flowSVG, flowLegend, statsHTML, shotMapHTML, bindShotMap, duelMapHTML, subsHTML, cardsHTML } from '../ui/matchgfx';
import { emblemSVG } from '../ui/emblem';
import { roleKey, roleAnchor, roleShift, roleSpeed, nextAct } from './movement';
import type { Pos } from '../core/constants';
import type { Line, MatchView, Token, ViewItem } from '../core/types';
import type { PlayResult } from '../core/game';

const SPEEDS = [1, 2, 4, 6, 10];
/** 場面の中で、1行を出してから次の行までの試合の時間（秒） */
const LINE_GAP = 3.4, TALK_GAP = 2.6;
/** 場面の中の1行を、少なくともこれだけの時間（現実の秒）は見せる */
const MIN_REAL_LINE = 1.0;
const BASE_X: Record<Pos, number> = { GK: 10, CB: 33, SB: 40, DM: 46, CM: 50, AM: 57, WG: 56, ST: 62 };
interface Dot { side: 0 | 1; name: string; num: number; pos: Pos; role: string; ax: number; ay: number; x: number; y: number; vx: number; vy: number; ph: number; vmax: number; el?: SVGGElement }
const tokName = (t: Token): { t: string; me: boolean } | null => (typeof t === 'string' ? null : { t: t.t, me: t.me });
const textOf = (l: Line) => l.map((t) => (typeof t === 'string' ? t : t.t)).join('');
const RES_GOAL = /決まった|ゴール！|ネットが揺れ|ネットを揺ら|押しこんだ|叩きこん|流しこ/;
const RES_SAVE = /キャッチ|セーブ|止めた|弾き|はじき|防いだ|ブロック|かき出/;
const RES_MISS = /外れ|枠の外|ゴールの上|ポスト|バー|越えて/;
const SHOT = /シュート|狙う|振り抜|打つ|ヘディング|合わせ|ボレー|PK/;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mmss = (s: number) => { const t = Math.max(0, Math.floor(s)); const m = Math.floor(t / 60), sec = t % 60; return m >= 90 ? `90+${m - 89}'` : `${m}:${String(sec).padStart(2, '0')}`; };

export function playMatch(m: MatchView, res: PlayResult, after: () => void) {
  const g = G(); const meHome = m.home.me;
  const clubOf = (name: string) => g.clubs.find((c) => (c.me ? g.club.name : c.name) === name);
  const hc = clubOf(m.home.name), ac = clubOf(m.away.name);
  const hCol = m.home.me ? g.club.color : m.home.color; const aCol0 = m.away.me ? g.club.color : m.away.color;
  const aCol = sameish(aCol0, hCol) ? (['#2f6db3', '#c3423d', '#e0a21a', '#6b3fa0'].find((c) => !sameish(c, hCol)) ?? '#2f6db3') : aCol0;
  const sideOfMe = (me: boolean): 0 | 1 => (me === meHome ? 0 : 1);
  /** チームの向き（右へ攻める）の座標と、画面の座標の行き来（アウェーは反転。2回でもどる） */
  const tf = (side: 0 | 1, x: number, y: number): [number, number] => (side === 0 ? [x, y] : [105 - x, 68 - y]);

  /* ---- 22人：役割と、ふだんの位置（実データの役割の位置を使い、並び方に合わせる） ---- */
  const dots: Dot[] = [];
  (m.lineups ?? [[], []]).forEach((xi, si0) => {
    const side = si0 as 0 | 1; const tot: Record<string, number> = {}; const cnt: Record<string, number> = {};
    for (const x of xi) if (x.lr === 'C') tot[x.pos] = (tot[x.pos] ?? 0) + 1;
    const nCB = xi.filter((x) => x.pos === 'CB').length;
    for (const x of xi) {
      let lr: string = x.lr; let ay: number;
      if (x.lr === 'C') { const n = tot[x.pos]; const i = (cnt[x.pos] = (cnt[x.pos] ?? 0) + 1) - 1; lr = n === 1 ? 'C' : n === 2 ? (i === 0 ? 'L' : 'R') : (['L', 'C', 'R'][i] ?? 'C'); const w = x.pos === 'CB' ? (n >= 3 ? 14 : 8) : 9; ay = n === 1 ? 34 : 34 - w + ((2 * w) / (n - 1)) * i; }
      else ay = 34 + (x.lr === 'R' ? 1 : -1) * (x.pos === 'WG' ? 17 : 18);
      const role = roleKey(x.pos, lr);
      const a = roleAnchor(role);
      let ax = a ? a[0] : BASE_X[x.pos];
      if (a && x.lr !== 'C') ay = a[1];
      if (x.pos === 'SB' && nCB >= 3) ax += 8; /* 3バックの両サイドは、ウイングバックとして高め */
      if (x.pos === 'CM') ax = Math.max(ax, 50);
      if (x.pos === 'GK') { ax = 10; ay = 34; }
      const [wx, wy] = tf(side, ax, ay);
      dots.push({ side, name: x.name, num: x.num, pos: x.pos, role, ax, ay, x: wx, y: wy, vx: 0, vy: 0, ph: Math.random() * 6.28, vmax: Math.min(8, roleSpeed(role) + 0.6) });
    }
  });
  const pl = dots.map((d, i) => `<g class="mp-pl" id="pl${i}" style="transform:translate(${d.x}px,${d.y}px)"><circle r="1.9" fill="${d.side === 0 ? hCol : aCol}" stroke="${d.side === 0 ? '#ffffff' : '#18231e'}" stroke-width=".4"/><text y=".8" text-anchor="middle" font-size="2.05" font-weight="700" fill="${ink(d.side === 0 ? hCol : aCol)}">${d.num || ''}</text></g>`).join('');
  const pitch = `<svg class="hpitch mp" viewBox="0 0 105 68" aria-label="ピッチ。${esc(m.home.name)}は右へ、${esc(m.away.name)}は左へ攻める"><defs><pattern id="mow" width="21" height="68" patternUnits="userSpaceOnUse"><rect width="10.5" height="68" fill="#348457"/><rect x="10.5" width="10.5" height="68" fill="#2f7a50"/></pattern></defs>
    <rect width="105" height="68" fill="url(#mow)"/><g fill="none" stroke="rgba(255,255,255,.7)" stroke-width=".35"><rect x="0.5" y="0.5" width="104" height="67"/><line x1="52.5" y1="0.5" x2="52.5" y2="67.5"/><circle cx="52.5" cy="34" r="9.15"/><rect x="0.5" y="13.85" width="16.5" height="40.3"/><rect x="0.5" y="24.85" width="5.5" height="18.3"/><rect x="88" y="13.85" width="16.5" height="40.3"/><rect x="99" y="24.85" width="5.5" height="18.3"/></g>
    <rect x="-1" y="30.34" width="1.5" height="7.32" fill="#fff"/><rect x="104.5" y="30.34" width="1.5" height="7.32" fill="#fff"/>
    <line id="mp-pass" x1="0" y1="0" x2="0" y2="0" stroke="#fff" stroke-width=".4" stroke-dasharray="1 .8" opacity="0"/>
    ${pl}
    <circle id="ball" r=".95" fill="#fff" stroke="#18231e" stroke-width=".3" style="transform:translate(52.5px,34px)"/>
    <g id="mp-label" opacity="0"><rect id="mp-lrect" x="0" y="0" width="30" height="4.6" rx="1.1" fill="rgba(24,35,30,.82)"/><text id="mp-ltext" x="0" y="3.3" font-size="2.6" fill="#fff" text-anchor="middle"></text></g>
    <text id="goal-txt" x="52.5" y="38" text-anchor="middle" font-size="12" font-weight="800" fill="#ffd34d" stroke="#18231e" stroke-width=".4" opacity="0" style="transition:opacity .3s">GOAL!</text>
    <text id="mp-banner" x="52.5" y="8" text-anchor="middle" font-size="3.6" font-weight="700" fill="#fff" stroke="rgba(24,35,30,.6)" stroke-width=".25" opacity="0" style="transition:opacity .3s"></text></svg>`;
  const spBtns = SPEEDS.map((v) => `<button class="btn small" data-act="mSpd" data-arg="${v}">${v === 1 ? 'ふつう（90分）' : v + '倍'}</button>`).join('');
  $('#overlay').innerHTML = `<div class="match-ov"><div class="match-box mp-box">
    <div class="row between"><span class="eyebrow">${esc(m.title)}</span><span class="speed"><button class="btn small" data-act="mFeed" data-arg="hl" id="mp-hl">見どころだけ</button><button class="btn small" data-act="mFeed" data-arg="full" id="mp-full">試合をすべて</button><span class="muted small">速さ</span>${spBtns}<button class="btn small primary" data-act="mSkip">結果へ</button></span></div>
    <div class="scoreboard"><div class="side"><span class="kit" style="background:${hCol}"></span>${hc ? `<span class="emb">${emblemSVG(hc.me ? g.club.emblem : hc.emblem)}</span>` : ''}<span class="tn" style="color:var(${m.home.me ? '--nm-me' : '--nm-op'})">${esc(m.home.name)}</span><span class="muted small">→ 右へ攻める</span></div><div><div class="sc"><span id="sc0">0</span><span class="dash">-</span><span id="sc1">0</span></div><div class="clock" id="clock">0:00</div><div class="muted small" id="mp-left" style="text-align:center"></div></div><div class="side away"><span class="muted small">左へ攻める ←</span><span class="tn" style="color:var(${m.away.me ? '--nm-me' : '--nm-op'})">${esc(m.away.name)}</span>${ac ? `<span class="emb">${emblemSVG(ac.me ? g.club.emblem : ac.emblem)}</span>` : ''}<span class="kit" style="background:${aCol}"></span></div></div>
    <div class="mp-main"><div class="grid" style="gap:12px">${pitch}<div class="panel" id="flowbox">${flowSVG(m, 0)}${flowLegend(m)}</div></div>
    <div class="panel mp-feedbox"><div class="mp-now" id="mp-now">キックオフを待っている……</div><div class="feed mp-feed" id="feed" aria-live="polite"></div></div></div>
    <div class="muted small">選手とボールの動きは、実際の試合の位置データ（SkillCorner）とイベントデータ（StatsBomb）から学んだ傾向を使っている</div>
    <div id="msum"></div></div></div>`;
  const ov = document.querySelector('.match-ov') as HTMLElement;
  ov.style.setProperty('--nm-me', readable(meHome ? hCol : aCol)); ov.style.setProperty('--nm-op', readable(meHome ? aCol : hCol));
  const svg = document.querySelector('.mp') as SVGSVGElement;
  dots.forEach((d, i) => { d.el = svg.querySelector('#pl' + i) as SVGGElement; });
  const ballEl = svg.querySelector('#ball') as SVGCircleElement; const passEl = svg.querySelector('#mp-pass') as SVGLineElement;
  const label = svg.querySelector('#mp-label') as SVGGElement; const lrect = svg.querySelector('#mp-lrect') as SVGRectElement; const ltext = svg.querySelector('#mp-ltext') as SVGTextElement;
  const banner = svg.querySelector('#mp-banner') as SVGTextElement;

  /* ---- 試合の状態 ---- */
  const st = { gs: 0, speed: S.ui.mSpeed ?? 1, done: false, mode: (S.ui.mMode ?? 'full') as 'full' | 'hl', half: 1, sc: [0, 0] as [number, number] };
  const B = { x: 52.5, y: 34, fx: 52.5, fy: 34, tx: 52.5, ty: 34, t0: 0, dur: 0, flying: false, after: null as null | (() => void) };
  let holder: Dot | null = null; let possSide: 0 | 1 = 0; let nextAt = 3; let deadUntil = 0; let pending: { at: number; f: () => void }[] = [];
  const later = (sec: number, f: () => void) => pending.push({ at: st.gs + sec, f });
  const ovr = new Map<Dot, { x: number; y: number; until: number }>();
  let tagged: { d: Dot; until: number } | null = null;
  const team = (side: 0 | 1) => dots.filter((d) => d.side === side);
  const nearest = (side: 0 | 1, x: number, y: number, noGK = true) => team(side).filter((d) => !noGK || d.pos !== 'GK').sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0] ?? null;
  const kick = (x: number, y: number, speed: number, after: (() => void) | null = null) => {
    B.fx = B.x; B.fy = B.y; B.tx = clamp(x, -1.5, 106.5); B.ty = clamp(y, -0.5, 68.5); B.t0 = st.gs; B.dur = Math.max(0.3, Math.hypot(B.tx - B.fx, B.ty - B.fy) / speed); B.flying = true; B.after = after; holder = null;
    passEl.setAttribute('x1', String(B.fx)); passEl.setAttribute('y1', String(B.fy)); passEl.setAttribute('x2', String(B.tx)); passEl.setAttribute('y2', String(B.ty)); passEl.setAttribute('opacity', '.5');
  };
  const give = (d: Dot) => { holder = d; possSide = d.side; };
  const passTo = (to: Dot, speed = 15, x?: number, y?: number) => { const tx = x ?? to.x, ty = y ?? to.y; ovr.set(to, { x: tx, y: ty, until: st.gs + Math.hypot(tx - B.x, ty - B.y) / speed + 0.3 }); kick(tx, ty, speed, () => give(to)); };
  const tag = (d: Dot | null, text = '', sec = 3) => { tagged = d ? { d, until: st.gs + sec } : null; if (d) ltext.textContent = text || d.name; else label.setAttribute('opacity', '0'); };
  const flash = (t: string, sec = 1.6) => { banner.textContent = t; banner.setAttribute('opacity', '1'); setTimeout(() => banner.setAttribute('opacity', '0'), sec * 1000); };
  const kickoff = (side: 0 | 1) => {
    ovr.clear(); pending = []; B.flying = false; B.x = 52.5; B.y = 34;
    for (const d of dots) { const [x, y] = tf(d.side, Math.min(d.ax, 50), d.ay); d.x = x; d.y = y; d.vx = d.vy = 0; }
    const k = team(side).find((d) => d.pos === 'ST') ?? team(side).find((d) => d.pos !== 'GK')!;
    k.x = 52.5 + (side === 0 ? -1 : 1); k.y = 34; give(k); nextAt = st.gs + 1.5;
  };
  /* ---- ボール回し（場面のない時間）：実データのイベントから学んだ確率で、次のプレーを決める ---- */
  const idleAct = () => {
    if (!holder) { const d = nearest(possSide, B.x, B.y, false); if (d) give(d); else return; }
    const h = holder!; const [hx, hy] = tf(h.side, h.x, h.y);
    const a = nextAct(hx, hy);
    const [wx, wy] = tf(h.side, a.tx, a.ty);
    if (a.kind === 'carry') {
      const dur = Math.max(1.2, Math.hypot(wx - h.x, wy - h.y) / a.speed);
      ovr.set(h, { x: wx, y: wy, until: st.gs + dur });
      nextAt = st.gs + dur + a.gap * (0.6 + Math.random() * 0.8);
      if (a.result === 'lost') later(dur, () => { if (holder === h && !scene) { const o = nearest((1 - h.side) as 0 | 1, h.x, h.y); if (o) { ovr.set(o, { x: h.x, y: h.y, until: st.gs + 0.8 }); give(o); tag(o, `${o.name} が奪う`, 2.5); } } });
      return;
    }
    if (a.result === 'out') {
      kick(wx, wy, a.speed, () => {
        const ox = B.x, oy = B.y; const opp = (1 - h.side) as 0 | 1; const overLine = ox < 1 || ox > 104;
        later(4, () => {
          if (scene) return;
          if (overLine) { const gk = team(opp).find((d) => d.pos === 'GK'); if (gk) { B.x = gk.x; B.y = gk.y; give(gk); flash('ゴールキック'); } }
          else { const t = nearest(opp, ox, oy); if (t) { B.x = clamp(ox, 1, 104); B.y = oy < 34 ? 0.8 : 67.2; ovr.set(t, { x: B.x, y: B.y, until: st.gs + 2 }); give(t); flash('スローイン'); } }
          nextAt = st.gs + 2.5;
        });
      });
      nextAt = st.gs + 99; deadUntil = st.gs + 6; return;
    }
    const mates = team(h.side).filter((d) => d !== h);
    if (a.result === 'ok') { const to = mates.sort((p, q) => Math.hypot(p.x - wx, p.y - wy) - Math.hypot(q.x - wx, q.y - wy))[0]; if (to) passTo(to, a.speed, wx, wy); }
    else { const o = nearest((1 - h.side) as 0 | 1, wx, wy, false); if (o) { ovr.set(o, { x: wx, y: wy, until: st.gs + Math.hypot(wx - B.x, wy - B.y) / a.speed + 0.3 }); kick(wx, wy, a.speed, () => { give(o); tag(o, `${o.name} がカット`, 2.5); }); } }
    nextAt = st.gs + Math.hypot(wx - B.x, wy - B.y) / a.speed + a.gap * (0.6 + Math.random() * 0.8);
  };
  /* ---- 選手の行き先 ---- */
  const targetOf = (d: Dot): [number, number] => {
    const o = ovr.get(d); if (o && o.until > st.gs) return [o.x, o.y];
    if (d === holder) { const dir = d.side === 0 ? 1 : -1; return [d.x + dir * 0.6, d.y]; }
    const [bx, by] = tf(d.side, B.x, B.y);
    if (d.pos === 'GK') return tf(d.side, 7 + Math.max(0, (bx - 30) * 0.11), 34 + (by - 34) * 0.18);
    const [sx, sy, sdv] = roleShift(d.role, bx, by, possSide === d.side);
    const j = Math.min(2.2, sdv * 0.15); const ph = d.ph + st.gs / 7;
    return tf(d.side, d.ax + sx + Math.sin(ph) * j, d.ay + sy + Math.cos(ph * 1.31) * j);
  };

  /* ---- 実況の場面の予定（その分の時刻に始める） ---- */
  type Sc = { it: ViewItem; start: number; li: number; next: number; el: HTMLElement | null };
  const plan = (arr: ViewItem[]) => {
    const list = [...arr].sort((a, b) => a.min - b.min || (a.ord ?? 0) - (b.ord ?? 0)); const out: Sc[] = []; let prevEnd = -999;
    for (const it of list) {
      const base = it.min <= 0 ? 0 : (it.min - 1) * 60 + 8 + Math.random() * 30;
      const start = Math.max(base, prevEnd + 3);
      const dur = it.lines.length * (it.kind === 'goal' || it.kind === 'chance' ? LINE_GAP : TALK_GAP) + (it.kind === 'goal' ? 25 : 2);
      out.push({ it, start, li: 0, next: start, el: null }); prevEnd = start + dur;
    }
    return out;
  };
  let scenes: Sc[] = []; let si = 0; let scene: Sc | null = null;
  const lastMin = Math.max(90, ...m.full.map((x) => x.min));
  const endAt = () => Math.max(90 * 60 + 30, (lastMin - 1) * 60 + 40, scenes.length ? scenes[scenes.length - 1].start + 20 : 0);
  /** 場面の中は、1行を少なくとも MIN_REAL_LINE 秒は見せる */
  const effSpeed = () => (scene ? Math.min(st.speed, (scene.it.kind === 'goal' || scene.it.kind === 'chance' ? LINE_GAP : TALK_GAP) / MIN_REAL_LINE) : st.speed);
  const feed = $('#feed'); const now = $('#mp-now');
  const showScore = () => { for (const k of [0, 1] as const) { const el = $('#sc' + k); if (el.textContent !== String(st.sc[k])) { el.textContent = String(st.sc[k]); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } } };
  const dotOf = (name: string, me: boolean) => dots.find((d) => d.side === sideOfMe(me) && d.name === name) ?? dots.find((d) => d.name === name) ?? null;
  const goalX = (side: 0 | 1) => (side === 0 ? 105.8 : -0.8);
  /** 1行の中身から、ボールと選手を動かす（実況の行と映像をそろえる） */
  const animate = (it: ViewItem, line: Line, last: boolean) => {
    const txt = textOf(line); const names = line.map(tokName).filter((x): x is { t: string; me: boolean } => !!x);
    const atk: 0 | 1 | null = it.kind === 'goal' || it.kind === 'chance' ? sideOfMe(it.me) : null;
    if (atk !== null) possSide = atk;
    if (last && atk !== null && it.kind === 'goal' && RES_GOAL.test(txt)) { kick(goalX(atk), 34 + (Math.random() - 0.5) * 5, 24); tag(null); return; }
    if (atk !== null && RES_SAVE.test(txt)) { const gk = team((1 - atk) as 0 | 1).find((d) => d.pos === 'GK'); if (gk) { kick(gk.x, gk.y, 22, () => give(gk)); tag(gk); } return; }
    if (atk !== null && RES_MISS.test(txt)) { kick(atk === 0 ? 106.5 : -1.5, 34 + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 8), 22, () => { later(2.5, () => { const gk = team((1 - atk) as 0 | 1).find((d) => d.pos === 'GK'); if (gk) { B.x = gk.x; B.y = gk.y; give(gk); } }); }); tag(null); return; }
    const who = names.length ? dotOf(names[0].t, names[0].me) : null; if (!who) return;
    if (atk === null || /奪|カット|インターセプト|クリア|かっさら|拾/.test(txt)) possSide = who.side;
    if (holder !== who) { if (Math.hypot(B.x - who.x, B.y - who.y) > 3) passTo(who, 16); else give(who); }
    tag(who, '', LINE_GAP + 0.5);
    if (atk !== null && who.side === atk && SHOT.test(txt)) { const dir = who.side === 0 ? 1 : -1; ovr.set(who, { x: who.x + dir * 2, y: who.y + (34 - who.y) * 0.15, until: st.gs + 1.2 }); later(1.4, () => { if (scene?.it === it) kick(goalX(atk) - (atk === 0 ? 3 : -3), 34 + (Math.random() - 0.5) * 7, 26); }); return; }
    if (atk !== null && who.side === atk) { const dir = who.side === 0 ? 1 : -1; ovr.set(who, { x: who.x + dir * 5, y: who.y + (34 - who.y) * 0.1, until: st.gs + LINE_GAP }); }
    const d2 = names[1] ? dotOf(names[1].t, names[1].me) : null;
    if (d2 && d2 !== who) {
      if (d2.side === who.side) later(1.6, () => { if (scene?.it === it) { passTo(d2, 16, d2.x + (d2.side === 0 ? 3 : -3), d2.y); tag(d2, '', LINE_GAP); } });
      else ovr.set(d2, { x: who.x + (who.side === 0 ? 1.6 : -1.6), y: who.y + (d2.y > who.y ? 1.2 : -1.2), until: st.gs + LINE_GAP });
    }
  };
  /** 場面の1行を出す */
  const stepScene = (sc: Sc, quiet = false) => {
    const it = sc.it;
    if (sc.li === 0) {
      const div = document.createElement('div');
      const side = it.kind === 'goal' || it.kind === 'chance' ? (it.me ? ' me' : ' op') : '';
      div.className = `fe ${it.kind === 'goal' ? 'chance' : it.kind}${side}`;
      div.innerHTML = `<span class="m">${it.min}'</span><span class="t">${it.who ? `<span class="who">${it.who}</span>` : ''}</span>`;
      feed.appendChild(div); sc.el = div;
      now.innerHTML = it.kind === 'goal' || it.kind === 'chance' ? `<span class="${it.me ? 'n-me' : 'n-op'}">${esc(it.me ? (meHome ? m.home.name : m.away.name) : (meHome ? m.away.name : m.home.name))}</span>の攻め` : '';
    }
    const line = it.lines[sc.li]; const last = sc.li === it.lines.length - 1;
    const span = document.createElement('span'); span.className = 'ln'; span.innerHTML = lineHTML(line);
    const t = sc.el!.querySelector('.t')!; if (sc.li > 0 || it.who) t.appendChild(document.createElement('br')); t.appendChild(span);
    feed.scrollTop = feed.scrollHeight;
    if (!quiet) animate(it, line, last);
    sc.li++;
    const gap = it.kind === 'goal' || it.kind === 'chance' ? LINE_GAP : TALK_GAP;
    sc.next = st.gs + gap * (!last && sc.li === it.lines.length - 1 && (it.kind === 'goal' || it.kind === 'chance') ? 1.5 : 1);
    if (last && it.kind === 'goal' && it.goal) {
      st.sc = it.goal.score; showScore();
      sc.el!.classList.add('goal'); if (!it.goal.me) sc.el!.classList.add('opp');
      sc.el!.querySelector('.t')!.insertAdjacentHTML('afterbegin', `<b class="gol">ゴール！ ${it.goal.score[0]}-${it.goal.score[1]}</b><br>`);
      if (!quiet) {
        const gt = document.getElementById('goal-txt'); gt?.setAttribute('opacity', '1'); setTimeout(() => gt?.setAttribute('opacity', '0'), 2200);
        document.querySelector('.scoreboard')?.classList.add('shake'); setTimeout(() => document.querySelector('.scoreboard')?.classList.remove('shake'), 600);
        const conceded = (1 - sideOfMe(it.goal.me)) as 0 | 1; sc.next = st.gs + 20; later(16, () => { if (!st.done) kickoff(conceded); });
      }
    }
  };
  let flowT = 0;
  /* ---- 毎フレーム ---- */
  let lastT = performance.now();
  const frame = (tnow: number) => {
    if (!document.body.contains(svg)) return;
    const real = Math.min(0.05, (tnow - lastT) / 1000); lastT = tnow;
    if (!st.done) {
      /* 見どころだけ：次の場面の少し前まで飛ばす */
      if (st.mode === 'hl' && !scene && si < scenes.length && scenes[si].start - st.gs > 20) { st.gs = scenes[si].start - 12; pending = pending.filter((p) => p.at > st.gs); for (const d of dots) { const [x, y] = targetOf(d); d.x = x; d.y = y; d.vx = d.vy = 0; } flash(`${Math.floor(st.gs / 60)}分へ`); }
      const dt = real * effSpeed(); st.gs += dt;
      for (const p of pending.filter((q) => q.at <= st.gs)) { pending = pending.filter((q) => q !== p); p.f(); }
      /* 前半終了 */
      if (st.half === 1 && st.gs >= 45 * 60 && !scene && (si >= scenes.length || scenes[si].it.min > 45)) { st.half = 2; flash('後半キックオフ', 2.5); kickoff(1); if (st.gs < 45 * 60 + 1) st.gs = 45 * 60; }
      /* 場面 */
      if (!scene && si < scenes.length && st.gs >= scenes[si].start) scene = scenes[si];
      if (scene && st.gs >= scene.next) { if (scene.li < scene.it.lines.length) stepScene(scene); else { scene = null; si++; nextAt = Math.max(nextAt, st.gs + 1.5); } }
      /* ボール */
      if (B.flying) { const u = Math.min(1, (st.gs - B.t0) / B.dur); const e = 1 - (1 - u) ** 2; B.x = B.fx + (B.tx - B.fx) * e; B.y = B.fy + (B.ty - B.fy) * e; if (u >= 1) { B.flying = false; passEl.setAttribute('opacity', '0'); const f = B.after; B.after = null; f?.(); } }
      else if (holder) { const dir = holder.side === 0 ? 1 : -1; B.x = holder.x + dir * 1.1; B.y = holder.y + 0.3; }
      if (!scene && !B.flying && holder && st.gs >= nextAt && st.gs >= deadUntil) idleAct();
      if (!scene && !B.flying && !holder && st.gs >= deadUntil && !pending.length) { const d = nearest(possSide, B.x, B.y, false); if (d) { ovr.set(d, { x: B.x, y: B.y, until: st.gs + 2 }); later(1.5, () => { if (!holder && !B.flying) give(d); }); deadUntil = st.gs + 1.6; } }
      /* 選手（ばね：行き先へなめらかに。速さは実データの上限まで） */
      for (const d of dots) {
        const [tx, ty] = targetOf(d);
        d.vx += ((tx - d.x) * 1.3 - d.vx * 2.1) * dt; d.vy += ((ty - d.y) * 1.3 - d.vy * 2.1) * dt;
        const v = Math.hypot(d.vx, d.vy); const vm = d === holder ? d.vmax * 0.8 : d.vmax; if (v > vm) { d.vx *= vm / v; d.vy *= vm / v; }
        d.x = clamp(d.x + d.vx * dt, 0.8, 104.2); d.y = clamp(d.y + d.vy * dt, 0.8, 67.2);
      }
      if (st.gs - flowT > 30) { flowT = st.gs; const fb = document.getElementById('flowbox'); if (fb) fb.innerHTML = flowSVG(m, st.gs / 60) + flowLegend(m); }
      $('#clock').textContent = mmss(st.gs);
      $('#mp-left').textContent = st.mode === 'hl' ? '見どころだけ' : `のこり約${Math.max(1, Math.ceil((endAt() - st.gs) / st.speed / 60))}分（いまの速さ）`;
      if (st.gs >= endAt() && si >= scenes.length && !scene) finish();
    }
    for (const d of dots) d.el!.style.transform = `translate(${d.x.toFixed(2)}px,${d.y.toFixed(2)}px)`;
    ballEl.style.transform = `translate(${B.x.toFixed(2)}px,${B.y.toFixed(2)}px)`;
    if (tagged && tagged.until > st.gs) { const d = tagged.d; const t = ltext.textContent ?? ''; const w = Math.max(13, t.length * 2.7 + 4); const lx = clamp(d.x, w / 2 + 1, 104 - w / 2); const ly = d.y > 10 ? d.y - 7 : d.y + 3.5;
      lrect.setAttribute('x', String(lx - w / 2)); lrect.setAttribute('y', String(ly)); lrect.setAttribute('width', String(w)); ltext.setAttribute('x', String(lx)); ltext.setAttribute('y', String(ly + 3.3)); label.setAttribute('opacity', '1'); }
    else if (tagged) { tagged = null; label.setAttribute('opacity', '0'); }
    requestAnimationFrame(frame);
  };
  const finish = () => {
    if (st.done) return; st.done = true;
    if (scene) { while (scene.li < scene.it.lines.length) stepScene(scene, true); si++; scene = null; }
    for (; si < scenes.length; si++) { const sc = scenes[si]; while (sc.li < sc.it.lines.length) stepScene(sc, true); }
    st.sc = [m.score[0], m.score[1]]; showScore();
    $('#clock').textContent = '試合終了'; now.textContent = '試合終了'; $('#mp-left').textContent = '';
    const fb = document.getElementById('flowbox'); if (fb) fb.innerHTML = flowSVG(m, 95) + flowLegend(m);
    summary(m, res, meHome);
  };
  /** 見どころだけ／試合をすべて：これからの場面だけ組み直す */
  const setMode = (md: 'full' | 'hl') => {
    if (st.done) return; S.ui.mMode = md; st.mode = md;
    if (scene) { while (scene.li < scene.it.lines.length) stepScene(scene, true); scene = null; si++; }
    const done = new Set(scenes.slice(0, si).map((s) => s.it));
    const fresh = plan(md === 'hl' ? m.highlights : m.full).filter((s) => !done.has(s.it) && s.it.min * 60 > st.gs - 5);
    scenes = [...scenes.slice(0, si), ...fresh];
    document.getElementById('mp-hl')?.classList.toggle('sel', md === 'hl'); document.getElementById('mp-full')?.classList.toggle('sel', md === 'full');
  };
  const markSpeed = () => document.querySelectorAll<HTMLElement>('[data-act=mSpd]').forEach((b) => b.classList.toggle('sel', +b.dataset.arg! === st.speed));
  S.ui.match = { st, finish, after, setMode, markSpeed };
  markSpeed(); setMode(st.mode);
  kickoff(0);
  requestAnimationFrame(frame);
}
function summary(m: MatchView, res: PlayResult, meHome: boolean) {
  const my = meHome ? m.score[0] : m.score[1], op = meHome ? m.score[1] : m.score[0];
  const win = m.pk ? (meHome ? m.pk[0] > m.pk[1] : m.pk[1] > m.pk[0]) : my > op; const draw = !m.pk && my === op;
  const pl = [...m.played].sort((a, b) => Number(a.sub) - Number(b.sub));
  const ratings = pl.map((x) => `<tr><td>${posTag(x.pos)}</td><td>${esc(x.name)}${x.sub ? ' <span class="chip">途中</span>' : ''}</td><td class="r num">${x.min ?? ''}分</td><td class="r num">${x.goals || ''}</td><td class="r num">${x.ast || ''}</td><td class="r num">${x.st ? `${x.st.sh}/${x.st.pa}/${x.st.tk}` : ''}</td><td class="r num" style="font-weight:700;color:${(x.rt ?? 6) >= 7.5 ? 'var(--good)' : (x.rt ?? 6) < 5.5 ? 'var(--bad)' : 'inherit'}">${x.rt != null ? x.rt.toFixed(1) : '-'}</td></tr>`).join('');
  $('#msum').innerHTML = `<div class="grid g2">
    <section class="panel"><div class="panel-h"><h2>${win ? '勝利' : draw ? '引き分け' : '敗戦'}${m.pk ? `（PK ${m.pk[0]}-${m.pk[1]}）` : ''}</h2>${res.att ? `<span class="muted">お客さん ${fmt(res.att)}人</span>` : ''}</div>
      <div class="kv"><dt>得点</dt><dd style="font-family:var(--f-body);font-size:13px">${m.scorers.map((s) => `<span class="${s.me ? 'n-me' : 'n-op'}">${esc(s.name)} ${s.min}'</span>`).join('、') || 'なし'}</dd>${m.mom ? `<dt>この試合のMVP</dt><dd style="font-family:var(--f-body);font-size:13px"><span class="${m.mom.me ? 'n-me' : 'n-op'}">${esc(m.mom.name)}</span>（${esc(m.mom.club)}・${m.mom.rt.toFixed(1)}）</dd>` : ''}${m.kick ? `<dt>キッカー</dt><dd style="font-family:var(--f-body);font-size:12px">CK ${esc(m.kick.ck)}・FK ${esc(m.kick.fk)}・PK ${esc(m.kick.pk)}</dd>` : ''}</div>
      ${(m.recap ?? []).map((r) => `<div class="small"><span class="who" style="color:var(--muted)">${r.who}</span>　${lineHTML(r.line)}</div>`).join('')}
      ${statsHTML(m)}${cardsHTML(m)}</section>
    <section class="panel"><h2>うちの選手の評価点</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>POS</th><th>選手</th><th class="r">出場</th><th class="r">点</th><th class="r">A</th><th class="r" title="シュート/パス/タックル">シ/パ/タ</th><th class="r">評価</th></tr></thead><tbody>${ratings}</tbody></table></div>
      ${m.subs?.length ? `<h3>交代</h3>${subsHTML(m)}` : ''}</section>
    <section class="panel"><h2>シュートの位置</h2>${shotMapHTML(m, 'shotmap1')}</section>
    <section class="panel"><h2>1対1の勝ち負け</h2>${duelMapHTML(m) || '<div class="muted small">記録なし</div>'}</section></div>
    <div class="foot" style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn primary next-btn" data-act="mClose">つづける ▶</button></div>`;
  bindShotMap(m, $('#msum'), 'shotmap1');
  $('#msum').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/** 2つの色が近すぎるか */
function sameish(a: string, b: string) { const h = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); try { const [x, y] = [h(a), h(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 90; } catch { return false; } }
/** 白い面の上で読める色にする */
function readable(c: string) { try { let [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; if (L > 0.55) { const k = (0.55 / L) * 0.75; r *= k; g *= k; b *= k; } return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); } catch { return '#1f7a5f'; } }
function ink(c: string) { try { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#18231e' : '#ffffff'; } catch { return '#ffffff'; } }
ACT.mSpd = (v) => { const c = S.ui.match; if (!c) return; c.st.speed = +v; S.ui.mSpeed = +v; c.markSpeed(); };
ACT.mSkip = () => { const c = S.ui.match; if (c && !c.st.done) c.finish(); };
ACT.mFeed = (v) => { const c = S.ui.match; if (c) c.setMode(v); };
ACT.mClose = () => { const c = S.ui.match; $('#overlay').innerHTML = ''; S.ui.match = null; c?.after(); };
