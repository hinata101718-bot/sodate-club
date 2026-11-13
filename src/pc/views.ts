/* PC版の画面（その1）：ホーム・日程・順位・トップチーム・戦術・練習・ユース */
import { S, G, ACT, CHANGE, esc, yen, fmt, moneyCls, posTag, ovrChip, potHtml, spChips, condBar, condArrow, lineChart, statNames, toast, val } from './util';
import { standings, myTier, myRank, matchPlan, hasMyMatch, eventOf, clubById, currentGoal, avgRt, ME } from '../core/game';
import { FORM, STYLES, STYLE_NAMES, APT, POS, type Pos } from '../core/constants';
import { ovr, posRating, teamStrength } from '../core/player';
import { MENT, THEMES, INTENS, setForm, autoXI, regSquad, type Ment } from '../core/gm';
import { CUP_ROUND_NAMES, monthOf, weekOfMonth } from '../core/calendar';
import { tacticFit, trustStars, loveHearts, unhappy } from '../core/bond';
import { REG_SIZE } from '../core/squad';
import { emblemSVG } from '../ui/emblem';
import { render, save } from './app';
import type { Player } from '../core/types';

export const VIEWS: Record<string, () => string> = {};
const g = G;
const clubLink = (id: number) => { const c = clubById(g(), id); return `<span class="emb-sm">${emblemSVG(c.emblem)}</span> <span${id === ME ? ' class="acc"' : ''}>${esc(id === ME ? g().club.name : c.name)}</span>`; };
export { clubLink };
const formChips = (f: string[]) => f.slice(-5).map((x) => `<span class="form-chip ${x}">${x === 'W' ? '勝' : x === 'D' ? '分' : '敗'}</span>`).join(' ');
/** そのクラブの、最近のリーグ戦の結果（勝・分・敗） */
function formOf(tier: number, id: number): string[] {
  const L = g().leagues[tier]; const out: string[] = [];
  (L.res ?? []).forEach((rd, i) => { const k = L.fixtures[i].findIndex(([h, a]) => h === id || a === id); const s = rd?.[k]; if (!s) return; const home = L.fixtures[i][k][0] === id; const my = home ? s[0] : s[1], op = home ? s[1] : s[0]; out.push(my > op ? 'W' : my < op ? 'L' : 'D'); });
  return out;
}

/* ---------- ホーム ---------- */
VIEWS.home = () => {
  const G0 = g(); const tier = myTier(G0); const rows = standings(G0, tier);
  const ev = eventOf(G0); const playing = hasMyMatch(G0);
  let next = '<div class="empty">今週は自分のクラブの試合がない</div>';
  if (playing && (ev.kind === 'league' || ev.kind === 'cup')) {
    const plan = matchPlan(G0); const opp = plan.opp;
    if (opp) {
      const ms = teamStrength(plan.lineup.map((x) => x.p)), os = teamStrength(opp.squad);
      const orank = standings(G0, opp.tier).findIndex((x) => x.id === opp.id) + 1;
      next = `<div class="row between"><span class="eyebrow">${ev.kind === 'league' ? `${tier}部 第${ev.round}節` : `天皇杯 ${CUP_ROUND_NAMES[ev.round]}`}</span><span class="chip ${plan.home ? 'acc' : ''}">${plan.home === null ? '天皇杯' : plan.home ? 'ホーム' : 'アウェイ'}</span></div>
      <div class="match-card"><div class="team"><span class="emb">${emblemSVG(G0.club.emblem)}</span><span class="tname">${esc(G0.club.name)}</span><span class="muted small">先発の強さ <b class="num">${ms.toFixed(1)}</b></span></div>
      <div class="vs">VS</div><div class="team"><span class="emb">${emblemSVG(opp.emblem)}</span><span class="tname">${esc(opp.name)}</span><span class="muted small">${opp.tier}部 ${orank || '-'}位・強さ <b class="num">${os.toFixed(1)}</b></span></div></div>
      <div class="small muted">うちの形：${plan.form}・${esc(G0.gm.tac.style)}・${MENT[G0.gm.tac.ment].n}${G0.gm.tac.auto ? '・先発はヘッドコーチが選ぶ' : '・先発はGMが決めた'}</div>
      ${plan.duels.length ? `<div class="stack small">${plan.duels.map((d) => `<div>注目の対決（${esc(d.zone)}）：<span class="n-me">${esc(d.me.name)}</span> ${d.what} ${d.mv} 対 <span class="n-op">${esc(d.opp.name)}</span> ${d.ov}</div>`).join('')}</div>` : ''}
      ${plan.banned.length ? `<div class="alert bad"><span>出場停止：${plan.banned.map((p) => esc(p.name)).join('、')}</span></div>` : ''}
      ${plan.warn.length ? `<div class="alert"><span>あと1枚で出場停止：${plan.warn.map((p) => esc(p.name)).join('、')}</span></div>` : ''}
      <div class="row"><button class="btn small" data-act="nav" data-arg="tactics">戦術を調整する</button></div>`;
    }
  } else if (ev.kind === 'cup' && !playing) next = '<div class="empty">今週は天皇杯。自分のクラブの出番はない</div>';
  const gl = currentGoal(G0); const rk = myRank(G0); const pl = rows[0] ? rows[0].w + rows[0].d + rows[0].l : 0;
  const goalOk = G0.goal ? (rk <= G0.goal.rank) : true;
  const ms = G0.gm.missions.map((m) => `<div class="mission ${m.done ? 'done' : ''}"><div class="mt"><span>${m.done ? '達成　' : ''}${esc(m.text)}</span><span class="num muted">${m.id === 'profit' || m.id === 'cup' ? '' : `${fmt(Math.min(m.prog, m.target))} / ${fmt(m.target)}`}</span></div>
    <div class="bar"><i style="width:${m.done ? 100 : Math.min(100, (m.prog / m.target) * 100)}%;background:${m.done ? 'var(--good)' : 'var(--accent)'}"></i></div><div class="muted" style="font-size:11px">報酬 ${yen(m.reward)}・人気 +${m.pop}</div></div>`).join('');
  const al: string[] = [];
  if (G0.pending.length) al.push(`<div class="alert info"><span>移籍のオファーが${G0.pending.length}件届いている</span><button class="btn small" data-act="nav" data-arg="transfer">見る</button></div>`);
  const inj = G0.squad.filter((p) => p.inj > 0); if (inj.length) al.push(`<div class="alert bad"><span>ケガ ${inj.length}人：${inj.slice(0, 5).map((p) => `${esc(p.name)}（${p.inj}週）`).join('、')}</span></div>`);
  if (!G0.gm.tac.auto) { const tired = G0.gm.tac.xi.map((id) => G0.squad.find((p) => p.id === id)).filter((p): p is Player => !!p && p.fat >= 45); if (tired.length) al.push(`<div class="alert"><span>先発に疲れている選手がいる：${tired.map((p) => esc(p.name)).join('、')}</span><button class="btn small" data-act="nav" data-arg="tactics">先発を見直す</button></div>`); }
  const want = G0.squad.filter((p) => p.wantOut); if (want.length) al.push(`<div class="alert"><span>移籍したいと言っている選手：${want.map((p) => esc(p.name)).join('、')}</span><button class="btn small" data-act="nav" data-arg="inbox">メッセージ</button></div>`);
  if (G0.week >= 44 && G0.squad.some((p) => p.contract <= 1)) al.push(`<div class="alert"><span>契約が今年で切れる選手がいる。選手の画面で更新するかを決めよう（決めなければ、今の条件で更新する）</span><button class="btn small" data-act="nav" data-arg="squad">選手を見る</button></div>`);
  if (G0.owner.money < 0) al.push(`<div class="alert bad"><span>お金が足りない。選手を売るか、出ていくお金を減らそう</span></div>`);
  const mini = rows.map((x, i) => `<tr class="${x.id === ME ? 'me' : ''} ${tier > 1 && i < 2 ? 'zone-up' : ''} ${tier < 3 && i >= 10 ? 'zone-down' : ''} ${tier === 3 && i < 2 ? 'zone-up' : ''}"><td class="num">${i + 1}</td><td>${clubLink(x.id)}</td><td class="r num">${x.w + x.d + x.l}</td><td class="r num">${x.gf - x.ga > 0 ? '+' : ''}${x.gf - x.ga}</td><td class="r num"><b>${x.w * 3 + x.d}</b></td></tr>`).join('');
  const mh = G0.gm.mh.filter((h) => h[0] === G0.season);
  const rep = S.ui.lastRes?.report as import('../core/types').ReportEntry[] | undefined;
  const ups = (rep ?? []).filter((e) => e.ups.some((v) => v >= 2) || e.awake || e.newSp || e.aptUp).slice(0, 6).map((e) => { const p = G0.squad.find((x) => x.id === e.pid); if (!p) return ''; const names = statNames(p);
    return `<div class="row"><span>${posTag(p.pos)} <b>${esc(p.name)}</b></span><span class="small">${e.awake ? '<span class="chip acc">覚醒！</span> ' : ''}${e.ups.map((v, i) => (v >= 2 ? `<span class="up2">${names[i]}+${v}</span>` : '')).filter(Boolean).join(' ')}${e.newSp ? ` <span class="chip good">新しい特殊能力「${esc(e.newSp)}」</span>` : ''}${e.cured ? ` <span class="chip">「${esc(e.cured)}」を克服</span>` : ''}${e.aptUp ? ` <span class="chip">${e.aptUp}の適性が上がった</span>` : ''}</span></div>`; }).join('');
  const news = G0.gm.news.slice(0, 40).map((n) => `<div class="news-item"><span class="when">${n.s}年 ${monthOf(n.w)}月</span><span class="t">${esc(n.t)}</span></div>`).join('');
  return `<div class="view-head"><h1>ホーム</h1><span class="muted">${G0.season}年目 ${monthOf(G0.week)}月 第${weekOfMonth(G0.week)}週・${tier}部</span></div>
  ${al.length ? `<div class="alerts">${al.join('')}</div>` : ''}
  <div class="grid g-home"><div class="grid">
    <section class="panel"><div class="panel-h"><h2>今週の試合</h2></div>${next}</section>
    <section class="panel"><div class="panel-h"><h2>今年の目標</h2><span class="chip ${goalOk ? 'good' : 'bad'}">${pl ? `いま ${rk}位` : '開幕前'}</span></div>
      <div class="row between"><div><div class="eyebrow">オーナー（${esc(G0.gm.owner)}）との約束</div><div style="font-size:16px;font-weight:700">${esc(gl)}</div></div><div class="num muted">${rows.find((x) => x.id === ME)!.w}勝 ${rows.find((x) => x.id === ME)!.d}分 ${rows.find((x) => x.id === ME)!.l}敗</div></div>
      <div class="eyebrow">今シーズンのミッション</div><div class="stack">${ms}</div></section>
    <section class="panel"><div class="panel-h"><h2>先週の成長</h2><button class="btn small ghost" data-act="weekReport">くわしく</button></div>${ups || '<div class="muted small">大きく伸びた選手はいなかった</div>'}</section>
    <section class="panel"><div class="panel-h"><h2>ニュース</h2></div><div class="news">${news || '<div class="muted">まだニュースはない</div>'}</div></section>
  </div><div class="grid">
    <section class="panel"><div class="panel-h"><h2>${tier}部の順位</h2><button class="btn small ghost" data-act="nav" data-arg="table">くわしく</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>クラブ</th><th class="r">試</th><th class="r">差</th><th class="r">勝点</th></tr></thead><tbody>${mini}</tbody></table></div>
      <div class="muted" style="font-size:11px">${tier > 1 ? '<span class="good">■</span> 上位2つが昇格　' : '<span class="good">■</span> 上位2つが昇格　'}${tier < 3 ? '<span class="bad">■</span> 下位2つが降格' : ''}</div></section>
    <section class="panel"><div class="panel-h"><h2>お金（今シーズン）</h2><span class="num ${moneyCls(G0.owner.money)}" style="font-size:18px;font-weight:700">${yen(G0.owner.money)}</span></div>
      ${lineChart('home-money', mh.map((h) => ({ label: `${monthOf(h[1])}月`, y: h[2] })), { fmt: (v) => yen(v), h: 150, zero: true, aria: '今シーズンのお金の動き' })}</section>
  </div></div>`;
};

/* ---------- 日程と結果 ---------- */
VIEWS.schedule = () => {
  const G0 = g(); const tier = myTier(G0); const L = G0.leagues[tier];
  const rows: string[] = [];
  const done = G0.sched.league.filter((w) => w < G0.week).length;
  for (let w = 0; w < 48; w++) {
    const li = G0.sched.league.indexOf(w); const ci = G0.sched.cup.indexOf(w);
    if (li < 0 && ci < 0) continue;
    let cells = '';
    if (li >= 0) {
      const [h, a] = L.fixtures[li].find(([x, y]) => x === ME || y === ME)!; const home = h === ME; const opp = home ? a : h;
      const res = li < done ? lastScore(li, h, a) : null;
      cells = `<td>リーグ第${li + 1}節</td><td>${home ? 'H' : 'A'}</td><td>${clubLink(opp)}</td><td>${res ?? '<span class="muted">-</span>'}</td>`;
    } else {
      const rd = G0.cup.rounds[ci]; const t = rd?.find((x) => x.a === ME || x.b === ME);
      let opp = '<span class="muted">組み合わせは当日</span>', sc = '<span class="muted">-</span>';
      if (t) { const meA = t.a === ME; opp = clubLink(meA ? t.b : t.a); const my = meA ? t.s![0] : t.s![1], op = meA ? t.s![1] : t.s![0]; const win = t.w === ME; sc = `<span class="form-chip ${win ? 'W' : 'L'}">${win ? '勝' : '敗'}</span> <b class="num" style="font-size:15px">${my} - ${op}</b>${t.pk ? ` <span class="muted">PK ${meA ? t.pk[0] : t.pk[1]}-${meA ? t.pk[1] : t.pk[0]}</span>` : ''}`; }
      else if (rd) opp = '<span class="muted">出番なし</span>';
      cells = `<td>天皇杯 ${CUP_ROUND_NAMES[ci]}</td><td></td><td>${opp}</td><td>${sc}</td>`;
    }
    rows.push(`<tr class="${w === G0.week ? 'me' : ''}"><td class="num muted">${monthOf(w)}月${weekOfMonth(w)}週</td>${cells}</tr>`);
  }
  const t2 = S.ui.schedTier ?? tier; const L2 = G0.leagues[t2]; const d2 = G0.sched.league.filter((w) => w < G0.week).length;
  const rd = Math.min(S.ui.schedRound ?? d2, d2);
  const round = rd > 0 ? `<div class="tbl-wrap"><table class="tbl"><tbody>${L2.fixtures[rd - 1].map(([h, a]) => `<tr class="${h === ME || a === ME ? 'me' : ''}"><td class="r">${clubLink(h)}</td><td class="c num" style="font-size:16px;font-weight:700">${lastScore(rd - 1, h, a, t2) ?? '-'}</td><td>${clubLink(a)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">まだ試合がない</div>';
  return `<div class="view-head"><h1>日程と結果</h1></div><div class="grid g2">
    <section class="panel"><h2>自分のクラブの日程</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>週</th><th>大会</th><th></th><th>相手</th><th>結果</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>
    <section class="panel"><div class="panel-h"><h2>節ごとの結果</h2><div class="tabs">${[1, 2, 3].map((x) => `<button class="tab ${x === t2 ? 'on' : ''}" data-act="schedTier" data-arg="${x}">${x}部</button>`).join('')}</div></div>
      ${d2 ? `<div class="row"><button class="btn small" data-act="schedRound" data-arg="${Math.max(1, rd - 1)}">◀</button><b>第${rd}節</b><button class="btn small" data-act="schedRound" data-arg="${Math.min(d2, rd + 1)}">▶</button></div>` : ''}${round}</section></div>`;
};
/** 終わった節の点（記録がないので、自分の対戦の記録から出す。ほかの試合は記録している結果を使う） */
function lastScore(li: number, h: number, a: number, tier = myTier(g())): string | null {
  const R = g().leagues[tier].res;
  const s = R?.[li]?.[g().leagues[tier].fixtures[li].findIndex(([x, y]) => x === h && y === a)];
  if (!s) return null;
  const meIdx = h === ME ? 0 : a === ME ? 1 : -1;
  if (meIdx < 0) return `${s[0]} - ${s[1]}`;
  const my = meIdx === 0 ? s[0] : s[1], op = meIdx === 0 ? s[1] : s[0]; return `<span class="form-chip ${my > op ? 'W' : my < op ? 'L' : 'D'}">${my > op ? '勝' : my < op ? '敗' : '分'}</span> <b class="num" style="font-size:15px">${s[0]} - ${s[1]}</b>`;
}
ACT.schedTier = (t) => { S.ui.schedTier = +t; S.ui.schedRound = null; render(); };
ACT.schedRound = (r) => { S.ui.schedRound = +r; render(); };

/* ---------- 順位表・天皇杯 ---------- */
VIEWS.table = () => {
  const G0 = g(); const t = S.ui.tableTier ?? myTier(G0); const rows = standings(G0, t);
  const body = rows.map((x, i) => `<tr class="${x.id === ME ? 'me' : ''} ${t > 1 && i < 2 ? 'zone-up' : ''} ${t === 3 && i < 2 ? 'zone-up' : ''} ${t < 3 && i >= 10 ? 'zone-down' : ''}"><td class="num">${i + 1}</td><td>${clubLink(x.id)}</td><td class="r num">${x.w + x.d + x.l}</td><td class="r num">${x.w}</td><td class="r num">${x.d}</td><td class="r num">${x.l}</td><td class="r num">${x.gf}</td><td class="r num">${x.ga}</td><td class="r num">${x.gf - x.ga > 0 ? '+' : ''}${x.gf - x.ga}</td><td class="r num"><b style="font-size:15px">${x.w * 3 + x.d}</b></td><td>${formChips(formOf(t, x.id))}</td><td class="r num muted">${teamStrength(x.id === ME ? G0.squad : x.c.squad).toFixed(1)}</td></tr>`).join('');
  const all: { p: Player; club: number }[] = [];
  for (const id of G0.leagues[t].ids) for (const p of id === ME ? G0.squad : clubById(G0, id).squad) all.push({ p, club: id });
  const top = all.filter((x) => x.p.seasonGoals > 0).sort((a, b) => b.p.seasonGoals - a.p.seasonGoals).slice(0, 10);
  const ast = all.filter((x) => (x.p.seasonAst ?? 0) > 0).sort((a, b) => (b.p.seasonAst ?? 0) - (a.p.seasonAst ?? 0)).slice(0, 10);
  const rt = all.filter((x) => x.p.seasonApps >= 5).sort((a, b) => avgRt(b.p) - avgRt(a.p)).slice(0, 10);
  const lead = (arr: typeof all, f: (p: Player) => string) => arr.map((x, i) => `<tr class="${x.club === ME ? 'me click' : ''}" ${x.club === ME ? `data-act="player" data-arg="${x.p.id}"` : ''}><td class="num">${i + 1}</td><td>${esc(x.p.name)} ${posTag(x.p.pos)}</td><td>${clubLink(x.club)}</td><td class="r num"><b>${f(x.p)}</b></td></tr>`).join('') || '<tr><td class="muted">まだ記録がない</td></tr>';
  const cup = G0.cup;
  const bk = cup.rounds.map((rd, i) => `<div class="bk-col"><div class="eyebrow">${CUP_ROUND_NAMES[i]}</div>${rd.map((m) => `<div class="bk-m"><div class="${m.w === m.a ? 'w' : ''} ${m.a === ME ? 'me' : ''}"><span>${esc(m.a === ME ? G0.club.name : clubById(G0, m.a).name)}</span><b class="num">${m.s?.[0] ?? ''}${m.pk ? `(${m.pk[0]})` : ''}</b></div><div class="${m.w === m.b ? 'w' : ''} ${m.b === ME ? 'me' : ''}"><span>${esc(m.b === ME ? G0.club.name : clubById(G0, m.b).name)}</span><b class="num">${m.s?.[1] ?? ''}${m.pk ? `(${m.pk[1]})` : ''}</b></div></div>`).join('')}</div>`).join('');
  return `<div class="view-head"><h1>順位表・天皇杯</h1><div class="tabs">${[1, 2, 3].map((x) => `<button class="tab ${x === t ? 'on' : ''}" data-act="tableTier" data-arg="${x}">${x}部</button>`).join('')}</div></div>
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>クラブ</th><th class="r">試</th><th class="r">勝</th><th class="r">分</th><th class="r">敗</th><th class="r">得</th><th class="r">失</th><th class="r">差</th><th class="r">勝点</th><th>最近の5試合</th><th class="r">強さ</th></tr></thead><tbody>${body}</tbody></table></div>
  <div class="muted" style="font-size:11px">${t > 1 || t === 3 ? '<span class="good">■</span> 上位2つが昇格（1部は優勝）　' : ''}${t < 3 ? '<span class="bad">■</span> 下位2つが降格　' : ''}強さ＝強いほうから11人の総合力の平均</div></section>
  <div class="grid g3"><section class="panel"><h2>得点</h2><div class="tbl-wrap"><table class="tbl"><tbody>${lead(top, (p) => String(p.seasonGoals))}</tbody></table></div></section>
  <section class="panel"><h2>アシスト</h2><div class="tbl-wrap"><table class="tbl"><tbody>${lead(ast, (p) => String(p.seasonAst ?? 0))}</tbody></table></div></section>
  <section class="panel"><h2>平均の評価点（5試合以上）</h2><div class="tbl-wrap"><table class="tbl"><tbody>${lead(rt, (p) => avgRt(p).toFixed(2))}</tbody></table></div></section></div>
  <section class="panel"><div class="panel-h"><h2>天皇杯</h2><span class="muted small">1回戦は2部と3部、2回戦から1部の下位4つ、3回戦から1部の上位8つが出てくる。引き分けはPK戦</span></div>${bk ? `<div class="bracket">${bk}</div>` : '<div class="empty">まだ始まっていない</div>'}${cup.champion != null ? `<div class="acc" style="font-weight:700">優勝：${esc(cup.champion === ME ? G0.club.name : clubById(G0, cup.champion).name)}</div>` : ''}</section>`;
};
ACT.tableTier = (t) => { S.ui.tableTier = +t; render(); };

/* ---------- トップチーム ---------- */
const SORTS: Record<string, (p: Player) => number | string> = {
  pos: (p) => POS.indexOf(p.pos) * 100 - ovr(p), name: (p) => p.name, age: (p) => p.age, ovr: (p) => ovr(p), pot: (p) => p.pot, fat: (p) => p.fat, cond: (p) => p.cond,
  contract: (p) => p.contract, salary: (p) => p.salary, apps: (p) => p.seasonApps, goals: (p) => p.seasonGoals, rt: (p) => avgRt(p), trust: (p) => p.trust ?? 50,
};
VIEWS.squad = () => {
  const G0 = g(); const sq = S.ui.sq ?? { k: 'pos', d: 1 }; const ps = [...G0.squad];
  ps.sort((a, b) => { const x = SORTS[sq.k](a), y = SORTS[sq.k](b); return (x > y ? 1 : x < y ? -1 : 0) * sq.d; });
  const th = (k: string, n: string, cls = '') => `<th class="sortable ${cls} ${sq.k === k ? 'sorted' : ''}" data-act="sqSort" data-arg="${k}">${n}${sq.k === k ? (sq.d > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const xi = new Set(G0.gm.tac.xi);
  const start = G0.gm.ms.startOvr;
  const rows = ps.map((p) => { const o = ovr(p); const d0 = start[p.id]; const dv = d0 != null ? o - d0 : 0;
    return `<tr class="click" data-act="player" data-arg="${p.id}"><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b>${p.fav ? ' ★' : ''}${xi.has(p.id) && !G0.gm.tac.auto ? ' <span class="chip acc">先発</span>' : ''}${p.reg ? '' : ' <span class="chip">登録外</span>'}${p.origin === 'ユース出身' ? ' <span class="chip">ユース</span>' : ''}${p.listed ? ' <span class="chip bad">売りに出し中</span>' : ''}${p.inj > 0 ? ` <span class="chip bad">ケガ${p.inj}週</span>` : ''}${p.wantOut ? ' <span class="chip bad">移籍希望</span>' : unhappy(p) ? ' <span class="chip">不満</span>' : ''}</td>
      <td>${spChips(p, 2)}</td><td class="r num">${p.age}</td><td class="r">${ovrChip(o)}${dv > 0 ? ` <span class="good num">+${dv}</span>` : dv < 0 ? ` <span class="bad num">${dv}</span>` : ''}</td><td>${potHtml(G0, p)}</td>
      <td>${condBar(p)}</td><td class="c">${condArrow(p.cond)}</td><td class="r num ${p.contract <= 1 ? 'warn' : ''}">${p.contract}年</td><td class="r num">${yen(p.salary)}</td>
      <td class="r num">${p.seasonApps}</td><td class="r num">${p.seasonGoals}</td><td class="r num">${p.seasonAst ?? 0}</td><td class="r num">${p.seasonRtN ? avgRt(p).toFixed(2) : '-'}</td></tr>`; }).join('');
  const pay = ps.reduce((s, p) => s + p.salary, 0);
  return `<div class="view-head"><h1>トップチーム</h1><span class="muted">${ps.length}人（最大35人・試合に出られるのは登録した${REG_SIZE}人）・給料の合計 ${yen(pay)}/年・強さ ${teamStrength(ps).toFixed(1)}</span></div>
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr>${th('pos', 'POS')}${th('name', '名前')}<th>特殊能力</th>${th('age', '年齢', 'r')}${th('ovr', '総合力', 'r')}${th('pot', '潜在')}${th('fat', '体力')}${th('cond', '調子', 'c')}${th('contract', '契約', 'r')}${th('salary', '年俸', 'r')}${th('apps', '出場', 'r')}${th('goals', '得点', 'r')}<th class="r">A</th>${th('rt', '平均評価', 'r')}</tr></thead><tbody>${rows}</tbody></table></div>
  <div class="muted" style="font-size:12px">行を押すと、能力・適性・特殊能力・契約・個別練習を見られる。総合力の右の数字は、今シーズンの伸び。潜在の★はコーチの見立てで、腕のいいコーチほど幅がせまい。</div></section>`;
};
ACT.sqSort = (k) => { const sq = S.ui.sq ?? { k: 'pos', d: 1 }; S.ui.sq = sq.k === k ? { k, d: -sq.d } : { k, d: ['name', 'pos', 'age', 'contract', 'fat'].includes(k) ? 1 : -1 }; render(); };

/* ---------- 戦術 ---------- */
/** 並び方の、ピッチ上の場所（％。下が自陣） */
export function slotXY(form: string): { x: number; y: number }[] {
  const slots = FORM[form]; const nCB = slots.filter((p) => p === 'CB').length;
  const Y: Record<Pos, number> = { GK: 7, CB: 21, SB: nCB >= 3 ? 46 : 26, DM: 37, CM: 50, AM: 63, WG: 70, ST: 83 };
  const spread = (n: number, i: number, w = 26) => (n === 1 ? 50 : 50 - w + ((2 * w) / (n - 1)) * i);
  const cnt: Record<string, number> = {}; const tot: Record<string, number> = {};
  for (const p of slots) tot[p] = (tot[p] ?? 0) + 1;
  return slots.map((p) => {
    const i = (cnt[p] = (cnt[p] ?? 0) + 1) - 1; const n = tot[p];
    if (p === 'SB' || p === 'WG') return { x: i % 2 === 0 ? 12 : 88, y: Y[p] };
    return { x: spread(n, i, p === 'CB' ? (n >= 3 ? 23 : 14) : p === 'CM' ? (n >= 3 ? 22 : 14) : 12), y: Y[p] };
  });
}
const ovrTintLight = (o: number) => (o >= 85 ? '#f1cd5e' : o >= 78 ? '#e3b06d' : o >= 70 ? '#d9975f' : o >= 62 ? '#8fdcae' : o >= 54 ? '#8cc8e6' : '#b8c4c8');
VIEWS.tactics = () => {
  const G0 = g(); const t = G0.gm.tac; const slots = FORM[t.form]; const xy = slotXY(t.form);
  const sq = regSquad(G0);
  const lines = `<svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none"><g fill="none" stroke="var(--chalk)" stroke-width=".35"><rect x="2" y="2" width="64" height="96"/><line x1="2" y1="50" x2="66" y2="50"/><circle cx="34" cy="50" r="8"/><rect x="16" y="2" width="36" height="15"/><rect x="25" y="2" width="18" height="5.5"/><rect x="16" y="83" width="36" height="15"/><rect x="25" y="92.5" width="18" height="5.5"/></g></svg>`;
  const plan = matchPlan(G0);
  /* 自動のときは、ヘッドコーチの予定の先発を見せる */
  const shownXI: (number | null)[] = t.auto ? slots.map((pos, i) => { const x = plan.lineup.filter((l) => l.pos === pos)[slots.slice(0, i).filter((q) => q === pos).length]; return x ? x.p.id : null; }) : t.xi;
  const dots = slots.map((pos, i) => { const id = shownXI[i]; const p = id != null ? G0.squad.find((x) => x.id === id) : undefined;
    const r = p ? Math.round(posRating(p, pos)) : 0; const ap = p ? p.apt[pos] : 3;
    return `<button class="slotp ${S.ui.sel === i ? 'sel' : ''} ${p && ap <= 1 ? 'mis' : ''} ${p ? '' : 'empty'}" style="left:${xy[i].x}%;bottom:${xy[i].y}%" data-act="slot" data-arg="${i}" title="${pos}${p ? `・適性${APT[ap]}` : ''}">
      <span class="dot" style="background:${p ? ovrTintLight(r) : ''}">${p ? r : pos}</span><span class="nm">${p ? `${pos} ${esc(p.name.split(' ')[0])}` : pos + ' 空き'}</span>${p ? `<span class="cb"><i style="width:${100 - p.fat}%;background:${p.fat <= 25 ? 'var(--good)' : p.fat <= 55 ? 'var(--warn)' : 'var(--bad)'}"></i></span>` : ''}</button>`; }).join('');
  const selPos = S.ui.sel != null ? slots[S.ui.sel] : null;
  const inXI = new Set(shownXI.filter((x): x is number => x != null));
  const list = [...sq].sort((a, b) => (selPos ? posRating(b, selPos) - posRating(a, selPos) : POS.indexOf(a.pos) - POS.indexOf(b.pos) || ovr(b) - ovr(a))).map((p) => {
    const fit = tacticFit(p, t.style);
    return `<tr class="click ${inXI.has(p.id) ? 'me' : ''}" data-act="pickXI" data-arg="${p.id}"><td>${posTag(p.pos)}</td><td>${esc(p.name)} ${p.inj > 0 ? `<span class="chip bad">ケガ${p.inj}週</span>` : ''}${(p.ban?.L ?? 0) > 0 ? '<span class="chip bad">出場停止</span>' : ''}</td><td class="r">${ovrChip(ovr(p))}</td>${selPos ? `<td class="r num">${Math.round(posRating(p, selPos))} <span class="muted">${APT[p.apt[selPos]]}</span></td>` : ''}<td>${condBar(p)}</td><td class="c">${condArrow(p.cond)}</td><td class="c">${fit > 0 ? '<span class="good">◎</span>' : fit < 0 ? '<span class="warn">△</span>' : '○'}</td><td>${spChips(p, 2)}</td></tr>`; }).join('');
  const kOpts = (k: 'ck' | 'fk' | 'pk') => { const ids = shownXI.filter((x): x is number => x != null); const cur = t.kick[k];
    return `<select class="input" style="width:auto" data-change="kick" data-arg="${k}"><option value="">ヘッドコーチに任せる（${esc(plan.kick[k]?.name ?? '-')}）</option>${ids.map((id) => { const p = G0.squad.find((x) => x.id === id)!; return `<option value="${id}" ${cur === id ? 'selected' : ''}>${esc(p.name)}（${p.pos}・${k === 'pk' ? 'シュート' : 'パス'}${Math.floor(p.a[k === 'pk' ? 1 : 2])}${p.sp.some((s) => /PKの名手|フリーキックの名手|プレースキッカー/.test(s)) ? '・キッカーの特殊能力' : ''}）</option>`; }).join('')}</select>`; };
  const sum = (arr: Pos[]) => { const xs = slots.map((pos, i) => ({ pos, p: G0.squad.find((x) => x.id === shownXI[i]) })).filter((x) => x.p && arr.includes(x.pos)); return xs.length ? xs.reduce((s, x) => s + posRating(x.p!, x.pos), 0) / xs.length : 0; };
  const rat: [string, number][] = [['攻め（AM・WG・ST）', sum(['AM', 'WG', 'ST'])], ['中盤（DM・CM）', sum(['DM', 'CM'])], ['守り（CB・SB）', sum(['CB', 'SB'])], ['キーパー', sum(['GK'])]];
  return `<div class="view-head"><h1>戦術</h1><div class="row"><button class="btn ${t.auto ? 'sel' : ''}" data-act="toggleAuto" aria-pressed="${t.auto}">先発をヘッドコーチに任せる：${t.auto ? 'オン' : 'オフ'}</button><button class="btn" data-act="autoXI">いまのいちばん良い先発にする</button></div></div>
  <div class="muted" style="font-size:12px">${t.auto ? `オンのあいだは、毎試合の前にヘッドコーチ（${esc(G0.mgr.name)}）が、調子・疲れ・適性を見て先発を選ぶ。ピッチの選手を自分で動かすとオフになる。` : 'オフ：毎試合、ここで決めた先発で戦う。出られない選手の枠は、ヘッドコーチが近い選手で埋める。'}　試合中の交代はヘッドコーチが行う（腕がいいほど判断が早い）。</div>
  <div class="tactics">
    <div class="grid"><div class="vpitch">${lines}${dots}</div>
      <section class="panel"><h2>先発の力（適性・調子込み）</h2>${rat.map(([n, v]) => `<div class="statbar"><span>${n}</span><div class="bar"><i style="width:${Math.min(100, v)}%;background:var(--accent)"></i></div><span class="val">${Math.round(v)}</span></div>`).join('')}
      <div class="muted" style="font-size:11px">ポジションの適性：◎そのまま・○少し下がる・△かなり下がる・×大きく下がる。赤い枠は△以下。</div></section></div>
    <div class="grid">
      <section class="panel"><h2>並び方</h2><div class="tabs">${Object.keys(FORM).map((f) => `<button class="tab ${f === t.form ? 'on' : ''}" data-act="form" data-arg="${f}">${f}</button>`).join('')}</div>
        <h3>戦い方</h3><div class="opt-grid">${STYLE_NAMES.map((k) => `<button class="opt ${k === t.style ? 'on' : ''}" data-act="style" data-arg="${k}"><b>${k}</b><span>${esc(STYLES[k].note)}。合う能力：${STYLES[k].key.map((i) => ['スピード', 'シュート', 'パス', 'ドリブル', 'フィジカル', 'ディフェンス', 'スタミナ', 'IQ'][i]).join('・')}</span></button>`).join('')}</div>
        <h3>攻めと守りの方針</h3><div class="opt-grid">${(Object.keys(MENT) as Ment[]).map((k) => `<button class="opt ${k === t.ment ? 'on' : ''}" data-act="ment" data-arg="${k}"><b>${MENT[k].n}</b><span>${MENT[k].d}</span></button>`).join('')}</div>
        <h3>キッカー</h3><div class="kv" style="grid-template-columns:auto 1fr;align-items:center"><dt>コーナーキック</dt><dd style="text-align:left">${kOpts('ck')}</dd><dt>フリーキック</dt><dd style="text-align:left">${kOpts('fk')}</dd><dt>PK</dt><dd style="text-align:left">${kOpts('pk')}</dd></div></section>
      <section class="panel"><div class="panel-h"><h2>選手を選ぶ（登録した選手）</h2><span class="muted" style="font-size:12px">${selPos ? `${selPos}の枠を選んでいる。入れたい選手を押す（もう一度枠を押すとやめる）` : 'ピッチの枠を押してから、選手を選ぶ。枠どうしを押すと入れかわる'}</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>POS</th><th>名前</th><th class="r">総合</th>${selPos ? `<th class="r">${selPos}での力</th>` : ''}<th>体力</th><th class="c">調子</th><th class="c" title="戦い方との相性">相性</th><th>特殊能力</th></tr></thead><tbody>${list}</tbody></table></div></section>
    </div></div>`;
};
function manual() { const t = g().gm.tac; if (t.auto) { const plan = matchPlan(g()); const slots = FORM[t.form]; t.xi = slots.map((pos, i) => { const x = plan.lineup.filter((l) => l.pos === pos)[slots.slice(0, i).filter((q) => q === pos).length]; return x ? x.p.id : null; }); t.auto = false; toast('先発を自分で決める形にした', 'ヘッドコーチに任せるのはオフになった'); } }
ACT.slot = (i) => { const k = +i; const t = g().gm.tac; if (S.ui.sel == null) S.ui.sel = k; else if (S.ui.sel === k) S.ui.sel = null; else { manual(); [t.xi[S.ui.sel], t.xi[k]] = [t.xi[k], t.xi[S.ui.sel]]; S.ui.sel = null; save(); } render(); };
ACT.pickXI = (id) => { const pid = +id; if (S.ui.sel == null) { ACT.player(id, document.body, new Event('x')); return; } const p = g().squad.find((x) => x.id === pid)!; if (p.inj > 0) { toast('出られない', `${p.name}はケガをしている`, 'bad'); return; }
  manual(); const t = g().gm.tac; const cur = t.xi.indexOf(pid); if (cur >= 0) [t.xi[cur], t.xi[S.ui.sel]] = [t.xi[S.ui.sel], t.xi[cur]]; else t.xi[S.ui.sel] = pid; S.ui.sel = null; save(); render(); };
ACT.toggleAuto = () => { const t = g().gm.tac; if (t.auto) manual(); else { t.auto = true; autoXI(g()); } S.ui.sel = null; save(); render(); };
ACT.autoXI = () => { autoXI(g()); const t = g().gm.tac; if (!t.auto) toast('先発を選び直した', '調子・疲れ・適性で、いまいちばん良い11人にした', 'good'); S.ui.sel = null; save(); render(); };
ACT.form = (f) => { setForm(g(), f); S.ui.sel = null; save(); render(); };
ACT.style = (s) => { g().gm.tac.style = s as never; save(); render(); };
ACT.ment = (m) => { g().gm.tac.ment = m as Ment; save(); render(); };
CHANGE.kick = (v, k) => { const kk = g().gm.tac.kick as Record<string, number | undefined>; if (v) kk[k] = +v; else delete kk[k]; save(); render(); };

/* ---------- 練習 ---------- */
VIEWS.training = () => {
  const G0 = g(); const tr = G0.gm.train; const C = G0.owner.coaches;
  const coach = (k: keyof typeof C, n: string) => { const c = C[k]; return `<div class="row between"><span>${n}</span><span>${c ? `${esc(c.name)} <span class="stars">${'★'.repeat(Math.max(1, Math.round(c.skill * 5)))}</span>` : '<span class="muted">いない</span>'}</span></div>`; };
  const ps = [...G0.squad].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos) || ovr(b) - ovr(a));
  const rows = ps.map((p) => { const names = statNames(p); const room = p.pot - ovr(p); const grow = p.age >= p.decl ? '下り坂' : room <= 0 ? '限界' : p.age >= p.gStart && p.age < p.gStart + p.gLen ? '成長期' : p.age < p.gStart ? 'これから' : 'ゆるやか';
    const gc = grow === '成長期' ? 'good' : grow === 'これから' ? 'acc' : grow === '下り坂' || grow === '限界' ? 'bad' : '';
    return `<tr><td>${posTag(p.pos)}</td><td class="click" data-act="player" data-arg="${p.id}"><b>${esc(p.name)}</b></td><td class="r num">${p.age}</td><td class="r">${ovrChip(ovr(p))}</td><td>${potHtml(G0, p)}</td><td>${p.gType ? `<span class="chip ${gc}">${esc(p.gType)}</span>` : `<span class="chip ${gc}" title="コーチの見立て（成長タイプは半年〜1年いるとわかる）">${grow}</span>`}</td><td>${condBar(p)}</td>
      <td><select class="input" style="padding:4px 8px;width:auto" data-change="tf" data-arg="${p.id}" aria-label="${esc(p.name)}の個別練習"><option value="-1">全体練習に合わせる</option>${names.map((n, i) => `<option value="${i}" ${p.tf === i ? 'selected' : ''}>${n}を重点的に</option>`).join('')}</select></td></tr>`; }).join('');
  return `<div class="view-head"><h1>練習</h1><span class="muted">練習場 レベル${G0.owner.fac.field}・ヘッドコーチの育てる腕 ${G0.mgr.grow.toFixed(2)}</span></div>
  <div class="grid g2"><section class="panel"><h2>全体練習のテーマ</h2><div class="opt-grid">${Object.entries(THEMES).map(([k, th]) => `<button class="opt ${k === tr.theme ? 'on' : ''}" data-act="trTheme" data-arg="${k}"><b>${th.n}</b><span>${th.d}</span></button>`).join('')}</div>
    <h3>練習の強さ</h3><div class="opt-grid">${Object.entries(INTENS).map(([k, it]) => `<button class="opt ${k === tr.inten ? 'on' : ''}" data-act="trInten" data-arg="${k}"><b>${it.n}</b><span>伸び ×${it.g}・疲れの抜け ${it.recov >= 0 ? '+' : ''}${it.recov}・${it.inj ? (it.inj > 0.003 ? 'ケガをしやすい' : 'ケガは少し') : 'ケガの心配なし'}</span></button>`).join('')}</div>
    <div class="muted" style="font-size:12px">伸び方は、成長期（選手ごとにちがう・隠れている）・潜在までの残り・コーチの腕・練習場・試合に出たかで決まる。春のキャンプ（2月）は伸びやすい。</div></section>
  <section class="panel"><h2>練習を受け持つコーチ</h2><div class="stack">${coach('off', 'オフェンス（シュート・パス・ドリブル）')}${coach('def', 'ディフェンス（ディフェンス・IQ）')}${coach('phys', 'フィジカル（スピード・フィジカル・スタミナ）')}${coach('gk', 'キーパー（キーパーの4項目）')}${coach('youth', 'ユース')}</div>
    <div class="muted" style="font-size:12px">腕のいいコーチほど、受け持つ能力がよく伸び、潜在の見立ても正確になる。入れかえは冬（12月）に「スタッフ」の画面で。</div><button class="btn small" data-act="nav" data-arg="staff">スタッフを見る</button></section></div>
  <section class="panel"><h2>個別練習</h2><div class="muted" style="font-size:12px">重点にした能力は約2.5倍伸び、ほかは少し伸びにくくなる。</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>POS</th><th>名前</th><th class="r">年齢</th><th class="r">総合</th><th>潜在</th><th>伸び方</th><th>体力</th><th>個別メニュー</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
};
ACT.trTheme = (k) => { g().gm.train.theme = k; save(); render(); };
ACT.trInten = (k) => { g().gm.train.inten = k; save(); render(); };
CHANGE.tf = (v, id) => { const p = g().squad.find((x) => x.id === +id); if (p) { p.tf = +v >= 0 ? +v : undefined; save(); } };

/* ---------- ユース ---------- */
VIEWS.youth = () => {
  const G0 = g(); const rep = G0.youthLog[G0.youthLog.length - 1];
  const line = (id: number) => rep?.lines.find((l) => l.pid === id);
  const ys = [...G0.youth].sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || POS.indexOf(a.pos) - POS.indexOf(b.pos));
  const rows = ys.map((p) => { const l = line(p.id); return `<tr><td class="num">${p.grade}年</td><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b> <span class="muted small">${esc(p.pref)}</span></td><td class="r num">${p.age}</td><td>${l ? `<span class="stars">${'★'.repeat(l.stars)}<span class="off">${'★'.repeat(5 - l.stars)}</span></span>` : '<span class="muted">-</span>'}</td><td>${l ? `${esc(l.words)} <b>${esc(l.arrow)}</b>` : '<span class="muted">報告待ち</span>'}</td><td class="small muted">${l ? esc(l.comment) : ''}</td><td class="r num">${p.yApps ?? 0}試合 ${p.yGoals ?? 0}点</td></tr>`; }).join('');
  return `<div class="view-head"><h1>ユース</h1><span class="muted">${ys.length}人・ユースの施設 レベル${G0.owner.fac.youth}・寮 レベル${G0.owner.fac.dorm}</span></div>
  <section class="panel"><div class="panel-h"><h2>${rep ? `${rep.season}年目 ${rep.month}月の報告` : 'ユースの子たち'}</h2><span class="muted small">数字は春の昇格会議（2月）ではじめて見える。毎月の報告は言葉と矢印だけ</span></div>
  ${rep?.coach ? `<div class="result-msg">ユースコーチ：「${esc(rep.coach)}」</div>` : ''}
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>学年</th><th>POS</th><th>名前</th><th class="r">年齢</th><th>評価</th><th>伸び方</th><th>コーチのひとこと</th><th class="r">ユースの試合</th></tr></thead><tbody>${rows || '<tr><td class="muted">ユースの子はいない</td></tr>'}</tbody></table></div></section>`;
};
export { val, trustStars, loveHearts };
