/* 試合の画面（FM型：試合のエンジンを、その場で動かして見る）
   - 22人とボールは、エンジンが動かしている本当の位置（src/core/sim.ts）。画面は、それをなめらかにつないで描くだけ
   - 時計は試合の時間で進む。「ふつう」は本当の90分。2倍・4倍・6倍・10倍
   - 実況は、エンジンで起きたプレー（パス・ドリブル・競り合い・シュート・特殊能力）から、その時刻に出る
   - 「見どころだけ」：エンジンを先に進め、大きなチャンスやゴールが起きたら、その少し前から見せる（位置の記録を巻きもどす）
   - 作戦ボード：一時停止・並び方・戦い方・攻めと守りの方針・交代（ヘッドコーチに任せることもできる）
   - 終わったら試合の図（流れ・シュート・1対1・交代・評価点） */
import { S, ACT, CHANGE, $, esc, posTag, fmt, G, toast } from './util';
import { lineHTML } from '../ui/dom';
import { flowSVG, flowLegend, statsHTML, shotMapHTML, bindShotMap, duelMapHTML, subsHTML, cardsHTML } from '../ui/matchgfx';
import { emblemSVG } from '../ui/emblem';
import { SIM, type Ag, type Tap } from '../core/sim';
import { FORM, STYLE_NAMES, STYLES, type StyleName } from '../core/constants';
import type { MatchView } from '../core/types';
import type { LiveMatch, PlayResult } from '../core/game';

const SPEEDS = [1, 2, 4, 6, 10];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mmss = (clk: number, half: number) => { const t = Math.max(0, Math.floor(clk)); const m = Math.floor(t / 60), s = t % 60; const cap = half === 1 ? 45 : 90; return m >= cap ? `${cap}+${m - cap + 1}'` : `${m}:${String(s).padStart(2, '0')}`; };

export function playLive(L: LiveMatch, finishWeek: () => PlayResult, after: (res: PlayResult) => void) {
  const g = G(); const sim = L.sim; const sides = sim.sides;
  const meK = sides[0].t.me ? 0 : 1; const meHome = meK === 0;
  const clubOf = (id: number) => g.clubs.find((c) => c.id === id);
  const hc = clubOf(L.homeId), ac = clubOf(L.awayId);
  const hCol = sides[0].t.color; const aCol0 = sides[1].t.color;
  const aCol = sameish(aCol0, hCol) ? (['#2f6db3', '#c3423d', '#e0a21a', '#6b3fa0'].find((c) => !sameish(c, hCol)) ?? '#2f6db3') : aCol0;
  const col = (k: number) => (k === 0 ? hCol : aCol);
  const name = (k: number) => sides[k].t.name;

  /* ---- ピッチ ---- */
  const pl = sim.ags.map((a, i) => `<g class="mp-pl" id="pl${i}"><circle r="1.9" fill="${col(a.k)}" stroke="${a.k === 0 ? '#ffffff' : '#18231e'}" stroke-width=".4"/><text y=".8" text-anchor="middle" font-size="2.05" font-weight="700" fill="${ink(col(a.k))}" id="pn${i}">${a.o.p.num || ''}</text></g>`).join('');
  const pitch = `<svg class="hpitch mp" viewBox="0 0 105 68" aria-label="ピッチ。${esc(name(0))}は右へ、${esc(name(1))}は左へ攻める"><defs><pattern id="mow" width="21" height="68" patternUnits="userSpaceOnUse"><rect width="10.5" height="68" fill="#348457"/><rect x="10.5" width="10.5" height="68" fill="#2f7a50"/></pattern></defs>
    <rect width="105" height="68" fill="url(#mow)"/><g fill="none" stroke="rgba(255,255,255,.7)" stroke-width=".35"><rect x="0.5" y="0.5" width="104" height="67"/><line x1="52.5" y1="0.5" x2="52.5" y2="67.5"/><circle cx="52.5" cy="34" r="9.15"/><rect x="0.5" y="13.85" width="16.5" height="40.3"/><rect x="0.5" y="24.85" width="5.5" height="18.3"/><rect x="88" y="13.85" width="16.5" height="40.3"/><rect x="99" y="24.85" width="5.5" height="18.3"/></g>
    <rect x="-1" y="30.34" width="1.5" height="7.32" fill="#fff"/><rect x="104.5" y="30.34" width="1.5" height="7.32" fill="#fff"/>
    <line id="mp-pass" x1="0" y1="0" x2="0" y2="0" stroke="#fff" stroke-width=".35" stroke-dasharray="1 .8" opacity="0"/>
    ${pl}
    <circle id="ball" r=".95" fill="#fff" stroke="#18231e" stroke-width=".3"/>
    <g id="mp-label" opacity="0"><rect id="mp-lrect" x="0" y="0" width="30" height="4.2" rx="1.1" fill="rgba(24,35,30,.8)"/><text id="mp-ltext" x="0" y="3" font-size="2.4" fill="#fff" text-anchor="middle"></text></g>
    <text id="goal-txt" x="52.5" y="38" text-anchor="middle" font-size="12" font-weight="800" fill="#ffd34d" stroke="#18231e" stroke-width=".4" opacity="0" style="transition:opacity .3s">GOAL!</text>
    <text id="mp-banner" x="52.5" y="8" text-anchor="middle" font-size="3.4" font-weight="700" fill="#fff" stroke="rgba(24,35,30,.6)" stroke-width=".25" opacity="0" style="transition:opacity .3s"></text></svg>`;
  const spBtns = SPEEDS.map((v) => `<button class="btn small" data-act="mSpd" data-arg="${v}">${v === 1 ? 'ふつう（90分）' : v + '倍'}</button>`).join('');
  $('#overlay').innerHTML = `<div class="match-ov"><div class="match-box mp-box">
    <div class="row between"><span class="eyebrow">${esc(sim.opts.title ?? '')}</span><span class="speed"><button class="btn small" data-act="mPause" id="mp-pause">一時停止</button><button class="btn small" data-act="mFeed" data-arg="hl" id="mp-hl" title="ゴールと、大きなチャンス・退場だけを、その少し前から見る">見どころだけ</button><button class="btn small" data-act="mFeed" data-arg="full" id="mp-full">試合をすべて</button><span class="muted small">速さ</span>${spBtns}<button class="btn small primary" data-act="mSkip">結果へ</button></span></div>
    <div class="scoreboard"><div class="side"><span class="kit" style="background:${hCol}"></span>${hc ? `<span class="emb">${emblemSVG(hc.me ? g.club.emblem : hc.emblem)}</span>` : ''}<span class="tn" style="color:var(${sides[0].t.me ? '--nm-me' : '--nm-op'})">${esc(name(0))}</span><span class="muted small">→ 右へ攻める</span></div><div><div class="sc"><span id="sc0">0</span><span class="dash">-</span><span id="sc1">0</span></div><div class="clock" id="clock">0:00</div><div class="muted small" id="mp-left" style="text-align:center"></div></div><div class="side away"><span class="muted small">左へ攻める ←</span><span class="tn" style="color:var(${sides[1].t.me ? '--nm-me' : '--nm-op'})">${esc(name(1))}</span>${ac ? `<span class="emb">${emblemSVG(ac.me ? g.club.emblem : ac.emblem)}</span>` : ''}<span class="kit" style="background:${aCol}"></span></div></div>
    <div class="mp-main"><div class="grid" style="gap:12px;align-content:start">${pitch}<div class="row between small muted" id="mp-mini"></div><div class="panel" id="flowbox"></div></div>
    <div class="grid" style="gap:12px;align-content:start"><div class="panel mp-feedbox"><div class="mp-now" id="mp-now">キックオフを待っている……</div><div class="feed mp-feed" id="feed" aria-live="polite"></div></div>
    <div class="panel" id="mp-board"></div></div></div>
    <div class="muted small">選手とボールは、試合のエンジンが能力・戦術・疲れから動かしている。立ち位置とボール回しの傾向は、実際の試合の位置データ（SkillCorner）とイベントデータ（StatsBomb）から学んだもの</div>
    <div id="msum"></div></div></div>`;
  const ov = document.querySelector('.match-ov') as HTMLElement;
  ov.style.setProperty('--nm-me', readable(col(meK))); ov.style.setProperty('--nm-op', readable(col(1 - meK)));
  const svg = document.querySelector('.mp') as SVGSVGElement;
  const els = sim.ags.map((_, i) => svg.querySelector('#pl' + i) as SVGGElement);
  const nums = sim.ags.map((_, i) => svg.querySelector('#pn' + i) as SVGTextElement);
  const ballEl = svg.querySelector('#ball') as SVGCircleElement; const passEl = svg.querySelector('#mp-pass') as SVGLineElement;
  const label = svg.querySelector('#mp-label') as SVGGElement; const lrect = svg.querySelector('#mp-lrect') as SVGRectElement; const ltext = svg.querySelector('#mp-ltext') as SVGTextElement;
  const banner = svg.querySelector('#mp-banner') as SVGTextElement;
  const feed = $('#feed'); const now = $('#mp-now');

  /* ---- 状態 ---- */
  const st = { speed: S.ui.mSpeed ?? 1, mode: (S.ui.mMode ?? 'full') as 'full' | 'hl', paused: false, done: false, disp: sim.T, sc: [0, 0] as [number, number],
    /** 見どころだけ：今見せている区間の終わり（エンジンの時間）。null なら先へ飛ばしている */
    seg: null as null | { end: number }, hlSeen: 0, skipFrom: 0 };
  let tp = 0; const groups = new Map<number, HTMLElement>();
  const flash = (t: string, sec = 1.6) => { banner.textContent = t; banner.setAttribute('opacity', '1'); setTimeout(() => banner.setAttribute('opacity', '0'), sec * 1000); };
  const showScore = (sc: [number, number]) => { for (const k of [0, 1] as const) { const el = $('#sc' + k); if (el.textContent !== String(sc[k])) { el.textContent = String(sc[k]); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } } st.sc = sc; };

  /** 実況の1行を出す */
  const put = (t: Tap, quiet = false) => {
    let box = t.gid != null ? groups.get(t.gid) : undefined;
    if (!box) {
      box = document.createElement('div');
      const side = t.kind === 'play' ? (t.me ? ' me' : ' op') : '';
      box.className = `fe ${t.kind === 'play' ? 'chance' : t.kind}${side}`;
      box.innerHTML = `<span class="m">${t.min}'</span><span class="t">${t.who ? `<span class="who">${t.who}</span>` : ''}</span>`;
      feed.appendChild(box); if (t.gid != null) groups.set(t.gid, box);
      if (feed.children.length > 160) feed.removeChild(feed.firstChild!);
    }
    const span = document.createElement('span'); span.className = 'ln'; span.innerHTML = lineHTML(t.line);
    const tt = box.querySelector('.t')!; if (tt.querySelector('.ln')) tt.appendChild(document.createElement('br')); tt.appendChild(span);
    feed.scrollTop = feed.scrollHeight;
    if (t.kind === 'play') now.innerHTML = `<span class="${t.me ? 'n-me' : 'n-op'}">${esc(name(t.k ?? 0))}</span>の攻め`;
    if (t.goal) {
      showScore(t.goal); box.classList.add('goal'); if (!t.me) box.classList.add('opp');
      tt.insertAdjacentHTML('afterbegin', `<b class="gol">ゴール！ ${t.goal[0]}-${t.goal[1]}</b><br>`);
      if (!quiet) { const gt = document.getElementById('goal-txt'); gt?.setAttribute('opacity', '1'); setTimeout(() => gt?.setAttribute('opacity', '0'), 2200); document.querySelector('.scoreboard')?.classList.add('shake'); setTimeout(() => document.querySelector('.scoreboard')?.classList.remove('shake'), 600); }
    }
  };
  /** upto の時刻までの行を出す（skip：見どころのあいだを飛ばしているときは、大事な行だけ） */
  const flushTap = (upto: number, skip = false) => {
    while (tp < sim.tap.length && sim.tap[tp].T <= upto) { const t = sim.tap[tp++]; if (!skip || t.imp) put(t, skip); else if (t.goal) showScore(t.goal); }
  };

  /* ---- 描く ---- */
  const nf = sim.ags.length;
  const rep = new Float32Array(nf * 2 + 2);
  /** 巻きもどして見せるときの位置（記録の間をつなぐ）。記録より新しければ null（エンジンの今の位置を使う） */
  const posAt = (T: number): Float32Array | null => {
    const F = sim.frames; if (!F.length || T >= F[F.length - 1].t - 0.01) return null;
    let i = F.length - 1; while (i > 0 && F[i - 1].t > T) i--;
    if (i === 0) return F[0].p;
    const a = F[i - 1], b = F[i]; const u = clamp((T - a.t) / Math.max(0.01, b.t - a.t), 0, 1);
    for (let j = 0; j < a.p.length; j++) rep[j] = a.p[j] + (b.p[j] - a.p[j]) * u; return rep;
  };
  let labelFor: Ag | null = null;
  const draw = () => {
    const R = sim.T - st.disp > SIM.liveDt + 0.05 ? posAt(st.disp) : null;
    const alpha = clamp(1 - (sim.T - st.disp) / SIM.liveDt, 0, 1);
    for (let i = 0; i < nf; i++) {
      const a = sim.ags[i]; let x: number, y: number;
      if (R) { x = R[i * 2]; y = R[i * 2 + 1]; } else { x = a.px + (a.x - a.px) * alpha; y = a.py + (a.y - a.py) * alpha; }
      els[i].style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`; els[i].style.opacity = a.out ? '0' : '1';
      const n = String(a.o.p.num || ''); if (nums[i].textContent !== n) nums[i].textContent = n;
    }
    const B = sim.ball; let bx: number, by: number;
    if (R) { bx = R[nf * 2]; by = R[nf * 2 + 1]; } else { bx = B.px + (B.x - B.px) * alpha; by = B.py + (B.y - B.py) * alpha; }
    ballEl.style.transform = `translate(${bx.toFixed(2)}px,${by.toFixed(2)}px)`;
    if (!R && B.st === 'air' && B.t1 - B.t0 > 0.5) { passEl.setAttribute('x1', B.fx.toFixed(1)); passEl.setAttribute('y1', B.fy.toFixed(1)); passEl.setAttribute('x2', B.tx.toFixed(1)); passEl.setAttribute('y2', B.ty.toFixed(1)); passEl.setAttribute('opacity', '.45'); }
    else passEl.setAttribute('opacity', '0');
    /* ボールを持っている選手の名前 */
    const h = !R && B.st === 'held' ? B.h : null;
    if (h) {
      if (labelFor !== h) { labelFor = h; ltext.textContent = h.o.p.name; }
      const w = Math.max(12, (ltext.textContent ?? '').length * 2.5 + 3); const hx = h.px + (h.x - h.px) * alpha, hy = h.py + (h.y - h.py) * alpha;
      const lx = clamp(hx, w / 2 + 1, 104 - w / 2); const ly = hy > 9 ? hy - 6.6 : hy + 3.2;
      lrect.setAttribute('x', String(lx - w / 2)); lrect.setAttribute('y', String(ly)); lrect.setAttribute('width', String(w)); ltext.setAttribute('x', String(lx)); ltext.setAttribute('y', String(ly + 3)); label.setAttribute('opacity', '1');
    } else label.setAttribute('opacity', '0');
  };
  let miniT = -99;
  const mini = (force = false) => {
    if (!force && sim.T - miniT < 2) return; miniT = sim.T;
    const tot = Math.max(1, sim.possT[0] + sim.possT[1]); const P = Math.round((sim.possT[0] / tot) * 100);
    const sh = sides.map((s) => [...s.st.values()].reduce((t, x) => t + x.sh, 0)); const ot = sides.map((s) => [...s.st.values()].reduce((t, x) => t + x.ot, 0));
    $('#mp-mini').innerHTML = `<span>ボールを持った時間 <b class="num">${P}%</b> - <b class="num">${100 - P}%</b></span><span>シュート <b class="num">${sh[0]}</b>（枠内 ${ot[0]}） - <b class="num">${sh[1]}</b>（枠内 ${ot[1]}）</span><span>コーナー <b class="num">${sides[0].corners}</b> - <b class="num">${sides[1].corners}</b></span>`;
    const pts: number[] = []; for (let b = 0; b < 18; b++) { let v = 0; for (let m = b * 5 + 1; m <= b * 5 + 5; m++) v += sim.pg[m] ?? 0; pts.push(Math.round(Math.tanh(v / 4) * 100) / 100); }
    const mv = { home: { name: name(0), me: sides[0].t.me, color: hCol }, away: { name: name(1), me: sides[1].t.me, color: aCol }, flowG: { pts, marks: sim.marks } } as unknown as MatchView;
    $('#flowbox').innerHTML = flowSVG(mv, sim.minute()) + flowLegend(mv);
  };

  /* ---- 作戦ボード ---- */
  const S2 = sides[meK];
  let pickOff: number | null = null, pickOn: number | null = null;
  const board = () => {
    const mine = sim.ags.filter((a) => a.k === meK && !a.out);
    const queued = sim.subQ.filter((q) => q.k === meK);
    const left = 5 - S2.subs - queued.length;
    const tilt = sim.ord[meK].tilt ?? null;
    const forms = Object.keys(FORM).map((f) => `<option value="${f}"${f === S2.form ? ' selected' : ''}>${f}</option>`).join('');
    const styles = STYLE_NAMES.map((s) => `<option value="${s}"${s === S2.style ? ' selected' : ''}>${s}（${STYLES[s].note}）</option>`).join('');
    const rows = mine.map((a) => { const en = Math.round(a.en * 100); const stt = S2.st.get(a.o.p); return `<tr class="${pickOff === a.o.p.id ? 'sel' : ''}" data-act="mOff" data-arg="${a.o.p.id}" style="cursor:pointer"><td>${posTag(a.o.pos)}</td><td>${esc(a.o.p.name)}${stt?.yc ? ' <span class="chip" style="background:#f3d36b">黄</span>' : ''}</td><td class="r"><div class="bar" style="width:52px;display:inline-block" title="体力 ${en}"><i style="width:${en}%;background:${en > 80 ? 'var(--good)' : en > 68 ? 'var(--warn)' : 'var(--bad)'}"></i></div></td></tr>`; }).join('');
    const bench = S2.bench.filter((p) => p.inj === 0).map((p) => `<tr class="${pickOn === p.id ? 'sel' : ''}" data-act="mOn" data-arg="${p.id}" style="cursor:pointer"><td>${posTag(p.pos)}</td><td>${esc(p.name)}</td><td class="r num">${Math.round(p.a.reduce((s, v) => s + v, 0) / 8)}</td></tr>`).join('');
    $('#mp-board').innerHTML = `<div class="panel-h"><h2>作戦ボード</h2><span class="muted small">変えると、すぐに選手の動きが変わる</span></div>
      <div class="grid g2" style="gap:8px"><label class="small">並び方<select data-change="mForm">${forms}</select></label><label class="small">戦い方<select data-change="mStyle">${styles}</select></label></div>
      <div class="row" style="gap:6px;margin:8px 0"><span class="small muted">方針</span>${([['atk', '攻撃的'], [null, 'バランス'], ['def', '守備的']] as const).map(([v, t]) => `<button class="btn small${tilt === v ? ' sel' : ''}" data-act="mTilt" data-arg="${v ?? ''}">${t}</button>`).join('')}</div>
      <div class="row between small"><b>交代（のこり${Math.max(0, left)}人）</b><label class="small"><input type="checkbox" data-change="mAuto"${sim.autoSub[meK] ? ' checked' : ''}> ヘッドコーチに任せる</label></div>
      ${queued.length ? `<div class="small" style="color:var(--data)">予約：${queued.map((q) => `${esc(q.off.name)} → ${esc(q.on.name)}`).join('、')}（次にボールが止まったとき）</div>` : ''}
      <div class="small muted">ピッチの選手とベンチの選手を1人ずつ選んで「交代を予約」</div>
      <div class="grid g2" style="gap:8px;align-items:start"><div class="tbl-wrap" style="max-height:230px;overflow:auto"><table class="tbl small"><thead><tr><th></th><th>ピッチ</th><th class="r">体力</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="tbl-wrap" style="max-height:230px;overflow:auto"><table class="tbl small"><thead><tr><th></th><th>ベンチ</th><th class="r">力</th></tr></thead><tbody>${bench || '<tr><td colspan="3" class="muted">いない</td></tr>'}</tbody></table></div></div>
      <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn small primary" data-act="mSub"${pickOff != null && pickOn != null && left > 0 ? '' : ' disabled'}>交代を予約</button></div>`;
  };
  let boardT = -99;

  /* ---- 毎フレーム ---- */
  let lastT = performance.now(); let halfShown = false;
  /** 止まらない時間 T のときの時計（巻きもどして見せるとき用） */
  const clkAt = (T: number) => sim.clk - (sim.T - T);
  const frame = (tnow: number) => {
    if (!document.body.contains(svg)) return;
    const real = Math.min(0.1, (tnow - lastT) / 1000); lastT = tnow;
    if (!st.done && !st.paused) {
      if (st.mode === 'hl' && !st.seg) {
        /* 先へ飛ばす：次の見どころが出るまで、エンジンだけ進める（1フレームに少しずつ） */
        const t0 = performance.now();
        while (!sim.over && sim.hlNew.length <= st.hlSeen && performance.now() - t0 < 12) sim.step(SIM.liveDt);
        flushTap(sim.T, true); st.disp = sim.T;
        $('#clock').textContent = mmss(sim.clk, sim.half); $('#mp-left').textContent = sim.over ? '' : `見どころをさがしている… ${sim.minute()}分`;
        if (sim.hlNew.length > st.hlSeen) {
          const h = sim.hlNew[st.hlSeen]; st.hlSeen = sim.hlNew.length;
          const start = Math.max(h.start, sim.frames[0]?.t ?? h.start, st.skipFrom);
          st.disp = start; st.seg = { end: h.T + (h.hv >= 100 ? 7 : 3.5) };
          /* 見せる区間より前の行は、大事なものだけ出しておく */
          tp = sim.tap.findIndex((t) => t.T > start); if (tp < 0) tp = sim.tap.length;
          flash(`${Math.min(sim.half === 1 ? 45 : 90, Math.floor(clkAt(start) / 60) + 1)}分の見どころ`);
        }
      } else {
        st.disp += real * st.speed;
        while (sim.T < st.disp && !sim.over) sim.step(SIM.liveDt);
        if (st.disp > sim.T) st.disp = sim.T;
        flushTap(st.disp);
        if (st.seg && st.disp >= st.seg.end) { st.seg = null; st.skipFrom = st.disp; }
        $('#clock').textContent = mmss(clkAt(st.disp), sim.half);
        $('#mp-left').textContent = st.mode === 'hl' ? '見どころ' : `のこり約${Math.max(1, Math.ceil(((95 * 60 - (sim.half === 1 ? sim.clk : sim.clk + 300)) / st.speed) / 60))}分（いまの速さ）`;
      }
      if (sim.half === 2 && !halfShown) { halfShown = true; flash('後半キックオフ', 2.2); }
      mini();
      if (sim.T - boardT > 3) { boardT = sim.T; if (!document.activeElement?.closest('#mp-board')) board(); }
      if (sim.over && (st.mode === 'hl' ? !st.seg : st.disp >= sim.T - 0.01)) finish();
    }
    draw();
    requestAnimationFrame(frame);
  };
  let res: PlayResult | null = null;
  const finish = () => {
    if (st.done) return; st.done = true;
    if (!sim.over) sim.run();
    flushTap(Infinity, true);
    res = finishWeek();
    const m = res.match!;
    showScore([m.score[0], m.score[1]]); mini(true);
    $('#clock').textContent = '試合終了'; now.textContent = '試合終了'; $('#mp-left').textContent = '';
    const fb = document.getElementById('flowbox'); if (fb) fb.innerHTML = flowSVG(m, 95) + flowLegend(m);
    $('#mp-board').innerHTML = '';
    summary(m, res, meHome);
  };
  const setMode = (md: 'full' | 'hl') => { if (st.done) return; S.ui.mMode = md; st.mode = md; st.seg = null; st.disp = sim.T; if (md === 'hl') { st.hlSeen = sim.hlNew.length; st.skipFrom = sim.T; } document.getElementById('mp-hl')?.classList.toggle('sel', md === 'hl'); document.getElementById('mp-full')?.classList.toggle('sel', md === 'full'); };
  const markSpeed = () => document.querySelectorAll<HTMLElement>('[data-act=mSpd]').forEach((b) => b.classList.toggle('sel', +b.dataset.arg! === st.speed));
  const pause = (v?: boolean) => { st.paused = v ?? !st.paused; const b = document.getElementById('mp-pause'); if (b) { b.textContent = st.paused ? '再開' : '一時停止'; b.classList.toggle('sel', st.paused); } if (st.paused) board(); };
  const order = (f: () => void) => { if (st.done) return; f(); boardT = -99; board(); };
  S.ui.match = {
    st, finish, setMode, markSpeed, pause, after: () => { if (res) after(res); },
    form: (v: string) => order(() => sim.order(meK as 0 | 1, { form: v })),
    style: (v: StyleName) => order(() => sim.order(meK as 0 | 1, { style: v })),
    tilt: (v: 'atk' | 'def' | null) => order(() => sim.order(meK as 0 | 1, { tilt: v })),
    auto: (v: boolean) => order(() => { sim.autoSub[meK] = v; }),
    off: (id: number) => order(() => { pickOff = pickOff === id ? null : id; }),
    on: (id: number) => order(() => { pickOn = pickOn === id ? null : id; }),
    sub: () => order(() => { if (pickOff == null || pickOn == null) return; const e = sim.sub(meK as 0 | 1, pickOff, pickOn); if (e) toast('交代できない', e, 'warn'); else { toast('交代を予約した', '次にボールが止まったときに入る'); pickOff = pickOn = null; } }),
    probe: () => ({ T: sim.T, disp: st.disp, clk: sim.clk, half: sim.half, bx: sim.ball.x, by: sim.ball.y, bst: sim.ball.st, score: [sides[0].goals, sides[1].goals], over: sim.over, taps: sim.tap.length, shown: tp, hl: sim.hlNew.length, seg: st.seg, form: sides[meK].form, style: sides[meK].style, tilt: sim.ord[meK].tilt, subs: sides[meK].subs, done: st.done }),
  };
  (window as unknown as { __mp?: unknown }).__mp = S.ui.match;
  markSpeed(); setMode(st.mode); board(); mini(true);
  flushTap(sim.T);
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
ACT.mPause = () => { S.ui.match?.pause(); };
ACT.mTilt = (v) => { S.ui.match?.tilt(v === 'atk' || v === 'def' ? v : null); };
ACT.mOff = (v) => { S.ui.match?.off(+v); };
ACT.mOn = (v) => { S.ui.match?.on(+v); };
ACT.mSub = () => { S.ui.match?.sub(); };
CHANGE.mForm = (v) => { S.ui.match?.form(v); };
CHANGE.mStyle = (v) => { S.ui.match?.style(v as StyleName); };
CHANGE.mAuto = (_v, _a, el) => { S.ui.match?.auto((el as HTMLInputElement).checked); };
ACT.mClose = () => { const c = S.ui.match; $('#overlay').innerHTML = ''; S.ui.match = null; c?.after(); };
