/* 試合の画面
   - 2D：両チームの22人を背番号つきの丸で出す。実況の1行ごとに、その行に出てくる選手へボールが動く（文章と映像をそろえる）
   - 実況は1行ずつ出す。シュートの結果とスコアは、最後の行が出てから（結果が先にわからないように）
   - 長さは「ふつう」でおよそ3分。何も起きない時間はさっと進む
   - 終わったら試合の図（流れ・シュート・1対1・交代・評価点） */
import { S, ACT, $, esc, posTag, fmt, G } from './util';
import { lineHTML } from '../ui/dom';
import { flowSVG, flowLegend, statsHTML, shotMapHTML, bindShotMap, duelMapHTML, subsHTML, cardsHTML } from '../ui/matchgfx';
import { emblemSVG } from '../ui/emblem';
import type { Pos } from '../core/constants';
import type { Line, MatchView, Token, ViewItem } from '../core/types';
import type { PlayResult } from '../core/game';
import { shift, PASS_GAP } from './movement';

let timer = 0;
const BUDGET = 170000; // 「ふつう」の速さの、1試合の長さの目安（ミリ秒）
/** ホーム（右へ攻める）から見た、ポジションの前後の位置 */
const BASE_X: Record<Pos, number> = { GK: 5, CB: 19, SB: 25, DM: 34, CM: 43, AM: 54, WG: 62, ST: 71 };
interface Dot { side: 0 | 1; name: string; num: number; pos: Pos; bx: number; by: number; x: number; y: number; el?: SVGGElement }
const tokName = (t: Token): { t: string; me: boolean } | null => (typeof t === 'string' ? null : { t: t.t, me: t.me });
const textOf = (l: Line) => l.map((t) => (typeof t === 'string' ? t : t.t)).join('');
const RES_GOAL = /決まった|ゴール！|ネットが揺れ|ネットを揺ら|押しこんだ|叩きこん|流しこ/;
const RES_SAVE = /キャッチ|セーブ|止めた|弾き|はじき|防いだ|ブロック|かき出/;
const RES_MISS = /外れ|枠の外|ゴールの上|ポスト|バー|越えて/;
const SHOT = /シュート|狙う|振り抜|打つ|ヘディング|合わせ|ボレー|PK/;

export function playMatch(m: MatchView, res: PlayResult, after: () => void) {
  const g = G(); const meHome = m.home.me;
  const clubOf = (name: string) => g.clubs.find((c) => (c.me ? g.club.name : c.name) === name);
  const hc = clubOf(m.home.name), ac = clubOf(m.away.name);
  const hCol = m.home.me ? g.club.color : m.home.color; const aCol0 = m.away.me ? g.club.color : m.away.color; const aCol = sameish(aCol0, hCol) ? (['#2f6db3', '#c3423d', '#e0a21a', '#6b3fa0'].find((c) => !sameish(c, hCol)) ?? '#2f6db3') : aCol0;
  const sideOfMe = (me: boolean): 0 | 1 => (me === meHome ? 0 : 1);
  const numOf = (side: 0 | 1, name: string) => { const c = side === 0 ? hc : ac; const sq = c?.me ? g.squad : c?.squad ?? []; return sq.find((p) => p.name === name)?.num ?? 0; };

  /* ---- 22人の初めの位置 ---- */
  const dots: Dot[] = [];
  (m.lineups ?? [[], []]).forEach((xi, si) => {
    const side = si as 0 | 1; const cnt: Record<string, number> = {}; const tot: Record<string, number> = {};
    for (const x of xi) if (x.lr === 'C') tot[x.pos] = (tot[x.pos] ?? 0) + 1;
    for (const x of xi) {
      let y: number;
      if (x.lr === 'C') { const n = tot[x.pos]; const i = (cnt[x.pos] = (cnt[x.pos] ?? 0) + 1) - 1; const w = x.pos === 'CB' ? 13 : x.pos === 'ST' ? 9 : 12; y = n === 1 ? 34 : 34 - w + ((2 * w) / (n - 1)) * i; }
      else { const wide = x.pos === 'WG' ? 27 : 23; y = 34 + (x.lr === 'R' ? wide : -wide) * (side === 0 ? 1 : -1); }
      const bx0 = BASE_X[x.pos]; const bx = side === 0 ? bx0 : 105 - bx0;
      dots.push({ side, name: x.name, num: x.num, pos: x.pos, bx, by: y, x: bx, y });
    }
  });
  const pl = dots.map((d, i) => `<g class="mp-pl" id="pl${i}" style="transform:translate(${d.x}px,${d.y}px)"><circle r="2.3" fill="${d.side === 0 ? hCol : aCol}" stroke="${d.side === 0 ? '#ffffff' : '#18231e'}" stroke-width=".45"/><text y=".95" text-anchor="middle" font-size="2.5" font-weight="700" fill="${ink(d.side === 0 ? hCol : aCol)}">${d.num || ''}</text></g>`).join('');
  const pitch = `<svg class="hpitch mp" viewBox="0 0 105 68" aria-label="ピッチ。${esc(m.home.name)}は右へ、${esc(m.away.name)}は左へ攻める"><defs><pattern id="mow" width="21" height="68" patternUnits="userSpaceOnUse"><rect width="10.5" height="68" fill="#348457"/><rect x="10.5" width="10.5" height="68" fill="#2f7a50"/></pattern></defs>
    <rect width="105" height="68" fill="url(#mow)"/><g fill="none" stroke="rgba(255,255,255,.7)" stroke-width=".4"><rect x="1.5" y="1.5" width="102" height="65"/><line x1="52.5" y1="1.5" x2="52.5" y2="66.5"/><circle cx="52.5" cy="34" r="9.15"/><rect x="1.5" y="13.85" width="16.5" height="40.3"/><rect x="1.5" y="24.85" width="5.5" height="18.3"/><rect x="87" y="13.85" width="16.5" height="40.3"/><rect x="98" y="24.85" width="5.5" height="18.3"/></g>
    <rect x="0" y="30.3" width="1.5" height="7.4" fill="#fff"/><rect x="103.5" y="30.3" width="1.5" height="7.4" fill="#fff"/>
    <line id="mp-pass" x1="0" y1="0" x2="0" y2="0" stroke="#fff" stroke-width=".5" stroke-dasharray="1.2 1" opacity="0"/>
    ${pl}
    <circle id="ball" r="1.15" fill="#fff" stroke="#18231e" stroke-width=".35" style="transform:translate(52.5px,34px)"/>
    <g id="mp-label" opacity="0"><rect id="mp-lrect" x="0" y="0" width="30" height="5" rx="1.2" fill="rgba(24,35,30,.82)"/><text id="mp-ltext" x="0" y="3.6" font-size="2.8" fill="#fff" text-anchor="middle"></text></g>
    <text id="goal-txt" x="52.5" y="38" text-anchor="middle" font-size="12" font-weight="800" fill="#ffd34d" stroke="#18231e" stroke-width=".4" opacity="0" style="transition:opacity .3s">GOAL!</text></svg>`;
  $('#overlay').innerHTML = `<div class="match-ov"><div class="match-box mp-box">
    <div class="row between"><span class="eyebrow">${esc(m.title)}</span><span class="speed"><button class="btn small" data-act="mFeed" data-arg="hl">見どころだけ</button><button class="btn small" data-act="mFeed" data-arg="full">実況をすべて</button><span class="muted small">速さ</span><button class="btn small" data-act="mSpd" data-arg="1">ふつう</button><button class="btn small" data-act="mSpd" data-arg="2">速い</button><button class="btn small" data-act="mSpd" data-arg="5">とても速い</button><button class="btn small primary" data-act="mSkip">結果へ</button></span></div>
    <div class="scoreboard"><div class="side"><span class="kit" style="background:${hCol}"></span>${hc ? `<span class="emb">${emblemSVG(hc.me ? g.club.emblem : hc.emblem)}</span>` : ''}<span class="tn" style="color:${m.home.me ? 'var(--nm-me)' : 'var(--nm-op)'}">${esc(m.home.name)}</span><span class="muted small">→ 右へ攻める</span></div><div><div class="sc"><span id="sc0">0</span><span class="dash">-</span><span id="sc1">0</span></div><div class="clock" id="clock">0'</div></div><div class="side away"><span class="muted small">左へ攻める ←</span><span class="tn" style="color:${m.away.me ? 'var(--nm-me)' : 'var(--nm-op)'}">${esc(m.away.name)}</span>${ac ? `<span class="emb">${emblemSVG(ac.me ? g.club.emblem : ac.emblem)}</span>` : ''}<span class="kit" style="background:${aCol}"></span></div></div>
    <div class="mp-main"><div class="grid" style="gap:12px">${pitch}<div class="panel" id="flowbox">${flowSVG(m, 0)}${flowLegend(m)}</div></div>
    <div class="panel mp-feedbox"><div class="mp-now" id="mp-now">キックオフを待っている……</div><div class="feed mp-feed" id="feed" aria-live="polite"></div></div></div>
    <div class="muted small">選手の動きは、実際の試合の位置データ（Metrica Sports のサンプルデータ）から学んだ立ち位置の傾向を使っている</div>
    <div id="msum"></div></div></div>`;
  /* 実況の名前の色を、ユニフォームの色にそろえる（白っぽい色は読めないので、濃い色に） */
  const ov = document.querySelector('.match-ov') as HTMLElement;
  const myCol = readable(meHome ? hCol : aCol), opCol = readable(meHome ? aCol : hCol);
  ov.style.setProperty('--nm-me', myCol); ov.style.setProperty('--nm-op', opCol);
  const svg = document.querySelector('.mp') as SVGSVGElement;
  dots.forEach((d, i) => { d.el = svg.querySelector('#pl' + i) as SVGGElement; });
  const ball = svg.querySelector('#ball') as SVGCircleElement; const pass = svg.querySelector('#mp-pass') as SVGLineElement;
  const label = svg.querySelector('#mp-label') as SVGGElement; const lrect = svg.querySelector('#mp-lrect') as SVGRectElement; const ltext = svg.querySelector('#mp-ltext') as SVGTextElement;
  /* ---- 動きのしくみ（毎フレーム）：実データから学んだ立ち位置へ、ばねのようになめらかに向かう ---- */
  type Mv = Dot & { vx: number; vy: number; ph: number };
  const mv = dots as Mv[]; for (const d of mv) { d.vx = 0; d.vy = 0; d.ph = Math.random() * 6.28; }
  const B = { x: 52.5, y: 34, fx: 52.5, fy: 34, tx: 52.5, ty: 34, t: 1, dur: 0.01 };
  let carrier: Mv | null = null; let possSide: 0 | 1 = 0; let busy = false; let lastPass = 0; let clock = 0;
  const ovr = new Map<Mv, { x: number; y: number; until: number }>();
  let tagged: { d: Mv; until: number } | null = null;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  /** 自分のチームが右へ攻める向きの座標にする（ホームはそのまま、アウェーは反転。2回やるともどる） */
  const tf = (side: 0 | 1, x: number, y: number): [number, number] => (side === 0 ? [x, y] : [105 - x, 68 - y]);
  const goalX = (side: 0 | 1) => (side === 0 ? 105.5 : -0.5);
  const kick = (x: number, y: number, speed = 24) => { B.fx = B.x; B.fy = B.y; B.tx = clamp(x, -1, 106); B.ty = clamp(y, 1, 67); B.dur = Math.max(0.25, Math.hypot(B.tx - B.fx, B.ty - B.fy) / speed); B.t = 0;
    pass.setAttribute('x1', String(B.fx)); pass.setAttribute('y1', String(B.fy)); pass.setAttribute('x2', String(B.tx)); pass.setAttribute('y2', String(B.ty)); pass.setAttribute('opacity', '.55'); };
  const targetOf = (d: Mv): [number, number] => {
    const o = ovr.get(d); if (o && o.until > clock) return [o.x, o.y];
    if (d === carrier && B.t >= 1) { const dir = d.side === 0 ? 1 : -1; return [d.x + dir * 2.4, d.y + (34 - d.y) * 0.04]; }
    const [ax, ay] = tf(d.side, d.bx, d.by); const [bx2, by2] = tf(d.side, B.x, B.y);
    if (d.pos === 'GK') return tf(d.side, ax + Math.max(0, (bx2 - 25) * 0.07), 34 + (by2 - 34) * 0.22);
    const [sx, sy, sdv] = shift(ax, ay, bx2, by2, possSide === d.side);
    const ph = d.ph + clock / 2.6; const j = Math.min(3.5, sdv * 0.22);
    return tf(d.side, ax + sx + Math.sin(ph) * j, ay + sy + Math.cos(ph * 1.27) * j);
  };
  const nearest = (side: 0 | 1, x: number, y: number, skipGK = true) => mv.filter((d) => d.side === side && (!skipGK || d.pos !== 'GK')).sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0] ?? null;
  const passTo = (to: Mv, lead = 2) => { const dir = to.side === 0 ? 1 : -1; const lx = to.x + dir * lead, ly = to.y; kick(lx, ly); ovr.set(to, { x: lx, y: ly, until: clock + B.dur }); carrier = to; possSide = to.side; };
  /** 場面のないときのボール回し：近くの味方へ、少し前向きにつなぐ。ときどき相手が奪う */
  const idlePass = () => {
    if (!carrier || carrier.side !== possSide) carrier = nearest(possSide, B.x, B.y);
    if (!carrier) return;
    const c = carrier; const dir = c.side === 0 ? 1 : -1;
    if (Math.random() < 0.09) { const o = nearest((1 - possSide) as 0 | 1, B.x, B.y); if (o) { ovr.set(o, { x: B.x, y: B.y, until: clock + 0.8 }); carrier = o; possSide = o.side; tag(o, `${o.name} が奪う`, 1.2); } return; }
    const mates = mv.filter((d) => d.side === c.side && d !== c && (d.pos !== 'GK' || (dir * (c.x - 52.5)) < -25));
    const w = mates.map((d) => Math.exp(-Math.hypot(d.x - c.x, d.y - c.y) / 16) * (1 + Math.max(-0.6, dir * (d.x - c.x) / 30)));
    let r = Math.random() * w.reduce((s2, v) => s2 + v, 0); let to = mates[0];
    for (let i = 0; i < mates.length; i++) { r -= w[i]; if (r <= 0) { to = mates[i]; break; } }
    if (to) passTo(to);
  };
  const reset = (kickSide: 0 | 1) => { carrier = null; possSide = kickSide; B.x = B.fx = B.tx = 52.5; B.y = B.fy = B.ty = 34; B.t = 1; ovr.clear(); const k = mv.filter((d) => d.side === kickSide && (d.pos === 'ST' || d.pos === 'AM' || d.pos === 'CM'))[0]; if (k) { ovr.set(k, { x: 52.5 - (kickSide === 0 ? 1.2 : -1.2), y: 34, until: clock + 1.2 }); carrier = k; } };
  const tag = (d: Mv | null, text = '', sec = 1.6) => { tagged = d ? { d, until: clock + sec } : null; if (d) { ltext.textContent = text || d.name; } else label.setAttribute('opacity', '0'); };
  const dotOf = (name: string, me: boolean) => (mv.find((d) => d.side === sideOfMe(me) && d.name === name) ?? mv.find((d) => d.name === name) ?? null);
  let lastT = performance.now();
  const frame = (tnow: number) => {
    if (!document.body.contains(svg)) return;
    const dt = Math.min(0.05, (tnow - lastT) / 1000) * st.speed; lastT = tnow; clock += dt;
    if (B.t < 1) { B.t = Math.min(1, B.t + dt / B.dur); const e = 1 - (1 - B.t) ** 2; B.x = B.fx + (B.tx - B.fx) * e; B.y = B.fy + (B.ty - B.fy) * e; if (B.t >= 1) pass.setAttribute('opacity', '0'); }
    else if (carrier) { const dir = carrier.side === 0 ? 1 : -1; B.x = carrier.x + dir * 1.25; B.y = carrier.y + 0.35; }
    for (const d of mv) {
      const [tx, ty] = targetOf(d);
      d.vx += ((tx - d.x) * 3.4 - d.vx * 2.7) * dt; d.vy += ((ty - d.y) * 3.4 - d.vy * 2.7) * dt;
      const v = Math.hypot(d.vx, d.vy); const vmax = d === carrier ? 7 : 9.5; if (v > vmax) { d.vx *= vmax / v; d.vy *= vmax / v; }
      d.x = clamp(d.x + d.vx * dt, 1.5, 103.5); d.y = clamp(d.y + d.vy * dt, 2, 66);
      d.el!.style.transform = `translate(${d.x.toFixed(2)}px,${d.y.toFixed(2)}px)`;
    }
    ball.style.transform = `translate(${B.x.toFixed(2)}px,${B.y.toFixed(2)}px)`;
    if (tagged && tagged.until > clock) { const d = tagged.d; const t = ltext.textContent ?? ''; const w = Math.max(14, t.length * 2.9 + 4); const lx = clamp(d.x, w / 2 + 1, 104 - w / 2); const ly = d.y > 12 ? d.y - 8 : d.y + 4.5;
      lrect.setAttribute('x', String(lx - w / 2)); lrect.setAttribute('y', String(ly)); lrect.setAttribute('width', String(w)); ltext.setAttribute('x', String(lx)); ltext.setAttribute('y', String(ly + 3.6)); label.setAttribute('opacity', '1'); }
    else if (tagged) { tagged = null; label.setAttribute('opacity', '0'); }
    if (!busy && !st.done && B.t >= 1 && clock - lastPass > PASS_GAP * 0.8) { lastPass = clock; idlePass(); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  /** 1行の中身から、ボールと選手を動かす（実況の行と映像をそろえる） */
  const animate = (it: ViewItem, line: Line, idx: number, last: boolean) => {
    const txt = textOf(line); const names = line.map(tokName).filter((x): x is { t: string; me: boolean } => !!x);
    const atk: 0 | 1 | null = it.kind === 'goal' || it.kind === 'chance' ? sideOfMe(it.me) : null;
    void idx;
    if (/キックオフ|後半が始|後半のキックオフ|後半開始/.test(txt)) { reset(/後半/.test(txt) ? 1 : 0); return; }
    if (atk !== null) possSide = atk;
    if (last && atk !== null && it.kind === 'goal' && RES_GOAL.test(txt)) { carrier = null; kick(goalX(atk), 34 + (Math.random() - 0.5) * 5, 30); tag(null); return; }
    if (atk !== null && RES_SAVE.test(txt)) { const gk = mv.find((d) => d.side !== atk && d.pos === 'GK'); if (gk) { carrier = null; kick(gk.x, gk.y, 28); setTimeout(() => { carrier = gk; possSide = gk.side; }, 450); tag(gk); } return; }
    if (atk !== null && RES_MISS.test(txt)) { carrier = null; kick(atk === 0 ? 106 : -1, 34 + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 7), 28); const gk = mv.find((d) => d.side !== atk && d.pos === 'GK'); setTimeout(() => { if (gk) { B.x = B.fx = B.tx = gk.x; B.y = B.fy = B.ty = gk.y; B.t = 1; carrier = gk; possSide = gk.side; } }, 1300 / st.speed); tag(null); return; }
    const who = names.length ? dotOf(names[0].t, names[0].me) : null; if (!who) return;
    const steal = /奪|カット|インターセプト|クリア|かっさら|拾/.test(txt);
    if (atk === null || steal) possSide = who.side;
    /* 1人目にボールを渡す（遠ければパスでつなぐ） */
    if (carrier !== who) { if (Math.hypot(B.x - who.x, B.y - who.y) > 4) passTo(who, 1.5); else { carrier = who; possSide = who.side; } }
    tag(who);
    const shot = atk !== null && who.side === atk && SHOT.test(txt);
    if (shot) { const dir = who.side === 0 ? 1 : -1; ovr.set(who, { x: who.x + dir * 3, y: who.y + (34 - who.y) * 0.2, until: clock + 0.6 }); setTimeout(() => { carrier = null; kick(goalX(atk!) - (atk === 0 ? 4 : -4), 34 + (Math.random() - 0.5) * 8, 30); }, 450 / st.speed); return; }
    /* 2人目：味方ならパスの受け手、相手なら寄せてくる */
    const d2 = names[1] ? dotOf(names[1].t, names[1].me) : null;
    if (d2 && d2 !== who) {
      if (d2.side === who.side) setTimeout(() => { if (!st.done) { passTo(d2, 3); tag(d2); } }, 500 / st.speed);
      else ovr.set(d2, { x: who.x + (who.side === 0 ? 2 : -2), y: who.y + (d2.y > who.y ? 1.5 : -1.5), until: clock + 1.6 });
    }
  };

  /* ---- 流れる順番と、速さ ---- */
  const st = { t: -1, i: 0, li: 0, sc: [0, 0] as [number, number], speed: S.ui.mSpeed ?? 1, done: false, mode: (S.ui.mMode ?? 'full') as 'full' | 'hl', cur: null as HTMLElement | null };
  const order = (arr: ViewItem[]) => [...arr].sort((a, b) => a.min - b.min || (a.ord ?? 0) - (b.ord ?? 0));
  let items: ViewItem[] = order(st.mode === 'hl' ? m.highlights : m.full);
  const lineMs = () => { const n = items.reduce((s, it) => s + it.lines.length, 0) || 1; return Math.max(650, Math.min(2400, (BUDGET * 0.82) / n)); };
  let per = lineMs();
  const end = Math.max(90, ...items.map((x) => x.min));
  const feed = $('#feed'); const now = $('#mp-now');
  const showScore = () => { for (const k of [0, 1] as const) { const el = $('#sc' + k); if (el.textContent !== String(st.sc[k])) { el.textContent = String(st.sc[k]); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } } };
  /** いまの1行を出す。返す値は、次の行までの待ち時間 */
  const step = (): number => {
    const it = items[st.i]; if (!it) return 0;
    if (st.li === 0) {
      busy = it.kind === 'goal' || it.kind === 'chance';
      const div = document.createElement('div');
      const who = it.who ? `<span class="who">${it.who}</span>` : '';
      const side = it.kind === 'goal' || it.kind === 'chance' ? (it.me ? ' me' : ' op') : '';
      div.className = `fe ${it.kind === 'goal' ? 'chance' : it.kind}${side}`;
      div.innerHTML = `<span class="m">${it.min}'</span><span class="t">${who}</span>`;
      feed.appendChild(div); st.cur = div;
      now.innerHTML = it.kind === 'goal' || it.kind === 'chance' ? `<span class="${it.me ? 'n-me' : 'n-op'}">${esc(it.me ? (meHome ? m.home.name : m.away.name) : (meHome ? m.away.name : m.home.name))}</span>の攻め（${it.min}分）` : `${it.min}分`;
    }
    const line = it.lines[st.li]; const last = st.li === it.lines.length - 1;
    const span = document.createElement('span'); span.className = 'ln'; span.innerHTML = lineHTML(line);
    const t = st.cur!.querySelector('.t')!; if (st.li > 0 || it.who) t.appendChild(document.createElement('br')); t.appendChild(span);
    feed.scrollTop = feed.scrollHeight;
    animate(it, line, st.li, last);
    st.li++;
    let wait = it.kind === 'talk' || it.kind === 'flow' || it.kind === 'memo' ? per * 0.75 : per;
    /* 結果の行の前は、少しためる */
    if (!last && st.li === it.lines.length - 1 && (it.kind === 'goal' || it.kind === 'chance')) wait *= 1.5;
    if (last) {
      st.i++; st.li = 0; setTimeout(() => { busy = false; lastPass = clock; }, 900 / st.speed);
      if (it.kind === 'goal' && it.goal) {
        st.sc = it.goal.score; showScore();
        st.cur!.classList.add('goal'); if (!it.goal.me) st.cur!.classList.add('opp');
        st.cur!.querySelector('.t')!.insertAdjacentHTML('afterbegin', `<b class="gol">ゴール！ ${it.goal.score[0]}-${it.goal.score[1]}</b><br>`);
        const gt = document.getElementById('goal-txt'); gt?.setAttribute('opacity', '1'); setTimeout(() => gt?.setAttribute('opacity', '0'), 2000);
        document.querySelector('.scoreboard')?.classList.add('shake'); setTimeout(() => document.querySelector('.scoreboard')?.classList.remove('shake'), 600);
        wait += 2600; const conceded = (1 - sideOfMe(it.goal.me)) as 0 | 1; setTimeout(() => reset(conceded), 2200 / st.speed);
      } else if (it.kind === 'chance') { st.cur!.insertAdjacentHTML('beforeend', ''); wait += 500; }
    }
    return wait;
  };
  const tick = () => {
    if (st.done) return;
    if (st.li > 0 || (st.i < items.length && items[st.i].min <= Math.max(st.t, 0))) {
      const w = step();
      timer = window.setTimeout(tick, w / st.speed); return;
    }
    st.t++;
    $('#clock').textContent = st.t > 90 ? `90+${st.t - 90}'` : `${Math.max(0, st.t)}'`;
    if (st.t % 3 === 0) { const fb = document.getElementById('flowbox'); if (fb) fb.innerHTML = flowSVG(m, st.t) + flowLegend(m); }
    /* 流れのグラフで押している側が、ボールを持ちやすい */
    if (!busy && st.t % 5 === 0 && m.flowG) { const v = m.flowG.pts[Math.min(m.flowG.pts.length - 1, Math.floor(st.t / 5))] ?? 0; if (Math.random() < 0.35 + Math.abs(v) * 0.4) possSide = v >= 0 ? 0 : 1; }
    if (st.t >= end && st.i >= items.length) { finish(); return; }
    timer = window.setTimeout(tick, 90 / st.speed);
  };
  const finish = () => {
    st.done = true; clearTimeout(timer);
    while (st.i < items.length) step();
    st.sc = [m.score[0], m.score[1]]; showScore();
    $('#clock').textContent = '試合終了'; now.textContent = '試合終了';
    const fb = document.getElementById('flowbox'); if (fb) fb.innerHTML = flowSVG(m, 95) + flowLegend(m);
    summary(m, res, meHome);
  };
  S.ui.match = { st, finish, after, setMode: (md: 'full' | 'hl') => { if (st.done) return; S.ui.mMode = md; const shown = st.i ? items[Math.min(st.i, items.length) - 1]?.min ?? -1 : -1; if (st.li > 0) { st.i++; st.li = 0; } items = order(md === 'hl' ? m.highlights : m.full); st.i = items.findIndex((x) => x.min > shown); if (st.i < 0) st.i = items.length; per = lineMs(); } };
  timer = window.setTimeout(tick, 600);
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
/** 2つの色が近すぎるか（同じような色のユニフォームなら、アウェーを白にする） */
function sameish(a: string, b: string) { const h = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); try { const [x, y] = [h(a), h(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 90; } catch { return false; } }
/** 白い面の上で読める色にする */
function readable(c: string) { try { let [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; if (L > 0.55) { const k = 0.55 / L * 0.75; r *= k; g *= k; b *= k; } return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); } catch { return '#1f7a5f'; } }
function ink(c: string) { try { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#18231e' : '#ffffff'; } catch { return '#ffffff'; } }
ACT.mSpd = (v) => { const c = S.ui.match; if (!c) return; c.st.speed = +v; S.ui.mSpeed = +v; };
ACT.mSkip = () => { const c = S.ui.match; if (c && !c.st.done) c.finish(); };
ACT.mFeed = (v) => { const c = S.ui.match; if (c) c.setMode(v); };
ACT.mClose = () => { const c = S.ui.match; clearTimeout(timer); $('#overlay').innerHTML = ''; S.ui.match = null; c?.after(); };
