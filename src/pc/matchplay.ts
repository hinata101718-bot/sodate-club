/* 試合の画面：頂点への道のピッチとスコアボードに、育ての街の実況・解説を流す。終わったら試合の図（流れ・シュート・1対1・交代・評価点） */
import { S, ACT, $, esc, posTag, yen, fmt } from './util';
import { lineHTML } from '../ui/dom';
import { flowSVG, flowLegend, statsHTML, shotMapHTML, bindShotMap, duelMapHTML, subsHTML, cardsHTML } from '../ui/matchgfx';
import { emblemSVG } from '../ui/emblem';
import { G } from './util';
import type { MatchView, ViewItem } from '../core/types';
import type { PlayResult } from '../core/game';

let timer = 0;
export function playMatch(m: MatchView, res: PlayResult, after: () => void) {
  const g = G(); const meHome = m.home.me;
  const clubOf = (name: string) => g.clubs.find((c) => (c.me ? g.club.name : c.name) === name);
  const hc = clubOf(m.home.name), ac = clubOf(m.away.name);
  const hCol = m.home.me ? g.club.color : m.home.color; const aCol0 = m.away.me ? g.club.color : m.away.color; const aCol = aCol0 === hCol ? '#e8eef0' : aCol0;
  const pitch = `<svg class="hpitch" viewBox="0 0 105 68" aria-label="ピッチ"><defs><pattern id="mow" width="21" height="68" patternUnits="userSpaceOnUse"><rect width="10.5" height="68" fill="#348457"/><rect x="10.5" width="10.5" height="68" fill="#2f7a50"/></pattern></defs>
    <rect width="105" height="68" fill="url(#mow)"/><g fill="none" stroke="rgba(235,245,240,.55)" stroke-width=".4"><rect x="1.5" y="1.5" width="102" height="65"/><line x1="52.5" y1="1.5" x2="52.5" y2="66.5"/><circle cx="52.5" cy="34" r="9.15"/><rect x="1.5" y="13.85" width="16.5" height="40.3"/><rect x="1.5" y="24.85" width="5.5" height="18.3"/><rect x="87" y="13.85" width="16.5" height="40.3"/><rect x="98" y="24.85" width="5.5" height="18.3"/></g>
    <rect x="0" y="30.3" width="1.5" height="7.4" fill="${hCol}"/><rect x="103.5" y="30.3" width="1.5" height="7.4" fill="${aCol}"/>
    <circle id="ball-trail" cx="52.5" cy="34" r="3" fill="#fff" opacity=".12"/><circle id="ball" cx="52.5" cy="34" r="1.3" fill="#fff" stroke="#0a0f0c" stroke-width=".3" style="transition:cx .45s ease, cy .45s ease"/>
    <text id="goal-txt" x="52.5" y="38" text-anchor="middle" font-size="12" font-weight="700" fill="#f4b942" opacity="0" style="transition:opacity .3s">GOAL!</text></svg>`;
  $('#overlay').innerHTML = `<div class="match-ov"><div class="match-box">
    <div class="row between"><span class="eyebrow">${esc(m.title)}</span><span class="speed"><button class="btn small" data-act="mFeed" data-arg="hl">見どころだけ</button><button class="btn small" data-act="mFeed" data-arg="full">実況をすべて</button><span class="muted small">速さ</span><button class="btn small" data-act="mSpd" data-arg="1">ふつう</button><button class="btn small" data-act="mSpd" data-arg="2.5">速い</button><button class="btn small" data-act="mSpd" data-arg="6">とても速い</button><button class="btn small primary" data-act="mSkip">結果へ</button></span></div>
    <div class="scoreboard"><div class="side">${hc ? `<span class="emb">${emblemSVG(hc.me ? g.club.emblem : hc.emblem)}</span>` : ''}<span class="tn" style="color:${m.home.me ? 'var(--nm-me)' : 'var(--nm-op)'}">${esc(m.home.name)}</span></div><div><div class="sc"><span id="sc0">0</span><span class="dash">-</span><span id="sc1">0</span></div><div class="clock" id="clock">0'</div></div><div class="side away"><span class="tn" style="color:${m.away.me ? 'var(--nm-me)' : 'var(--nm-op)'}">${esc(m.away.name)}</span>${ac ? `<span class="emb">${emblemSVG(ac.me ? g.club.emblem : ac.emblem)}</span>` : ''}</div></div>
    <div class="match-main"><div class="grid" style="gap:10px">${pitch}<div class="panel" id="flowbox">${flowSVG(m, 0)}${flowLegend(m)}</div></div>
    <div class="panel"><div class="feed" id="feed" aria-live="polite" style="height:420px"></div></div></div>
    <div id="msum"></div></div></div>`;
  const st = { t: -1, i: 0, sc: [0, 0] as [number, number], speed: S.ui.mSpeed ?? 1, done: false, mode: S.ui.mMode ?? 'full' as 'full' | 'hl' };
  let items: ViewItem[] = [...(st.mode === 'hl' ? m.highlights : m.full)].sort((a, b) => a.min - b.min || (a.ord ?? 0) - (b.ord ?? 0));
  const end = Math.max(90, ...items.map((x) => x.min));
  const feed = $('#feed'); const ball = document.getElementById('ball')!; const trail = document.getElementById('ball-trail')!;
  const move = (x: number, y: number) => { const bx = Math.max(2, Math.min(103, x)), by = Math.max(4, Math.min(64, y)); ball.setAttribute('cx', String(bx)); ball.setAttribute('cy', String(by)); trail.setAttribute('cx', String(bx)); trail.setAttribute('cy', String(by)); };
  const atkX = (me: boolean) => { const homeAtk = me ? meHome : !meHome; return homeAtk ? 80 + Math.random() * 14 : 11 + Math.random() * 14; };
  const shotAt = (min: number, me: boolean) => { const side = (me ? meHome : !meHome) ? 0 : 1; return (m.shots ?? []).find((s) => s.min === min && s.side === side); };
  const add = (it: ViewItem) => {
    const div = document.createElement('div');
    const who = it.who ? `<span class="who">${it.who}</span>` : '';
    const side = it.kind === 'goal' || it.kind === 'chance' ? (it.me ? ' me' : ' op') : '';
    div.className = `fe ${it.kind === 'goal' ? 'goal' + (it.goal && !it.goal.me ? ' opp' : '') : it.kind}${side}`;
    div.innerHTML = `<span class="m">${it.min}'</span><span class="t">${who}${it.lines.map(lineHTML).join('<br>')}</span>`;
    feed.prepend(div);
    if (it.kind === 'goal' || it.kind === 'chance') { const s = shotAt(it.min, it.me); if (s) move(s.x, s.y); else move(atkX(it.me), 14 + Math.random() * 40); }
    else move(35 + Math.random() * 35, 12 + Math.random() * 44);
    if (it.kind === 'goal' && it.goal) {
      st.sc = it.goal.score;
      for (const k of [0, 1] as const) { const el = $('#sc' + k); if (el.textContent !== String(st.sc[k])) { el.textContent = String(st.sc[k]); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }
      const gt = document.getElementById('goal-txt'); gt?.setAttribute('opacity', '1'); setTimeout(() => gt?.setAttribute('opacity', '0'), 1400);
      return 2200;
    }
    return 0;
  };
  const tick = () => {
    if (st.done) return;
    st.t++;
    $('#clock').textContent = st.t > 90 ? `90+${st.t - 90}'` : `${st.t}'`;
    let extra = 0;
    while (st.i < items.length && items[st.i].min <= st.t) { extra += add(items[st.i]); st.i++; extra += 650; }
    if (st.t % 5 === 0) { const fb = document.getElementById('flowbox'); if (fb) fb.innerHTML = flowSVG(m, st.t) + flowLegend(m); }
    if (st.t >= end && st.i >= items.length) { finish(); return; }
    timer = window.setTimeout(tick, 1250 / st.speed + extra / st.speed);
  };
  const finish = () => {
    st.done = true; clearTimeout(timer);
    while (st.i < items.length) { add(items[st.i]); st.i++; }
    $('#clock').textContent = '試合終了'; $('#sc0').textContent = String(m.score[0]); $('#sc1').textContent = String(m.score[1]);
    const fb = document.getElementById('flowbox'); if (fb) fb.innerHTML = flowSVG(m, 95) + flowLegend(m);
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
  };
  S.ui.match = { st, finish, after, setMode: (md: 'full' | 'hl') => { if (st.done) return; S.ui.mMode = md; const shown = st.i ? items[st.i - 1].min : -1; items = [...(md === 'hl' ? m.highlights : m.full)].sort((a, b) => a.min - b.min || (a.ord ?? 0) - (b.ord ?? 0)); st.i = items.findIndex((x) => x.min > shown); if (st.i < 0) st.i = items.length; } };
  tick();
  void yen;
}
ACT.mSpd = (v) => { const c = S.ui.match; if (!c) return; c.st.speed = +v; S.ui.mSpeed = +v; };
ACT.mSkip = () => { const c = S.ui.match; if (c && !c.st.done) c.finish(); };
ACT.mFeed = (v) => { const c = S.ui.match; if (c) c.setMode(v); };
ACT.mClose = () => { const c = S.ui.match; clearTimeout(timer); $('#overlay').innerHTML = ''; S.ui.match = null; c?.after(); };
