/* 移籍市場の画面（夜2 段階2）：知っている選手・フリーの選手・スカウトの条件・申し込み */
import type { GameState } from '../core/game';
import { myTier } from '../core/game';
import { POS, type Pos } from '../core/constants';
import { ovr } from '../core/player';
import { Rng } from '../core/rng';
import {
  BUMPS, SCOUT_REGIONS, VALUE_STEPS, bid, cancelBid, chanceWord, condText, fromTierOf, isStale, joinChance, marketOpen, offerSalary, ovrRange,
  playerIndex, regionLabel, scoutCond, sellChance, valueOf, inShort, shortList, toggleShort, forgetKnown, forgetUnlisted, type Known, type Where,
} from '../core/market';
import type { Player } from '../core/types';
import { $$, closeSheet, esc, posTag, sheet, val, yen } from './dom';
import { openPlayer } from './playerview';

/** 画面の状態（セーブには入れない） */
export const mv = { confirm: false, seen: false, sub: 'known' as 'known' | 'cond', pos: '' as Pos | '', where: '', sort: 'ovr', more: false };
const AGE_STEPS = [16, 18, 20, 22, 24, 26, 28, 30, 32, 35];

interface Row { k: Known; w: Where; value: number; o: number; }
function rows(G: GameState): Row[] {
  const idx = playerIndex(G);
  const out: Row[] = [];
  for (const k of Object.values(G.owner.mk.known)) {
    const w = idx.get(k.pid); if (!w) continue;
    out.push({ k, w, value: valueOf(w), o: k.ovr });
  }
  return out;
}
const whereText = (r: Row) => (r.w.kind === 'ama' ? r.k.from ?? '高校・大学' : r.w.kind === 'free' ? 'フリー' : `${r.w.club!.tier}部 ${r.w.club!.name}`);
const fresh = (G: GameState, k: Known) => (isStale(G, k) ? '<span class="tag away">去年の情報</span>' : k.full ? '' : '<span class="tag">対戦で見ただけ</span>');
const srcText: Record<string, string> = { scout: 'スカウトが調べた', match: '対戦で見た', award: '表彰された', free: 'フリーのお知らせ' };

function rowHTML(G: GameState, r: Row): string {
  const k = r.k; const p = r.w.p;
  const strength = k.full ? val(k.ovr) : `<span class="v">${ovrRange(k.ovr)}</span>`;
  /* 問102：3行目はスカウトのコメント（長いときは「…」）。問101：横にスワイプすると「消す」が出る */
  const said = k.note ? `${k.scout && k.scout !== '売り込み' ? `${esc(k.scout)}「${esc(k.note)}」` : esc(k.note)}` : srcText[k.src];
  const del = mv.sub === 'known' && !inShort(G, k.pid) && !G.owner.mk.bids.some((b) => b.pid === k.pid);
  return `<div class="swipe" data-swipe="${del ? k.pid : ''}"><button class="pl" data-known="${k.pid}">${posTag(p.pos)}<span style="min-width:0"><span class="pname">${esc(p.name)}${G.owner.mk.bids.some((b) => b.pid === k.pid) ? ' <span class="tag">申し込み中</span>' : inShort(G, k.pid) ? ' <span class="tag gold">候補</span>' : ''}</span><br>
    <span class="pmeta">${p.age}歳 ・ ${esc(whereText(r))} ・ ${r.value ? yen(r.value) : '移籍金なし'}</span><br><span class="pmeta said">${said}</span>${fresh(G, k) ? ` ${fresh(G, k)}` : ''}</span><span class="ovr">${strength}</span></button>${del ? `<button class="swipe-del" data-forget="${k.pid}">消す</button>` : ''}</div>`;
}

export function marketHTML(G: GameState): string {
  const o = G.owner; const mk = o.mk; const open = marketOpen(G);
  const sub = `<div class="seg" role="group" aria-label="スカウト"><button data-mv-sub="known" aria-pressed="${mv.sub === 'known'}">調べた選手</button><button data-mv-sub="cond" aria-pressed="${mv.sub === 'cond'}">探す条件</button></div>`;
  void mk; void open;
  const head = `<section class="card">${sub}<div class="muted small" style="margin-top:8px">${mv.sub === 'cond' ? 'スカウトは毎月、この条件で選手を調べてくる。' : '気になった選手を押して「候補リストに入れる」。申し込みは候補リストからする。'}</div></section>`;
  if (mv.sub === 'cond') return head + condHTML(G);
  const allRows = rows(G); const nSeen = allRows.filter((r) => r.k.src === 'match').length;
  let list = allRows.filter((r) => r.k.src !== 'match' || inShort(G, r.k.pid)); void nSeen;
  if (mv.pos) list = list.filter((r) => r.w.p.pos === mv.pos);
  if (mv.where) list = list.filter((r) => (mv.where === 'ama' ? r.w.kind === 'ama' : mv.where === 'free' ? r.w.kind === 'free' : r.w.club?.tier === +mv.where));
  const sorters: Record<string, (a: Row, b: Row) => number> = {
    ovr: (a, b) => b.o - a.o, age: (a, b) => a.w.p.age - b.w.p.age, value: (a, b) => b.value - a.value,
    new: (a, b) => b.k.season * 48 + b.k.week - (a.k.season * 48 + a.k.week) || b.o - a.o,
  };
  list.sort(sorters[mv.sort] ?? sorters.ovr);
  const all = list.length; const shown = mv.more ? list : list.slice(0, 40);
  /* 問87：絞りこみは1行に3つ（ポジション・いるところ・並べかえ） */
  const sel = (attr: string, label: string, cur: string, opts: string[][]) => `<label class="selw"><span class="small muted">${label}</span><select class="sel" ${attr}>${opts.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const filt = `<div class="selrow">${sel('data-mv-posel', 'ポジション', mv.pos, [['', '全部'], ...POS.map((p) => [p, p])])}
      ${sel('data-mv-where', 'いるところ', mv.where, [['', '全部'], ['1', '1部'], ['2', '2部'], ['3', '3部'], ['ama', '高校・大学'], ['free', 'フリー']])}
      ${sel('data-mv-sort', '並べかえ', mv.sort, [['ovr', '強い順'], ['age', '若い順'], ['value', '高い順'], ['new', '新しい順']])}</div>`;
  const empty = 'まだ知っている選手がいない（条件に合う選手もいない）。スカウトが毎月調べてくるほか、対戦した相手の先発・年末に表彰された選手・フリーの選手のお知らせもここに出る。';
  return head + `<section class="card"><h2>スカウトが調べた選手（${all}人）</h2><div style="margin-top:4px">${filt}</div>
    <div class="plist" style="margin-top:8px">${shown.map((r) => rowHTML(G, r)).join('') || `<div class="muted">${empty}</div>`}</div>
    ${all > shown.length ? `<button class="btn small ghost wide" data-mv-more="1" style="margin-top:8px">のこり${all - shown.length}人も見る</button>` : ''}
    ${all ? `<button class="btn small ghost wide" data-forget-all="1" style="margin-top:8px">${mv.confirm ? '本当に消す？（もう一度押す）' : '候補に入れていない人をまとめて消す'}</button><div class="muted small" style="margin-top:4px">選手を左にスワイプしても消せる。消した選手も、スカウトがまた調べてきたら出てくる。</div>` : ''}</section>`;
}

/** 候補リスト（感想24）：気になった選手を集めておき、ここから申し込む */
export function shortHTML(G: GameState): string {
  const mk = G.owner.mk; const open = marketOpen(G); const idx = playerIndex(G);
  const bids = mk.bids.length ? `<section class="card"><h2>申し込み中</h2><div class="list">${mk.bids.map((b) => { const w = idx.get(b.pid); return w ? `<div class="slot"><div class="grow small"><b>${esc(w.p.name)}</b>（${b.fee ? `移籍金 ${yen(b.fee)}・` : ''}給料 年${b.salary.toLocaleString()}万円${b.bump ? `・+${b.bump}%` : ''}）<br><span class="muted">結果は次の週のお知らせで届く</span></div><button class="btn small ghost" data-unbid="${b.pid}">やめる</button></div>` : ''; }).join('')}</div></section>` : '';
  const list: Row[] = shortList(G).map((pid) => { const k = mk.known[pid]; const w = idx.get(pid); return k && w ? { k, w, value: valueOf(w), o: k.ovr } : null; }).filter((x): x is Row => !!x);
  const total = list.reduce((s, r) => s + r.value, 0);
  return `${bids}<section class="card"><h2>候補リスト（${list.length}人）</h2><div class="muted small">${open ? '<b>いまは移籍の期間</b>。選手を押して申し込む。' : 'プロとフリーの選手は、移籍の期間（夏：7〜8月、冬：12月）に申し込める。高校生・大学生はいつでも獲れる。'}${list.length ? ` 全員の移籍金の合計：${yen(total)}` : ''}</div>
    <div class="plist" style="margin-top:8px">${list.map((r) => rowHTML(G, r)).join('') || '<div class="muted">まだいない。「スカウト」で選手を押して「候補リストに入れる」と、ここに集まる。</div>'}</div></section>`;
}

function condHTML(G: GameState): string {
  const o = G.owner;
  if (!o.scouts.length) return '<section class="card"><h2>スカウトの条件</h2><div class="muted">スカウトがいない。人の画面でスカウトを雇うと、毎月、条件に合う選手を調べてくる。</div></section>';
  return o.scouts.map((s) => {
    const c = scoutCond(s);
    const opt = (list: number[], cur: number | null, fmt: (v: number) => string, none: string) => `<option value="" ${cur == null ? 'selected' : ''}>${none}</option>${list.map((v) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${fmt(v)}</option>`).join('')}`;
    const vf = (v: number) => (v === 0 ? '0円（高校・大学・フリー）' : yen(v));
    return `<section class="card"><h2>${esc(s.name)}</h2><div class="muted small">腕前 ${'★'.repeat(Math.max(1, Math.min(5, Math.round(s.skill * 5))))}：腕がいいほど、1回に調べる人数が多く、ひとことの評価が当たる。条件を変えなければ、毎月そのまま探しつづける。</div>
      <h3>ポジション（いくつ選んでもよい）</h3><div class="seg wide9" role="group" aria-label="ポジション"><button data-sc-pos="${s.id}:" aria-pressed="${!c.pos.length}">こだわらない</button>${POS.map((p) => `<button data-sc-pos="${s.id}:${p}" aria-pressed="${c.pos.includes(p)}">${p}</button>`).join('')}</div>
      <h3>地域</h3><div class="seg wide9" role="group" aria-label="地域"><button data-sc-reg="${s.id}:" aria-pressed="${!c.region}">こだわらない</button>${SCOUT_REGIONS.map((r) => `<button data-sc-reg="${s.id}:${r}" aria-pressed="${c.region === r}">${regionLabel(r)}</button>`).join('')}</div>
      <h3>市場の値段</h3><div class="row wrap" style="gap:8px"><label class="selw"><span class="small muted">いくらから</span><select class="sel" data-sc-v="${s.id}:vmin">${opt(VALUE_STEPS, c.vmin, vf, 'こだわらない')}</select></label><label class="selw"><span class="small muted">いくらまで</span><select class="sel" data-sc-v="${s.id}:vmax">${opt(VALUE_STEPS, c.vmax, vf, 'こだわらない')}</select></label></div>
      <h3>年齢</h3><div class="row wrap" style="gap:8px"><label class="selw"><span class="small muted">何歳から</span><select class="sel" data-sc-v="${s.id}:amin">${opt(AGE_STEPS, c.amin, (v) => `${v}歳`, 'こだわらない')}</select></label><label class="selw"><span class="small muted">何歳まで</span><select class="sel" data-sc-v="${s.id}:amax">${opt(AGE_STEPS, c.amax, (v) => `${v}歳`, 'こだわらない')}</select></label></div>
      <h3>クラブに合わせる</h3><div class="seg" role="group" aria-label="クラブに合わせる"><button data-sc-fit="${s.id}:on" aria-pressed="${c.fit !== false}">オン</button><button data-sc-fit="${s.id}:off" aria-pressed="${c.fit === false}">オフ（スターも探す）</button></div>
      <div class="muted small" style="margin-top:4px">オンのときは、いまのお金で払える・段の差が1つまでの選手を先に探す。</div>
      <div class="small" style="margin-top:8px">いまの条件：${esc(condText(c))}</div></section>`;
  }).join('') + '<section class="card"><div class="muted small">高校生・大学生は「17〜22歳」で「0円」の選手として探す。値段の下限を上げると、プロの選手だけを探す。</div></section>';
}

/** 知っている選手の画面。くわしく調べた選手は能力の図と特殊能力が見える（隠れたポテンシャルは見えない） */
export function openKnown(G: GameState, pid: number, done: (msg?: string | null) => void) {
  const w = playerIndex(G).get(pid); const k = G.owner.mk.known[pid];
  if (!w || !k) { done('この選手は、もういない。'); return; }
  const p = w.p; const tier = myTier(G); const open = marketOpen(G) || w.kind === 'ama';
  const value = valueOf(w); const fromT = fromTierOf(w);
  let bump = 0;
  const offerHTML = () => {
    const inBid = G.owner.mk.bids.some((b) => b.pid === pid);
    if (!inShort(G, pid) && !inBid) return `<section class="card" id="offerCard"><h2>候補リスト</h2><div class="muted small">気になったら候補リストに入れておこう。申し込みは、候補リストの中から決める。</div><button class="btn primary wide" id="mShort" style="margin-top:8px">候補リストに入れる</button></section>`;
    const outBtn = '<button class="btn small ghost" id="mShort" style="margin-top:8px">候補リストから外す</button>';
    if (w.kind === 'ama') return `<section class="card" id="offerCard"><h2>獲得</h2><div>契約金 ${yen(k.fee ?? 100)} ・ 給料 年${p.salary.toLocaleString()}万円 ・ 3年契約</div><div class="muted small">高校生・大学生は、いつでも獲れる（すぐにトップに入る）。</div><button class="btn primary wide" id="mBid" style="margin-top:8px">獲る</button>${outBtn}</section>`;
    const sc = w.club ? sellChance(w.club, p) : 1;
    return `<section class="card" id="offerCard"><h2>獲得を申し込む</h2><div class="list small">
      <div>移籍金（相場）：<b>${value ? yen(value) : 'なし（フリー）'}</b></div><div>給料：<b>年${offerSalary(w, bump).toLocaleString()}万円</b>（3年契約）</div>
      ${w.club ? `<div>${esc(w.club.name)}が売ってくれる見こみ：<b>${chanceWord(sc)}</b></div>` : ''}<div>本人が来てくれる見こみ：<b>${chanceWord(joinChance(fromT, tier, bump))}</b></div></div>
      <h3>給料の上乗せ</h3><div class="seg" role="group" aria-label="給料の上乗せ">${BUMPS.map((b) => `<button data-bump="${b}" aria-pressed="${bump === b}">${b ? `+${b}%` : '上乗せなし'}</button>`).join('')}</div>
      <div class="muted small" style="margin-top:6px">値段の交渉はしない。相場の額で申し込み、${w.club ? '相手のクラブが売るか、' : ''}選手本人が来るかを決める。上の段の選手ほど、下の段のクラブには来にくい。結果は次の週のお知らせで届く。</div>
      ${inBid ? '<div class="tag" style="margin-top:8px">申し込み中</div>' : `<button class="btn primary wide" id="mBid" style="margin-top:8px" ${open ? '' : 'disabled'}>${open ? '獲得を申し込む' : '移籍の期間になったら申し込める'}</button>`}${inBid ? '' : outBtn}</section>`;
  };
  const info = `<section class="card"><h2>この選手のこと</h2><div class="list small"><div>いるところ：<b>${esc(whereTextW(w, k))}</b></div><div>市場の値段：<b>${value ? yen(value) : '0円'}</b></div><div>情報：${srcText[k.src]}（${k.season}年目 ${Math.floor(k.week / 4) + 1}月）${isStale(G, k) ? ' ・ <b>去年の情報</b>' : ''}</div></div>${inShort(G, pid) || G.owner.mk.bids.some((b) => b.pid === pid) ? '' : '<button class="btn small ghost" id="mForget" style="margin-top:8px">リストから消す</button>'}</section>`;
  const bindOffer = (root: HTMLElement, again: () => void) => {
    $$<HTMLElement>('[data-bump]', root).forEach((b) => b.addEventListener('click', () => { bump = +b.dataset.bump!; again(); }));
    root.querySelector('#mForget')?.addEventListener('click', () => { forgetKnown(G, pid); closeSheet(); done(`${p.name} をリストから消した`); });
    root.querySelector('#mShort')?.addEventListener('click', () => { const on = toggleShort(G, pid); closeSheet(); done(on ? `${p.name} を候補リストに入れた` : `${p.name} を候補リストから外した`); });
    root.querySelector('#mBid')?.addEventListener('click', () => {
      const r = new Rng(G.rng); const e = bid(G, pid, bump, r); G.rng = r.s;
      closeSheet(); done(e ?? (w.kind === 'ama' ? `${p.name} を獲った` : `${p.name} に申し込んだ。結果は次の週に届く`));
    });
  };
  /* 下の帯のボタン：候補リストに入っていなければ「入れる」、入っていれば申し込みのところへ動く */
  const dock = () => { const inBid = G.owner.mk.bids.some((b) => b.pid === pid); if (inBid) return null;
    return inShort(G, pid) ? { label: w.kind === 'ama' ? '獲る ↓' : '申し込む ↓', go: () => document.getElementById('offerCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
      : { label: '候補に入れる ＋', go: () => { toggleShort(G, pid); closeSheet(); done(`${p.name} を候補リストに入れた`); } }; };
  if (!k.full) {
    const draw = () => {
      const s = sheet(`<div class="bar"><h2>${esc(p.name)}</h2><span class="ovr">${ovrRange(k.ovr)}</span></div><div class="row wrap">${posTag(p.pos)}<span class="muted">${p.age}歳 ・ ${esc(whereTextW(w, k))}</span></div>
        <section class="card"><div class="muted">対戦で見ただけなので、だいたいの強さしかわからない。くわしく知るには、スカウトの条件を合わせて調べてもらおう。</div></section>${info}${offerHTML()}`, (() => { const d = dock(); return d ? `<div class="in2"><button class="btn ghost" id="mBack">もどる</button><button class="btn primary" id="mDock">${d.label}</button></div>` : '<div class="in2 one"><button class="btn primary" id="mBack">もどる</button></div>'; })());
      s.parentElement!.querySelector('#mBack')!.addEventListener('click', () => { closeSheet(); done(null); });
      s.parentElement!.querySelector('#mDock')?.addEventListener('click', () => dock()?.go());
      bindOffer(s, draw);
    };
    draw(); return;
  }
  /* 調べたときの能力で見せる（古い情報は古いまま） */
  const view: Player = { ...p, a: k.a ? [...k.a] : p.a, age: k.age, num: 0 };
  const draw = () => openPlayer(view, {
    hintHTML: `<section class="card"><h2>${k.scout ? `スカウト ${esc(k.scout)}` : '評判'}のひとこと</h2><div>「${esc(k.note ?? '')}」</div>${isStale(G, k) ? '<div class="muted small" style="margin-top:6px">去年の情報。いまは変わっているかもしれない。</div>' : ''}</section>`,
    extraHTML: info + offerHTML(), hideRecords: w.kind !== 'pro',
    bindExtra: (root) => bindOffer(root, draw), back: () => done(null),
    dockLabel: dock()?.label, onDock: () => dock()?.go(),
  });
  draw();
}
const whereTextW = (w: Where, k: Known) => (w.kind === 'ama' ? `${k.from ?? '高校・大学'}（${w.p.pref}）` : w.kind === 'free' ? 'フリー（どこにもいない）' : `${w.club!.tier}部 ${w.club!.name}（${w.club!.pref}）`);

export function bindMarket(G: GameState, root: HTMLElement, done: (msg?: string | null) => void) {
  const on = (sel: string, f: (v: string) => string | null | void) => $$<HTMLElement>(`[${sel}]`, root).forEach((b) => b.addEventListener('click', () => done(f(b.getAttribute(sel)!) || null)));
  on('data-mv-sub', (v) => { mv.sub = v as typeof mv.sub; mv.more = false; });
  on('data-mv-pos', (v) => { mv.pos = v as Pos | ''; mv.more = false; });
  on('data-mv-more', () => { mv.more = true; });
  on('data-forget', (v) => { forgetKnown(G, +v); return 'リストから消した'; });
  on('data-forget-all', () => { if (!mv.confirm) { mv.confirm = true; return null; } mv.confirm = false; const n = forgetUnlisted(G); return `${n}人をリストから消した`; });
  /* 左にスワイプすると「消す」が出る */
  $$<HTMLElement>('.swipe[data-swipe]', root).forEach((w) => { if (!w.dataset.swipe) return; let x0 = -1, y0 = 0;
    w.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    w.addEventListener('touchend', (e) => { if (x0 < 0) return; const dx = e.changedTouches[0].clientX - x0, dy = Math.abs(e.changedTouches[0].clientY - y0); x0 = -1; if (dx < -50 && dy < 40) w.classList.add('open'); else if (dx > 40) w.classList.remove('open'); }, { passive: true }); });
  on('data-unbid', (v) => { cancelBid(G, +v); return '申し込みをやめた'; });
  $$<HTMLSelectElement>('[data-mv-where]', root).forEach((s) => s.addEventListener('change', () => { mv.where = s.value; mv.more = false; done(null); }));
  $$<HTMLSelectElement>('[data-mv-posel]', root).forEach((s) => s.addEventListener('change', () => { mv.pos = s.value as Pos | ''; mv.more = false; done(null); }));
  $$<HTMLSelectElement>('[data-mv-sort]', root).forEach((s) => s.addEventListener('change', () => { mv.sort = s.value; done(null); }));
  $$<HTMLElement>('[data-known]', root).forEach((b) => b.addEventListener('click', () => openKnown(G, +b.dataset.known!, done)));
  const scout = (id: string) => G.owner.scouts.find((s) => s.id === +id)!;
  on('data-sc-pos', (v) => { const [id, p] = v.split(':'); const c = scoutCond(scout(id)); if (!p) c.pos = []; else c.pos = c.pos.includes(p as Pos) ? c.pos.filter((x) => x !== p) : [...c.pos, p as Pos]; });
  on('data-sc-fit', (v) => { const [id, x] = v.split(':'); scoutCond(scout(id)).fit = x !== 'off'; });
  on('data-sc-reg', (v) => { const [id, r] = v.split(':'); scoutCond(scout(id)).region = r || null; });
  $$<HTMLSelectElement>('[data-sc-v]', root).forEach((s) => s.addEventListener('change', () => {
    const [id, key] = s.dataset.scV!.split(':'); const c = scoutCond(scout(id)) as unknown as Record<string, number | null>;
    c[key] = s.value === '' ? null : +s.value;
    /* 下限が上限をこえたら、上限を合わせる */
    if (key === 'vmin' && c.vmax != null && c.vmin != null && c.vmin > c.vmax) c.vmax = c.vmin;
    if (key === 'vmax' && c.vmin != null && c.vmax != null && c.vmax < c.vmin) c.vmin = c.vmax;
    if (key === 'amin' && c.amax != null && c.amin != null && c.amin > c.amax) c.amax = c.amin;
    if (key === 'amax' && c.amin != null && c.amax != null && c.amax < c.amin) c.amin = c.amax;
    done('条件を変えた。次の月から、この条件で探す');
  }));
}
void ovr;
