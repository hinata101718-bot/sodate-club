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
    <div id="msum"></div></div></div>`;
  /* 実況の名前の色を、ユニフォームの色にそろえる（白っぽい色は読めないので、濃い色に） */
  const ov = document.querySelector('.match-ov') as HTMLElement;
  const myCol = readable(meHome ? hCol : aCol), opCol = readable(meHome ? aCol : hCol);
  ov.style.setProperty('--nm-me', myCol); ov.style.setProperty('--nm-op', opCol);
  const svg = document.querySelector('.mp') as SVGSVGElement;
  dots.forEach((d, i) => { d.el = svg.querySelector('#pl' + i) as SVGGElement; });
  const ball = svg.querySelector('#ball') as SVGCircleElement; const pass = svg.querySelector('#mp-pass') as SVGLineElement;
  const label = svg.querySelector('#mp-label') as SVGGElement; const lrect = svg.querySelector('#mp-lrect') as SVGRectElement; const ltext = svg.querySelector('#mp-ltext') as SVGTextElement;
  let bx = 52.5, by = 34;
  const setDot = (d: Dot, x: number, y: number) => { d.x = Math.max(2, Math.min(103, x)); d.y = Math.max(3, Math.min(65, y)); d.el!.style.transform = `translate(${d.x}px,${d.y}px)`; };
  const moveBall = (x: number, y: number, showPass = false) => {
    if (showPass) { pass.setAttribute('x1', String(bx)); pass.setAttribute('y1', String(by)); pass.setAttribute('x2', String(x)); pass.setAttribute('y2', String(y)); pass.setAttribute('opacity', '.7'); }
    bx = Math.max(1, Math.min(104, x)); by = Math.max(2, Math.min(66, y)); ball.style.transform = `translate(${bx}px,${by}px)`;
  };
  const tag = (d: Dot | null, text = '') => {
    if (!d) { label.setAttribute('opacity', '0'); return; }
    const t = text || d.name; const w = Math.max(14, t.length * 2.9 + 4);
    const lx = Math.max(w / 2 + 1, Math.min(104 - w / 2, d.x)); const ly = d.y > 12 ? d.y - 8 : d.y + 4.5;
    lrect.setAttribute('x', String(lx - w / 2)); lrect.setAttribute('y', String(ly)); lrect.setAttribute('width', String(w));
    ltext.setAttribute('x', String(lx)); ltext.setAttribute('y', String(ly + 3.6)); ltext.textContent = t; label.setAttribute('opacity', '1');
  };
  const dotOf = (name: string, me: boolean) => { const side = sideOfMe(me); return dots.find((d) => d.side === side && d.name === name) ?? dots.find((d) => d.name === name) ?? null; };
  const goalX = (side: 0 | 1) => (side === 0 ? 103 : 2);
  /** 攻めている側を前へ、守る側を下げる（ボールの近くの選手はボールへ寄る） */
  const shape = (atk: 0 | 1 | null, depth: number) => {
    for (const d of dots) {
      if (d.pos === 'GK') { setDot(d, d.bx + (atk === null ? 0 : (d.side === atk ? 1 : -1) * (d.side === 0 ? 1 : -1) * 2), 34 + (by - 34) * 0.15); continue; }
      const dir = d.side === 0 ? 1 : -1;
      const push = atk === null ? 0 : d.side === atk ? 9 + depth * 10 : -(4 + depth * 6);
      let x = d.bx + dir * push, y = d.by + (by - 34) * 0.18;
      const dist = Math.hypot(x - bx, y - by);
      if (dist < 20) { const k = (20 - dist) / 20 * 0.35; x += (bx - x) * k; y += (by - y) * k; }
      setDot(d, x, y);
    }
  };
  /** 1行の中身から、ボールと選手を動かす */
  const animate = (it: ViewItem, line: Line, idx: number, last: boolean) => {
    const txt = textOf(line); const names = line.map(tokName).filter((x): x is { t: string; me: boolean } => !!x);
    const atkSide: 0 | 1 | null = it.kind === 'goal' || it.kind === 'chance' ? sideOfMe(it.me) : null;
    const depth = Math.min(1, idx / 3);
    pass.setAttribute('opacity', '0');
    if (last && atkSide !== null && RES_GOAL.test(txt) && it.kind === 'goal') { moveBall(goalX(atkSide), 34 + (Math.random() - 0.5) * 4); shape(atkSide, 1); tag(null); return; }
    if (atkSide !== null && RES_SAVE.test(txt)) { const gk = dots.find((d) => d.side !== atkSide && d.pos === 'GK'); if (gk) { moveBall(gk.x + (atkSide === 0 ? -1.5 : 1.5), gk.y); tag(gk); } shape(atkSide, 1); return; }
    if (atkSide !== null && RES_MISS.test(txt)) { moveBall(atkSide === 0 ? 104 : 1, 34 + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8)); shape(atkSide, 1); tag(null); return; }
    const who = names.length ? dotOf(names[0].t, names[0].me) : null;
    if (who) {
      const isShot = atkSide !== null && SHOT.test(txt);
      if (atkSide !== null && who.side === atkSide) { const fwd = atkSide === 0 ? 1 : -1; setDot(who, who.x + fwd * (isShot ? 6 : 3), who.y); }
      moveBall(who.x + (who.side === 0 ? 1.4 : -1.4), who.y, !!names.length && idx > 0);
      shape(atkSide, depth);
      setDot(who, bx - (who.side === 0 ? 1.4 : -1.4), by);
      tag(who);
      if (isShot) setTimeout(() => moveBall(bx + (atkSide === 0 ? 6 : -6), by + (34 - by) * 0.3, true), 380);
      /* 2人目（パスの受け手・競り合う相手）も近くへ */
      if (names[1]) { const d2 = dotOf(names[1].t, names[1].me); if (d2 && d2 !== who) setDot(d2, bx + (d2.side === 0 ? -3 : 3) * (d2.side === who.side ? -2 : 1), by + (d2.y > by ? 3 : -3)); }
    } else if (atkSide === null) { shape(null, 0); tag(null); if (/キックオフ|後半/.test(txt)) moveBall(52.5, 34); }
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
      st.i++; st.li = 0;
      if (it.kind === 'goal' && it.goal) {
        st.sc = it.goal.score; showScore();
        st.cur!.classList.add('goal'); if (!it.goal.me) st.cur!.classList.add('opp');
        st.cur!.querySelector('.t')!.insertAdjacentHTML('afterbegin', `<b class="gol">ゴール！ ${it.goal.score[0]}-${it.goal.score[1]}</b><br>`);
        const gt = document.getElementById('goal-txt'); gt?.setAttribute('opacity', '1'); setTimeout(() => gt?.setAttribute('opacity', '0'), 2000);
        document.querySelector('.scoreboard')?.classList.add('shake'); setTimeout(() => document.querySelector('.scoreboard')?.classList.remove('shake'), 600);
        wait += 2600;
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
    if (st.t % 3 === 0) { const fb = document.getElementById('flowbox'); if (fb) fb.innerHTML = flowSVG(m, st.t) + flowLegend(m); if (Math.random() < 0.5) { moveBall(35 + Math.random() * 35, 14 + Math.random() * 40); shape(null, 0); tag(null); } }
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
