/* 試合の画面：見どころ（メイン）と実況（問35〜37・問63、感想 1〜3・8〜18） */
import type { MatchView, ViewItem } from '../core/types';
import { $, esc, lineHTML, posTag } from './dom';
import { oppColor, oppVars } from './theme';
import { sfx } from './sound';

export function openMatch(m: MatchView, myColor: string, after: (() => void) | null, afterLabel = '週の報告へ') {
  const layer = $('#layer');
  const opp = m.home.me ? m.away : m.home;
  const nameColor = (s: { me: boolean }) => (s.me ? 'var(--nm-me)' : 'var(--nm-op)');
  layer.innerHTML = `<div class="sheet" role="dialog" aria-label="試合"><div class="in">
    <div class="bar"><h2>${esc(m.title)}</h2></div>
    <div class="card score"><div class="tn" style="color:${nameColor(m.home)}">${esc(m.home.name)}</div><div class="sc" id="sc">0 - 0</div><div class="tn" style="color:${nameColor(m.away)}">${esc(m.away.name)}</div></div>
    <div class="seg" role="group" aria-label="見方"><button id="mHL" aria-pressed="true">見どころ</button><button id="mLog" aria-pressed="false">実況（試合の流れ全部）</button></div>
    <div id="feed" class="wk" aria-live="polite"></div>
    <div class="muted small" style="text-align:center">画面のどこを押しても進みます</div>
  </div></div>
  <div class="dock"><div class="in2"><button class="btn ghost" id="mAll">最後まで出す</button><button class="btn primary" id="mNext">次へ</button></div></div>`;
  const sheet = layer.querySelector('.sheet') as HTMLElement;
  oppVars(sheet, oppColor(myColor, opp.color));
  const feed = $('#feed'); const sc = $('#sc'); const nextBtn = $('#mNext');
  let items: ViewItem[] = m.highlights;
  let idx = 0, card: HTMLElement | null = null, lines: ViewItem['lines'] = [], k = 0, cur: ViewItem | null = null, cut: HTMLElement | null = null;
  let finished = false;
  const resultHTML = (it: ViewItem) => {
    if (it.kind === 'flow') return `<span class="tag">流れが変わった</span>`;
    if (it.kind === 'memo') return `<span class="tag">記念の場面</span>`;
    const g = it.goal; if (!g) return '';
    return `${g.flow ? `<span class="tag">${esc(g.flow)}</span> ` : ''}${g.mem ? `<span class="tag gold">プロ初ゴール</span> ` : ''}<span class="gol">ゴール！</span>`;
  };
  /* 新しい行が出たら、下のボタンに隠れないところまで自動で送る（感想 16） */
  const follow = (instant = false) => requestAnimationFrame(() => sheet.scrollTo({ top: sheet.scrollHeight, behavior: instant ? 'auto' : 'smooth' }));
  const removeCut = () => { if (cut) { cut.remove(); cut = null; } };
  const showCut = (el: HTMLElement, ms: number) => {
    document.body.appendChild(el); cut = el;
    const close = () => { if (cut === el) removeCut(); };
    el.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    setTimeout(close, ms);
  };
  /* ゴールのカットイン（感想 17） */
  const goalCut = (it: ViewItem) => {
    const g = it.goal!; const el = document.createElement('div'); el.className = 'cutin' + (g.me ? '' : ' opp'); el.setAttribute('role', 'status');
    el.innerHTML = `<div class="band"><div class="cg">ゴール！！</div><div class="cw">${esc(g.scorer)}<span>${it.min}分 ・ ${esc(g.team)}</span></div><div class="cs">${g.score.join(' - ')}</div></div>`;
    sfx(g.me ? 'goal' : 'goalOpp');
    showCut(el, 2200);
  };
  /* 特殊能力が働いたときのカットイン（感想 18） */
  const spCut = (list: { sp: string; t: string; me: boolean }[]) => {
    const u = list[0]; const el = document.createElement('div'); el.className = 'cutin sp' + (u.me ? '' : ' opp'); el.setAttribute('role', 'status');
    el.innerHTML = `<div class="band"><div class="ck">特殊能力発動！</div><div class="cg">${esc(u.sp)}</div><div class="cw">${esc(u.t)}${list.length > 1 ? `<span>ほかに ${list.slice(1).map((x) => esc(x.sp)).join('・')}</span>` : ''}</div></div>`;
    sfx('special');
    showCut(el, 1800);
  };
  const closeCard = (instant: boolean) => {
    if (!cur || !card) return;
    if (cur.goal) { card.classList.add('goal'); sc.textContent = cur.goal.score.join(' - '); if (!instant) goalCut(cur); }
    const res = card.querySelector('.res'); if (res) res.innerHTML = resultHTML(cur);
    cur = null;
  };
  const openCard = (it: ViewItem) => {
    cur = it;
    if (it.kind === 'talk') { feed.insertAdjacentHTML('beforeend', `<div class="talk"><b>${it.min}分</b>　<span class="res"></span></div>`); card = feed.lastElementChild as HTMLElement; lines = it.lines; k = 0; return; }
    feed.insertAdjacentHTML('beforeend', `<div class="scene ${it.me ? '' : 'opp'}"><div class="head"><span class="minute">${it.min}分</span><span class="res"></span></div></div>`);
    card = feed.lastElementChild as HTMLElement; lines = it.lines; k = 0;
  };
  const endCard = () => {
    if (!feed.querySelector('.endcard')) {
      sc.textContent = m.score.join(' - ');
      const sco = m.scorers.map((s) => `<span class="${s.me ? 'n-me' : 'n-op'}">${esc(s.name)}</span> ${s.min}分`).join('、');
      /* 問108：一覧は評価点・ゴール・アシストだけ。押すとその試合のくわしい数字が開く */
      const rc = (v: number) => (v >= 8 ? 'r-top' : v >= 7 ? 'r-good' : v < 5.5 ? 'r-bad' : '');
      const momMe = m.mom && m.mom.me ? m.mom.name : '';
      const pl = m.played.map((p, i) => { const s = p.st; const rt = p.rt ?? 6;
        return `<div class="srow-wrap"><button class="srow rtrow" data-rt="${i}" aria-expanded="false">${posTag(p.pos)}<span class="grow sname">${esc(p.name)}${p.sub ? ' <span class="muted small">途中から</span>' : ''}${momMe === p.name ? ' <span class="tag gold">MOM</span>' : ''}</span>${p.goals ? `<span class="small">⚽${p.goals > 1 ? p.goals : ''}</span>` : ''}${p.ast ? `<span class="small">A${p.ast > 1 ? p.ast : ''}</span>` : ''}<span class="rt ${rc(rt)}">${rt.toFixed(1)}</span></button>
          ${s ? `<div class="sdetail rtd" hidden><div class="rtmini"><span>出場 ${p.min ?? 90}分</span><span>パス ${s.pa}本（成功 ${s.pa ? Math.round((s.pc / s.pa) * 100) : 0}%）</span><span>シュート ${s.sh}（枠内 ${s.ot}）</span><span>決定機を作った ${s.kp}</span><span>ボールを奪った ${s.tk}</span><span>ドリブル成功 ${s.dr}</span>${p.pos === 'GK' ? `<span>セーブ ${s.sv}</span>` : ''}</div></div>` : ''}</div>`; }).join('');
      const mom = m.mom ? `<div class="mom"><span class="tag gold">MOM</span> <span class="${m.mom.me ? 'n-me' : 'n-op'}">${esc(m.mom.name)}</span>（${esc(m.mom.club)}）<b class="rt r-top">${m.mom.rt.toFixed(1)}</b></div>` : '';
      feed.insertAdjacentHTML('beforeend', `<div class="card endcard"><h2>試合のまとめ</h2><div class="goal">試合終了 ${m.score.join(' - ')}${m.pk ? `（PK戦 ${m.pk.join(' - ')}）` : ''}</div>
        <div class="muted">決定機 ${m.chances[0] + m.chances[1]}回（${esc(m.home.name)} ${m.chances[0]}回 ・ ${esc(m.away.name)} ${m.chances[1]}回）</div>
        ${sco ? `<div style="margin-top:6px">得点：${sco}</div>` : ''}
        ${mom}
        ${pl ? `<h3>出場した選手（評価点は10点満点）</h3><div class="slist">${pl}</div><div class="muted small" style="margin-top:4px">選手を押すと、その試合のくわしい数字が出る。</div>` : ''}
        <div class="muted small" style="margin-top:8px">その試合での伸びは、このあとの週の報告で見られます。</div></div>`);
      feed.querySelectorAll<HTMLElement>('[data-rt]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const d = b.nextElementSibling as HTMLElement | null; if (!d) return; const open = d.hidden; d.hidden = !open; b.setAttribute('aria-expanded', String(open)); }));
    }
    nextBtn.textContent = after ? afterLabel : '閉じる';
  };
  const done = () => idx >= items.length && !cur;
  /* 1回押すごとに1文ずつ（見どころも実況も：感想 11・14） */
  const tap = (instant = false): void => {
    if (cut) { removeCut(); return; }
    if (cur && k < lines.length) {
      if (cur.kind === 'talk') { const res = card!.querySelector('.res')!; res.outerHTML = lineHTML(lines[k]); k++; cur = null; }
      else {
        const L = lines[k]; card!.insertAdjacentHTML('beforeend', `<p>${lineHTML(L)}</p>`); k++;
        const sps = L.filter((x): x is { sp: string; t: string; me: boolean } => typeof x === 'object' && 'sp' in x);
        if (sps.length && !instant) spCut(sps); else if (!instant) sfx('tap');
        if (k >= lines.length) closeCard(instant);
      }
      if (!instant) follow();
      if (done()) endCard();
      return;
    }
    if (idx < items.length) { openCard(items[idx]); idx++; tap(instant); return; }
    if (feed.querySelector('.endcard')) finish(); else endCard();
  };
  const finish = () => { if (finished) return; finished = true; removeCut(); layer.innerHTML = ''; if (after) after(); };
  const restart = (mode: 'hl' | 'log') => {
    items = mode === 'hl' ? m.highlights : m.full;
    $('#mHL').setAttribute('aria-pressed', String(mode === 'hl')); $('#mLog').setAttribute('aria-pressed', String(mode === 'log'));
    feed.innerHTML = ''; idx = 0; cur = null; sc.textContent = '0 - 0'; nextBtn.textContent = '次へ'; tap();
  };
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); tap(); });
  $('#mAll').addEventListener('click', (e) => { e.stopPropagation(); removeCut(); let guard = 0; while (!done() && guard++ < 2000) tap(true); endCard(); follow(true); });
  $('#mHL').addEventListener('click', (e) => { e.stopPropagation(); restart('hl'); });
  $('#mLog').addEventListener('click', (e) => { e.stopPropagation(); restart('log'); });
  /* 画面のどこを押しても進む（感想 13） */
  sheet.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) return; tap(); });
  tap();
}
