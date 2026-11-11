/* 移籍市場の画面（夜2 段階2）：知っている選手・フリーの選手・スカウトの条件・申し込み */
import type { GameState } from '../core/game';
import { myTier } from '../core/game';
import { POS, type Pos } from '../core/constants';
import { ovr } from '../core/player';
import { Rng } from '../core/rng';
import {
  BUMPS, SCOUT_REGIONS, VALUE_STEPS, bid, cancelBid, chanceWord, condText, fromTierOf, isStale, joinChance, marketOpen, offerSalary, ovrRange,
  playerIndex, regionLabel, scoutCond, sellChance, valueOf, type Known, type Where,
} from '../core/market';
import type { Player } from '../core/types';
import { $$, closeSheet, esc, posTag, sheet, val, yen } from './dom';
import { openPlayer } from './playerview';

/** 画面の状態（セーブには入れない） */
export const mv = { sub: 'known' as 'known' | 'free' | 'cond', pos: '' as Pos | '', where: '', sort: 'ovr', more: false };
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
  return `<button class="pl" data-known="${k.pid}">${posTag(p.pos)}<span style="min-width:0"><span class="pname">${esc(p.name)}${G.owner.mk.bids.some((b) => b.pid === k.pid) ? ' <span class="tag">申し込み中</span>' : ''}</span><br>
    <span class="pmeta">${p.age}歳 ・ ${esc(whereText(r))} ・ ${r.value ? yen(r.value) : '移籍金なし'}</span><br><span class="pmeta">${srcText[k.src]}${k.scout ? `（${esc(k.scout)}）` : ''} ${fresh(G, k)}</span></span><span class="ovr">${strength}</span></button>`;
}

export function marketHTML(G: GameState): string {
  const o = G.owner; const mk = o.mk; const open = marketOpen(G);
  const sub = `<div class="seg" role="group" aria-label="移籍市場"><button data-mv-sub="known" aria-pressed="${mv.sub === 'known'}">知っている選手</button><button data-mv-sub="free" aria-pressed="${mv.sub === 'free'}">フリー</button><button data-mv-sub="cond" aria-pressed="${mv.sub === 'cond'}">スカウトの条件</button></div>`;
  const bids = mk.bids.length ? `<div class="list" style="margin-top:8px">${mk.bids.map((b) => { const w = playerIndex(G).get(b.pid); return w ? `<div class="slot"><div class="grow small"><b>${esc(w.p.name)}</b> に申し込み中（${b.fee ? `移籍金 ${yen(b.fee)}・` : ''}給料 年${b.salary.toLocaleString()}万円${b.bump ? `・上乗せ +${b.bump}%` : ''}）<br><span class="muted">結果は次の週のお知らせで届く</span></div><button class="btn small ghost" data-unbid="${b.pid}">やめる</button></div>` : ''; }).join('')}</div>` : '';
  const head = `<section class="card"><h2>移籍市場</h2><div class="muted small">${open ? '<b>いまは移籍の期間</b>。知っている選手なら、誰にでも申し込める。' : 'プロとフリーの選手に申し込めるのは、移籍の期間（夏：7〜8月、冬：12月）だけ。高校生・大学生はいつでも獲れる。'}お金 ${yen(o.money)}。</div>${bids}<div style="margin-top:8px">${sub}</div></section>`;
  if (mv.sub === 'cond') return head + condHTML(G);
  let list = rows(G).filter((r) => (mv.sub === 'free' ? r.w.kind === 'free' : true));
  if (mv.pos) list = list.filter((r) => r.w.p.pos === mv.pos);
  if (mv.where) list = list.filter((r) => (mv.where === 'ama' ? r.w.kind === 'ama' : mv.where === 'free' ? r.w.kind === 'free' : r.w.club?.tier === +mv.where));
  const sorters: Record<string, (a: Row, b: Row) => number> = {
    ovr: (a, b) => b.o - a.o, age: (a, b) => a.w.p.age - b.w.p.age, value: (a, b) => b.value - a.value,
    new: (a, b) => b.k.season * 48 + b.k.week - (a.k.season * 48 + a.k.week) || b.o - a.o,
  };
  list.sort(sorters[mv.sort] ?? sorters.ovr);
  const all = list.length; const shown = mv.more ? list : list.slice(0, 40);
  const filt = `<div class="seg wide9" role="group" aria-label="ポジション"><button data-mv-pos="" aria-pressed="${mv.pos === ''}">全部</button>${POS.map((p) => `<button data-mv-pos="${p}" aria-pressed="${mv.pos === p}">${p}</button>`).join('')}</div>
    <div class="row wrap" style="margin-top:8px;gap:8px">
      ${mv.sub === 'known' ? `<label class="selw"><span class="small muted">いるところ</span><select class="sel" data-mv-where>${[['', '全部'], ['1', '1部'], ['2', '2部'], ['3', '3部'], ['ama', '高校・大学'], ['free', 'フリー']].map(([k, l]) => `<option value="${k}" ${mv.where === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      <label class="selw"><span class="small muted">並べかえ</span><select class="sel" data-mv-sort>${[['ovr', '強い順'], ['age', '若い順'], ['value', '値段の高い順'], ['new', '新しい情報から']].map(([k, l]) => `<option value="${k}" ${mv.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
  const empty = mv.sub === 'free' ? 'フリーの選手の情報は、移籍の期間（7月・12月のはじめ）にお知らせで届く。スカウトが見つけてくることもある。' : 'まだ知っている選手がいない（条件に合う選手もいない）。スカウトが毎月調べてくるほか、対戦した相手の先発や、年末に表彰された選手もここに出る。';
  return head + `<section class="card"><h2>${mv.sub === 'free' ? 'フリーの選手' : '知っている選手'}（${all}人）</h2><div class="muted small">知らない選手は出てこない。くわしく知りたい選手は、スカウトの条件を合わせて調べてもらおう。</div><div style="margin-top:8px">${filt}</div>
    <div class="plist" style="margin-top:8px">${shown.map((r) => rowHTML(G, r)).join('') || `<div class="muted">${empty}</div>`}</div>
    ${all > shown.length ? `<button class="btn small ghost wide" data-mv-more="1" style="margin-top:8px">のこり${all - shown.length}人も見る</button>` : ''}</section>`;
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
    if (w.kind === 'ama') return `<section class="card"><h2>獲得</h2><div>契約金 ${yen(k.fee ?? 100)} ・ 給料 年${p.salary.toLocaleString()}万円 ・ 3年契約</div><div class="muted small">高校生・大学生は、いつでも獲れる（すぐにトップに入る）。</div><button class="btn primary wide" id="mBid" style="margin-top:8px">獲る</button></section>`;
    const sc = w.club ? sellChance(w.club, p) : 1;
    return `<section class="card"><h2>獲得を申し込む</h2><div class="list small">
      <div>移籍金（相場）：<b>${value ? yen(value) : 'なし（フリー）'}</b></div><div>給料：<b>年${offerSalary(w, bump).toLocaleString()}万円</b>（3年契約）</div>
      ${w.club ? `<div>${esc(w.club.name)}が売ってくれる見こみ：<b>${chanceWord(sc)}</b></div>` : ''}<div>本人が来てくれる見こみ：<b>${chanceWord(joinChance(fromT, tier, bump))}</b></div></div>
      <h3>給料の上乗せ</h3><div class="seg" role="group" aria-label="給料の上乗せ">${BUMPS.map((b) => `<button data-bump="${b}" aria-pressed="${bump === b}">${b ? `+${b}%` : '上乗せなし'}</button>`).join('')}</div>
      <div class="muted small" style="margin-top:6px">値段の交渉はしない。相場の額で申し込み、${w.club ? '相手のクラブが売るか、' : ''}選手本人が来るかを決める。上の段の選手ほど、下の段のクラブには来にくい。結果は次の週のお知らせで届く。</div>
      ${inBid ? '<div class="tag" style="margin-top:8px">申し込み中</div>' : `<button class="btn primary wide" id="mBid" style="margin-top:8px" ${open ? '' : 'disabled'}>${open ? '獲得を申し込む' : '移籍の期間になったら申し込める'}</button>`}</section>`;
  };
  const info = `<section class="card"><h2>この選手のこと</h2><div class="list small"><div>いるところ：<b>${esc(whereTextW(w, k))}</b></div><div>市場の値段：<b>${value ? yen(value) : '0円'}</b></div><div>情報：${srcText[k.src]}（${k.season}年目 ${Math.floor(k.week / 4) + 1}月）${isStale(G, k) ? ' ・ <b>去年の情報</b>' : ''}</div></div></section>`;
  const bindOffer = (root: HTMLElement, again: () => void) => {
    $$<HTMLElement>('[data-bump]', root).forEach((b) => b.addEventListener('click', () => { bump = +b.dataset.bump!; again(); }));
    root.querySelector('#mBid')?.addEventListener('click', () => {
      const r = new Rng(G.rng); const e = bid(G, pid, bump, r); G.rng = r.s;
      closeSheet(); done(e ?? (w.kind === 'ama' ? `${p.name} を獲った` : `${p.name} に申し込んだ。結果は次の週に届く`));
    });
  };
  if (!k.full) {
    const draw = () => {
      const s = sheet(`<div class="bar"><h2>${esc(p.name)}</h2><span class="ovr">${ovrRange(k.ovr)}</span></div><div class="row wrap">${posTag(p.pos)}<span class="muted">${p.age}歳 ・ ${esc(whereTextW(w, k))}</span></div>
        <section class="card"><div class="muted">対戦で見ただけなので、だいたいの強さしかわからない。くわしく知るには、スカウトの条件を合わせて調べてもらおう。</div></section>${info}${offerHTML()}`, '<div class="in2 one"><button class="btn primary" id="mBack">もどる</button></div>');
      s.parentElement!.querySelector('#mBack')!.addEventListener('click', () => { closeSheet(); done(null); });
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
  });
  draw();
}
const whereTextW = (w: Where, k: Known) => (w.kind === 'ama' ? `${k.from ?? '高校・大学'}（${w.p.pref}）` : w.kind === 'free' ? 'フリー（どこにもいない）' : `${w.club!.tier}部 ${w.club!.name}（${w.club!.pref}）`);

export function bindMarket(G: GameState, root: HTMLElement, done: (msg?: string | null) => void) {
  const on = (sel: string, f: (v: string) => string | null | void) => $$<HTMLElement>(`[${sel}]`, root).forEach((b) => b.addEventListener('click', () => done(f(b.getAttribute(sel)!) || null)));
  on('data-mv-sub', (v) => { mv.sub = v as typeof mv.sub; mv.more = false; });
  on('data-mv-pos', (v) => { mv.pos = v as Pos | ''; mv.more = false; });
  on('data-mv-more', () => { mv.more = true; });
  on('data-unbid', (v) => { cancelBid(G, +v); return '申し込みをやめた'; });
  $$<HTMLSelectElement>('[data-mv-where]', root).forEach((s) => s.addEventListener('change', () => { mv.where = s.value; mv.more = false; done(null); }));
  $$<HTMLSelectElement>('[data-mv-sort]', root).forEach((s) => s.addEventListener('change', () => { mv.sort = s.value; done(null); }));
  $$<HTMLElement>('[data-known]', root).forEach((b) => b.addEventListener('click', () => openKnown(G, +b.dataset.known!, done)));
  const scout = (id: string) => G.owner.scouts.find((s) => s.id === +id)!;
  on('data-sc-pos', (v) => { const [id, p] = v.split(':'); const c = scoutCond(scout(id)); if (!p) c.pos = []; else c.pos = c.pos.includes(p as Pos) ? c.pos.filter((x) => x !== p) : [...c.pos, p as Pos]; });
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
