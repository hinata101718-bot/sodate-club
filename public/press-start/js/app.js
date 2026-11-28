/* PRESS START の画面。文は docs/kaisha/nihongo.md の決まりで書く */
import * as S from "./sim.js";
import * as D from "./data.js";
import * as G from "./sprites.js";
import { createGarden } from "./garden.js";

const KEY = "press-start-save";
const TICK_MS = 37000 / D.TICKS_PER_WEEK; // ふつうの速さで1週＝約37秒（問34）
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let s = null;
let speed = 1;
let garden = null;
let view = null; // せり上がる画面：{tab, v, p}
let stack = [];
let blocking = false; // 止まる画面が出ているあいだは true
let accum = 0, lastNow = performance.now();
const fxQueue = [];
const drafts = {};

/* ===== 効果音（問51） ===== */
let ac = null;
function beep(kind) {
  if (!s || !s.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    const seq = { tap: [[880, 0.04]], score: [[660, 0.06], [990, 0.08]], hi: [[784, 0.08], [988, 0.08], [1319, 0.16]], awake: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.25]], goal: [[659, 0.1], [784, 0.1], [1047, 0.2]], low: [[330, 0.12], [262, 0.2]] }[kind] || [[880, 0.04]];
    let at = ac.currentTime;
    for (const [f, d] of seq) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0.05, at); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(g).connect(ac.destination); o.start(at); o.stop(at + d + 0.02);
      at += d * 0.9;
    }
  } catch (e) { /* 音が出せなくても遊べる */ }
}

/* ===== 保存（問38） ===== */
function save() { if (!s) return; try { localStorage.setItem(KEY, S.serialize(s)); } catch (e) { /* 保存できない環境 */ } }
function loadSaved() { try { const t = localStorage.getItem(KEY); return t ? S.deserialize(t) : null; } catch (e) { return null; } }

function toast(text) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

/* ===== 進める ===== */
function loop() {
  const now = performance.now();
  const dt = Math.min(1000, now - lastNow);
  lastNow = now;
  while (fxQueue.length && fxQueue[0].at <= now) { const e = fxQueue.shift(); garden && garden.showFx(e); }
  if (!s || s.over || blocking || document.hidden) return;
  if (s.pending.length) { showPending(); return; }
  accum += dt * (speed === 1 ? 1 : speed === 2 ? 2 : 0);
  let n = 0;
  while (accum >= TICK_MS && n < 4) {
    accum -= TICK_MS; n++;
    S.tick(s);
    const base = performance.now();
    for (const e of s.fx) fxQueue.push({ ...e, at: base + Math.random() * TICK_MS * (speed === 2 ? 0.45 : 0.9) });
    fxQueue.sort((a, b) => a.at - b.at);
    s.fx.length = 0;
    if (s.t % D.TICKS_PER_WEEK === 0) save();
    if (s.pending.length) break;
  }
  if (n) { renderTop(); refreshSheet(); }
  if (s.pending.length) showPending();
}

/* ===== 上の帯・メニュー ===== */
let progIdx = 0;
function renderTop() {
  if (!s) return;
  $("co").textContent = s.company;
  $("boss").textContent = `社長 ${s.boss}`;
  $("date").textContent = S.dateText(s.t);
  const m = $("money");
  m.textContent = S.yen(s.money);
  m.classList.toggle("neg", s.money < 0);
  const ub = $("logBadge");
  ub.hidden = !s.unread; ub.textContent = s.unread > 99 ? "99" : s.unread || "";
  document.querySelectorAll("#speed button").forEach((b) => b.classList.toggle("on", +b.dataset.sp === speed));
  const jobs = [...s.projects.map((p) => ({ team: p.team, name: p.title, prog: S.progress(p) })), ...s.contracts.map((c) => ({ team: c.team, name: c.title, prog: c.done / c.ticks }))];
  const pr = $("prog");
  if (!jobs.length) pr.innerHTML = `<span class="nm idle">作っているゲームはありません</span>`;
  else {
    const j = jobs[progIdx % jobs.length];
    const tm = s.teams.find((t) => t.id === j.team);
    pr.innerHTML = `<span class="tm">${esc(tm ? tm.name.replace("チーム", "") : "")}</span><span class="nm">${esc(j.name)}</span><span class="bar"><i style="width:${Math.round(j.prog * 100)}%"></i></span><span class="dot">${Math.round(j.prog * 100)}%</span>${jobs.length > 1 ? `<span class="pager">${jobs.map((_, i) => (i === progIdx % jobs.length ? "●" : "○")).join("")}</span>` : ""}`;
  }
  const g = S.currentGoal(s);
  $("goal").innerHTML = g ? `<b>目標</b><span>${esc(g.text)}</span>` : `<b>目標</b><span>ぜんぶ達成した</span>`;
  const o = D.OFFICES[s.office];
  $("place").innerHTML = `${["①", "②", "③"][s.office]} ${esc(o.name)}　<span class="dot">${s.staff.length}／${o.cap}</span>人`;
  renderNav();
}
const TABS = [["dev", "開発"], ["staff", "社員"], ["org", "組織"], ["biz", "経営"], ["ind", "業界"]];
function renderNav() {
  const nav = $("nav");
  if (!nav.childElementCount) {
    TABS.forEach(([k, name], i) => {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.tab = k;
      b.append(G.iconCanvas(i, "#1d3557"), name);
      const bd = document.createElement("span"); bd.className = "badge"; bd.hidden = true; b.appendChild(bd);
      nav.appendChild(b);
    });
  }
  nav.querySelectorAll("button").forEach((b, i) => {
    const on = view && view.tab === b.dataset.tab;
    if (b.classList.contains("on") !== !!on) {
      b.classList.toggle("on", !!on);
      b.querySelector("canvas").replaceWith(G.iconCanvas(i, on ? "#ffffff" : "#1d3557"));
    }
    const bd = b.querySelector(".badge");
    let n = 0;
    if (b.dataset.tab === "dev" && s) n = s.offers.length + s.teams.filter((t) => !S.teamBusy(s, t.id) && S.teamMembers(s, t.id).length).length;
    if (b.dataset.tab === "staff" && s) n = s.candidates.filter((c) => !c.grad).length;
    bd.hidden = !n; bd.textContent = n;
  });
}

/* ===== せり上がる画面（問59） ===== */
function openSheet(tab, v = "main", p = {}, push = false) {
  if (push && view) stack.push(view); else if (!push) stack = [];
  view = { tab, v, p };
  $("sheet").hidden = false;
  $("app").classList.add("sheeted");
  renderSheet();
  renderNav();
  garden && garden.redraw();
}
function closeSheet() {
  view = null; stack = [];
  $("sheet").hidden = true;
  $("app").classList.remove("sheeted");
  renderNav();
  garden && garden.redraw();
}
function back() { if (stack.length) { view = stack.pop(); renderSheet(); renderNav(); } else closeSheet(); }
function refreshSheet() {
  if (!view) return;
  const live = { dev: ["main", "game"], staff: ["main", "card"], org: ["main"], biz: ["main"], ind: ["main"], log: ["main"] };
  if (!(live[view.tab] || []).includes(view.v)) return;
  if (document.activeElement && document.activeElement.tagName === "INPUT") return;
  if (view.confirm) return;
  renderSheet(true);
}
function renderSheet(keepScroll) {
  const body = $("sheetBody");
  const old = body.querySelector(".scroll");
  const top = keepScroll && old ? old.scrollTop : 0;
  const r = VIEWS[view.tab][view.v](view.p);
  body.innerHTML = `<div class="sh">${stack.length ? `<button class="back" type="button" data-act="back">← もどる</button>` : ""}<h2>${r.title}</h2>${r.small ? `<small>${r.small}</small>` : ""}<button class="x" type="button" data-act="close">とじる ▼</button></div>${r.steps || ""}<div class="scroll">${r.html}</div>`;
  hydrate(body);
  const sc = body.querySelector(".scroll");
  if (sc) sc.scrollTop = top;
}

/* 顔の絵を入れる */
function hydrate(root) {
  root.querySelectorAll("canvas[data-pid]").forEach((cv) => {
    const p = s.staff.find((x) => x.id === +cv.dataset.pid) || s.candidates.find((x) => x.id === +cv.dataset.pid);
    if (p) draw(cv, { ...p.look, face: G.moodFace(p) });
  });
  root.querySelectorAll("canvas[data-critic]").forEach((cv) => draw(cv, G.CRITIC_LOOKS[+cv.dataset.critic]));
  root.querySelectorAll("canvas[data-boss]").forEach((cv) => draw(cv, G.BOSS_LOOK));
  const swap = (cv, nw) => { nw.className = cv.className; nw.style.cssText = cv.style.cssText; cv.replaceWith(nw); };
  root.querySelectorAll("canvas[data-con]").forEach((cv) => swap(cv, G.consoleCanvas(S.consoleOf(cv.dataset.con))));
  root.querySelectorAll("canvas[data-box]").forEach((cv) => { const g = s.games.find((x) => x.id === +cv.dataset.box); if (g) swap(cv, G.boxCanvas(g)); });
}
function draw(cv, look) { cv.width = 24; cv.height = 24; const c = cv.getContext("2d"); c.imageSmoothingEnabled = false; c.clearRect(0, 0, 24, 24); G.face(c, look); }
const faceTag = (p, cls = "face") => `<canvas class="${cls}" width="24" height="24" data-pid="${p.id}"></canvas>`;
const roleName = (p) => D.roleOf(p.role).name;
const rankName = (p) => D.RANKS[p.rank].name;
const mainStat = (p) => p.stats[D.roleOf(p.role).stat];
const statName = (k) => D.STATS.find((x) => x.key === k).name;
const genreName = (k) => D.GENRES.find((x) => x.key === k).name;
const themeName = (k) => D.THEMES.find((x) => x.key === k).name;
const sizeName = (k) => D.SIZES.find((x) => x.key === k).name;
const weeksLeft = (x) => Math.max(1, Math.ceil((x.ticks - x.done) / D.TICKS_PER_WEEK));
const mini = (v) => `<span class="mini${v < 30 ? " low" : ""}"><i style="width:${Math.round(v)}%"></i></span>`;

/* 社員のひとこと（問72） */
function lineOf(p) {
  const wk = Math.floor(s.t / D.TICKS_PER_WEEK);
  const k = (p.id * 7 + wk) % 12;
  let pool;
  if (p.rest || p.stamina < 25) pool = D.LINES.tired;
  else if (p.mood < 25) pool = D.LINES.low;
  else if (p.mood > 82) pool = D.LINES.happy;
  else if (!s.projects.some((x) => x.members.includes(p.id)) && !s.contracts.some((x) => x.members.includes(p.id)) && D.roleOf(p.role).dev) pool = k < 6 ? D.LINES.idle : D.traitOf(p.trait).line;
  else pool = k < 4 ? D.traitOf(p.trait).line : D.LINES[p.role];
  return pool[(p.id + wk) % pool.length];
}

/* ===== 画面ごとの中身 ===== */
const VIEWS = {
  dev: {
    main() {
      let h = "";
      for (const tm of s.teams) {
        const ms = S.teamMembers(s, tm.id);
        const pj = s.projects.find((x) => x.team === tm.id), ct = s.contracts.find((x) => x.team === tm.id);
        const L = tm.leader ? s.staff.find((p) => p.id === tm.leader) : null;
        h += `<div class="card${pj || ct ? " on" : ""}"><div class="row"><b class="grow">${esc(tm.name)}</b><span class="small">${L ? `リーダー ${esc(L.fam)}・` : ""}${ms.length}人</span></div>`;
        h += `<div class="faces" style="justify-content:start;grid-template-columns:repeat(8,26px);margin:6px 0">${ms.map((p) => `<button type="button" data-act="card" data-id="${p.id}">${faceTag(p, "")}</button>`).join("")}</div>`;
        if (pj) {
          const pr = Math.round(S.progress(pj) * 100);
          h += `<div class="row"><span class="grow ell dot" style="font-size:15px">『${esc(pj.title)}』</span><span class="num">${pr}%</span></div><div class="small">${genreName(pj.genre)} × ${themeName(pj.theme)}・${sizeName(pj.size)}・${esc(S.consoleOf(pj.console).name)}・のこり${weeksLeft(pj)}週</div><div class="bar" style="width:100%;margin-top:6px"><i style="width:${pr}%"></i></div>`;
        } else if (ct) {
          const pr = Math.round((ct.done / ct.ticks) * 100);
          h += `<div class="row"><span class="grow ell">受託：${esc(ct.title)}</span><span class="num">${pr}%</span></div><div class="small">終わると${S.yen(ct.pay)}が入る・のこり${weeksLeft(ct)}週</div><div class="bar" style="width:100%;margin-top:6px"><i style="width:${pr}%"></i></div>`;
        } else if (!ms.length) h += `<div class="hint">このチームには、作る職種の社員がいません。「社員」から採用してください。</div>`;
        else h += `<button class="btn go" type="button" data-act="new" data-id="${tm.id}" style="margin-top:4px">新しいゲームを作る</button>`;
        h += `</div>`;
      }
      if (s.offers.length) {
        h += `<div class="lbl">受託の仕事</div>`;
        const free = s.teams.filter((t) => !S.teamBusy(s, t.id) && S.teamMembers(s, t.id).length);
        for (const o of s.offers) {
          const d = S.dateOf(o.until);
          h += `<div class="card"><div>${esc(o.title)}</div><div class="row" style="margin-top:4px"><span class="small grow">${o.weeks}週・<span class="num" style="color:var(--green)">${S.yen(o.pay)}</span>・${d.month}月${d.week}週まで</span>${free.map((t) => `<button class="sbtn pri" type="button" data-act="take" data-id="${o.id}" data-team="${t.id}">${free.length > 1 ? esc(t.name) + "で" : ""}受ける</button>`).join("") || `<span class="small">空いているチームがありません</span>`}</div></div>`;
        }
      }
      h += `<div class="lbl">発売したゲーム（${s.games.length}本）</div>`;
      if (!s.games.length) h += `<div class="hint">まだありません。</div>`;
      else h += `<div class="list">${s.games.slice(0, 60).map((g) => `<button class="item" type="button" data-act="game" data-id="${g.id}"><span class="grow"><span class="ell" style="display:block">『${esc(g.title)}』</span><span class="small">${S.shortDate(g.releaseT)}・${esc(S.consoleOf(g.console).name)}${g.active ? "・<b style=\"color:var(--green)\">売れている</b>" : ""}</span></span><span class="num" style="font-size:15px">${g.total}点</span><span class="small" style="width:5.5em;text-align:right">${S.units(g.sold)}</span></button>`).join("")}</div>`;
      return { title: "開発", small: `${s.teams.length}チーム`, html: h };
    },
    new(p) {
      const d = draft(p.team);
      const pl = d.planner ? s.staff.find((x) => x.id === d.planner) : null;
      const cons = S.consolesOn(s.t);
      const yf = S.dateOf(s.t).yf;
      const size = D.SIZES.find((x) => x.key === d.size), con = S.consoleOf(d.console);
      const cost = size.cost + con.fee;
      let h = `<div class="planner">${pl ? faceTag(pl) : `<canvas class="face" width="24" height="24" data-boss="1"></canvas>`}<div>${pl ? `プランナーの${esc(pl.fam)}が、企画を3つ持ってきました。` : `プランナーがいないので、社長が企画を考えました。`}<br><span class="small">◎○△は${pl ? esc(pl.fam) : "社長"}の見立てです。企画の腕がいいほど当たります。</span></div></div>`;
      h += `<div class="lbl">企画</div>`;
      d.ideas.forEach((it, i) => { h += `<button class="idea${d.pick === i ? " on" : ""}" type="button" data-act="idea" data-i="${i}"><span class="g">${genreName(it.genre)} × ${themeName(it.theme)}</span><span class="fit"><b>${it.mark}</b>見立て</span><span class="m">「${esc(it.line)}」</span></button>`; });
      h += `<div class="lbl">規模</div><div class="seg">${D.SIZES.map((z) => `<button type="button" class="${d.size === z.key ? "on" : ""}" data-act="size" data-k="${z.key}">${z.name}<small>${z.weeks / 4}か月・${S.yen(z.cost)}</small></button>`).join("")}</div>`;
      h += `<div class="lbl">機種</div><div class="hw">${cons.map((c) => `<button type="button" class="${d.console === c.key ? "on" : ""}" data-act="con" data-k="${c.key}"><canvas width="10" height="7" data-con="${c.key}"></canvas><span>${esc(c.name)}<small>${c.kind}・${Math.round(S.installed(c, yf))}万台${c.fee ? `・${S.yen(c.fee)}` : ""}</small></span></button>`).join("")}</div>`;
      h += `<div class="lbl">タイトル</div><input class="titlein" id="titleIn" maxlength="16" value="${esc(d.title)}" aria-label="タイトル">`;
      h += `<div class="kv" style="margin-top:12px"><span>かかるお金</span><span class="num">${S.yen(cost)}</span><span class="sub">開発費${S.yen(size.cost)}${con.fee ? `＋機種代${S.yen(con.fee)}` : ""}</span><span></span></div>`;
      if (s.money < cost) h += `<div class="warnline">お金が足りません。あと${S.yen(cost - s.money)}です。「経営」から銀行で借りられます。</div>`;
      h += `<button class="btn go" type="button" data-act="toAssign" style="margin-top:12px"${d.pick == null ? " disabled" : ""}>担当を決める →</button>`;
      if (d.pick == null) h += `<div class="hint center">企画を1つ選んでください。</div>`;
      return { title: "新しいゲームを作る", steps: `<div class="steps"><span class="on">1 企画と規模</span><span>2 担当を決める</span></div>`, html: h };
    },
    assign(p) {
      const d = draft(p.team);
      const ms = S.teamMembers(s, p.team);
      const it = d.ideas[d.pick];
      const size = D.SIZES.find((x) => x.key === d.size), con = S.consoleOf(d.console);
      let h = `<div class="card on"><div class="dot" style="font-size:17px">『${esc(d.title)}』</div><div class="small">${genreName(it.genre)} × ${themeName(it.theme)}・${size.name}・${esc(con.name)}・${size.weeks}週</div></div>`;
      h += `<div class="lbl">担当（${d.members.size}人）</div>`;
      for (const m of ms) {
        const on = d.members.has(m.id);
        const tired = m.stamina < 30;
        h += `<button class="member${on ? " on" : ""}" type="button" data-act="mem" data-id="${m.id}"><span class="ck">${on ? "✓" : ""}</span>${faceTag(m, "face s")}<span class="grow"><b>${esc(m.fam)}</b> <span class="small">${roleName(m)}・${statName(D.roleOf(m.role).stat)}${mainStat(m)}</span>${tired ? ` <span class="tag warn">疲れている</span>` : ""}</span></button>`;
      }
      h += `<div class="hint">人数が多いほど出来はよくなりますが、1人あたりの働きは少し落ちます。絵と音は、デザイナーとサウンドがいないと伸びにくくなります。</div>`;
      h += `<button class="btn go" type="button" data-act="start" style="margin-top:8px"${d.members.size ? "" : " disabled"}>作りはじめる（${S.yen(size.cost + con.fee)}）</button>`;
      return { title: "新しいゲームを作る", steps: `<div class="steps"><span>1 企画と規模</span><span class="on">2 担当を決める</span></div>`, html: h };
    },
    game(p) {
      const g = s.games.find((x) => x.id === p.id);
      if (!g) return { title: "ゲーム", html: "" };
      const max = Math.max(1, ...g.weekly);
      const wk = g.weekly.slice(-40);
      let h = `<div class="row" style="align-items:flex-start;gap:12px"><canvas data-box="${g.id}" style="width:72px;height:90px;border:2px solid var(--navy)"></canvas><div class="grow"><div class="dot" style="font-size:18px;line-height:1.3">『${esc(g.title)}』</div><div class="small" style="line-height:1.7">${genreName(g.genre)} × ${themeName(g.theme)}・${sizeName(g.size)}<br>${esc(S.consoleOf(g.console).name)}・${S.shortDate(g.releaseT)}発売</div><div class="dot" style="font-size:20px;margin-top:4px">${g.total}<span style="font-size:12px">／40点</span></div></div></div>`;
      h += `<div class="lbl">売れ行き（週ごと）</div>${wk.length ? "" : `<div class="hint">来週からお店に並びます。</div>`}<div class="chart">${wk.map((n, i) => `<i class="${i === wk.length - 1 && g.active ? "last" : ""}" style="height:${Math.max(2, Math.round((n / max) * 100))}%"></i>`).join("")}</div>`;
      h += `<div class="kv" style="margin-top:8px"><span>売れた本数</span><span class="num">${S.units(g.sold)}</span><span>初週</span><span class="num">${g.weekly.length ? S.units(g.weekly[0]) : "これから"}</span><span>売上</span><span class="num">${S.yen(g.revenue)}</span><span>開発費</span><span class="num">${S.yen(g.cost)}</span><span>いま</span><span class="num" style="font-size:13px">${g.active ? "売れている" : "売れ行きが止まった"}</span></div>`;
      h += `<div class="lbl">レビュー</div><div class="revs">${g.reviews.map((r) => `<div class="r"><b>${r.score}</b><span><span class="small">${esc(r.name)}</span><br>「${esc(r.text)}」</span></div>`).join("")}</div>`;
      return { title: "ゲーム", html: h };
    },
  },
  staff: {
    main() {
      const o = D.OFFICES[s.office];
      let h = `<div class="list">${s.staff.map((p) => `<button class="item" type="button" data-act="card" data-id="${p.id}">${faceTag(p, "face s")}<span class="grow"><span style="display:block"><b>${esc(p.fam)} ${esc(p.given)}</b></span><span class="small"><span class="tag role">${roleName(p)}</span><span class="tag">${rankName(p)}</span>${p.rest ? `<span class="tag warn">休み</span>` : ""}</span></span><span class="num" style="font-size:16px;${mainStat(p) >= 70 ? "color:var(--gold)" : ""}">${mainStat(p)}</span><span class="small" style="display:flex;flex-direction:column;gap:3px;align-items:flex-end">体力${mini(p.stamina)}やる気${mini(p.mood)}</span></button>`).join("")}</div>`;
      if (!s.staff.length) h += `<div class="hint">まだ社員がいません。</div>`;
      h += `<div class="lbl">応募者</div>`;
      const cands = s.candidates;
      if (cands.length) h += cands.map((c) => candCard(c)).join("");
      else h += `<div class="hint">いまはいません。</div>`;
      if (S.capLeft(s) <= 0) h += `<div class="hint">机が空いていません。「経営」から引っ越すと、机が増えます。</div>`;
      h += `<button class="btn pri" type="button" data-act="recruit" style="margin-top:8px">求人を出す（${S.yen(S.recruitCost(s))}）</button><div class="hint">人事の社員がいると、いい人が集まりやすくなります。応募者は6週たつと、ほかの会社に決まります。</div>`;
      return { title: "社員", small: `${s.staff.length}／${o.cap}人・給料の合計 月${S.yen(s.staff.reduce((a, p) => a + p.salary, 0))}`, html: h };
    },
    card(p) {
      const x = s.staff.find((q) => q.id === p.id);
      if (!x) return { title: "社員", html: `<div class="hint">この社員はもういません。</div>` };
      const main = D.roleOf(x.role).stat;
      const next = D.RANKS[x.rank + 1];
      const prev = D.RANKS[x.rank];
      const tm = s.teams.find((t) => t.id === x.team);
      const job = s.projects.find((q) => q.members.includes(x.id)) || s.contracts.find((q) => q.members.includes(x.id));
      let h = `<div class="who">${faceTag(x)}<div><div class="nm">${esc(x.fam)} ${esc(x.given)}</div><div class="meta"><span class="tag role">${roleName(x)}</span><span class="tag">${rankName(x)}</span><span class="tag">${x.age}歳</span><span class="tag">${D.traitOf(x.trait).name}</span><br>${tm ? esc(tm.name) : esc(D.roleOf(x.role).dept || "")}・月給 ${S.yen(x.salary)}${job ? `<br>いま：${esc(job.title)}` : ""}</div></div></div>`;
      h += `<div class="say">「${esc(lineOf(x))}」</div>`;
      h += `<div class="st">${D.STATS.map((st) => { const v = x.stats[st.key]; return `<span class="${st.key === main ? "main" : ""}">${st.name}</span><span class="v${v >= 70 ? " hi" : ""}">${v}</span><span class="sb${v >= 70 ? " hi" : ""}"><i style="width:${v}%"></i></span>`; }).join("")}</div>`;
      const seg = (v) => { const n = Math.round(v / 20); return Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? "f" : ""}"></i>`).join(""); };
      h += `<div class="gauges"><div class="gauge">体力${x.rest ? "（休み）" : ""}<div class="g">${seg(x.stamina)}</div></div><div class="gauge">やる気<div class="g">${seg(x.mood)}</div></div>`;
      if (next) { const f = Math.round(((x.exp - prev.exp) / (next.exp - prev.exp)) * 10); h += `<div class="gauge exp" style="grid-column:1/3">${next.name}まで<div class="g">${Array.from({ length: 10 }, (_, i) => `<i class="${i < f ? "f" : ""}"></i>`).join("")}</div><small>経験は、ゲームを作るとたまります</small></div>`; }
      h += `</div>`;
      if (view.p.pick === "move") {
        h += `<div class="lbl">どのチームに移しますか？</div><div class="choices">${s.teams.map((t) => `<button class="sbtn${t.id === x.team ? " pri" : ""}" type="button" data-act="doMove" data-id="${x.id}" data-team="${t.id}">${esc(t.name)}</button>`).join("")}</div>`;
      } else if (view.p.pick === "role") {
        h += `<div class="lbl">どの職種にしますか？（かっこの中は、その職種で使う能力の数字です）</div><div class="choices">${D.ROLES.map((r) => `<button class="sbtn${r.key === x.role ? " pri" : ""}" type="button" data-act="doRole" data-id="${x.id}" data-k="${r.key}">${r.name}（${x.stats[r.stat]}）</button>`).join("")}</div>`;
      } else h += `<div class="btns"><button class="btn" type="button" data-act="pickMove" data-id="${x.id}"${D.roleOf(x.role).dev && s.teams.length > 1 ? "" : " disabled"}>異動</button><button class="btn" type="button" data-act="pickRole" data-id="${x.id}">職種を変える</button></div>`;
      if (D.roleOf(x.role).dev && s.teams.length < 2) h += `<div class="hint">チームが1つのあいだは、異動できません。</div>`;
      return { title: "社員", html: h };
    },
  },
  org: {
    main() {
      const devs = s.teams;
      const head = (role) => s.staff.filter((p) => (role === "dev" ? D.roleOf(p.role).dev : p.role === role)).sort((a, b) => b.rank - a.rank || b.exp - a.exp)[0];
      const depts = D.ROLES.filter((r) => !r.dev).map((r) => ({ r, ms: s.staff.filter((p) => p.role === r.key) })).filter((x) => x.ms.length);
      const empty = D.ROLES.filter((r) => !r.dev && !s.staff.some((p) => p.role === r.key)).map((r) => r.dept);
      const dh = head("dev");
      let teams = devs.map((t) => {
        const ms = S.teamMembers(s, t.id).filter((p) => p.id !== t.leader);
        const L = t.leader ? s.staff.find((p) => p.id === t.leader) : null;
        const job = s.projects.find((x) => x.team === t.id) || s.contracts.find((x) => x.team === t.id);
        return `<div class="ocol"><div class="node"><b>${esc(t.name)}</b>${L ? `<span class="lead"><button type="button" data-act="card" data-id="${L.id}">${faceTag(L, "")}</button>${rankName(L)} ${esc(L.fam)}</span><button class="dlg${t.delegate ? " on" : ""}" type="button" data-act="dlg" data-id="${t.id}">${t.delegate ? "✓ " : ""}分かれ道を任せる</button>` : `<button class="lead none" type="button" data-act="leader" data-id="${t.id}">＋ リーダーを任命</button>`}<span class="info">${job ? `${esc(job.title)} ${Math.round((job.done / job.ticks) * 100)}%` : "空き"}</span><div class="faces">${ms.map((p) => `<button type="button" data-act="card" data-id="${p.id}">${faceTag(p, "")}</button>`).join("")}</div></div></div>`;
      }).join("");
      const n = devs.length;
      let h = `<div class="orgwrap"><div class="org"><div class="node boss"><canvas width="24" height="24" data-boss="1"></canvas><div><b>社長</b><br><small>${esc(s.boss)}</small></div></div><div class="vl"></div>`;
      const cols = 1 + depts.length;
      h += `<div class="orow${cols === 1 ? " one" : ""}" style="--l:${cols > 1 ? 100 / cols / 2 : 50}%;--r:${cols > 1 ? 100 / cols / 2 : 50}%">`;
      h += `<div class="ocol"><div class="node dept"><b>開発部</b>${dh && dh.rank >= 3 ? `<span class="lead"><button type="button" data-act="card" data-id="${dh.id}">${faceTag(dh, "")}</button>部長 ${esc(dh.fam)}</span>` : ""}<span class="info">${s.staff.filter((p) => D.roleOf(p.role).dev).length}人・${n}チーム</span></div><div class="vl"></div><div class="orow${n === 1 ? " one" : ""}" style="--l:${100 / n / 2}%;--r:${100 / n / 2}%">${teams}</div></div>`;
      for (const d of depts) h += `<div class="ocol"><div class="node dept"><b>${d.r.dept}</b><div class="faces">${d.ms.map((p) => `<button type="button" data-act="card" data-id="${p.id}">${faceTag(p, "")}</button>`).join("")}</div></div></div>`;
      h += `</div>`;
      if (empty.length) h += `<div class="hint center" style="margin-top:12px">${empty.join("・")}には、まだ誰もいません。</div>`;
      h += `</div></div>`;
      h += `<div class="hint center">顔を押すと、社員カードが開きます。</div>`;
      if (S.teamCanAdd(s)) h += `<button class="btn" type="button" data-act="addTeam">チームを増やす</button>`;
      else if (s.teams.length < 3) h += `<div class="hint center">社員が8人になると、チームを増やせます。</div>`;
      return { title: "組織図", small: `社員 ${s.staff.length}人`, html: h };
    },
    leader(p) {
      const t = s.teams.find((x) => x.id === p.id);
      const ok = s.staff.filter((x) => x.rank >= D.LEADER_RANK && D.roleOf(x.role).dev);
      let h = `<div class="hint">${esc(t.name)}のリーダーを選んでください。リーダーになれるのは課長からです。リーダーがいると、チームの働きが少し上がり、分かれ道を任せられます。</div>`;
      if (!ok.length) h += `<div class="hint">いまは課長がいません。ゲームを作って経験を積むと、役職が上がります。</div>`;
      h += `<div class="list">${ok.map((x) => `<button class="item" type="button" data-act="setLeader" data-team="${t.id}" data-id="${x.id}">${faceTag(x, "face s")}<span class="grow"><b>${esc(x.fam)}</b> <span class="small">${rankName(x)}・${roleName(x)}・企画${x.stats.plan}</span></span></button>`).join("")}</div>`;
      if (t.leader) h += `<button class="btn" type="button" data-act="setLeader" data-team="${t.id}" data-id="">リーダーから外す</button>`;
      return { title: "リーダーを任命", html: h };
    },
  },
  biz: {
    main() {
      const o = D.OFFICES[s.office];
      const pay = s.staff.reduce((a, p) => a + p.salary, 0), rent = o.rent, rate = (s.loan * D.LOAN_RATE) / 12;
      let h = `<div class="kv"><span>手持ちのお金</span><span class="num" style="color:${s.money < 0 ? "var(--red)" : "var(--green)"}">${S.yen(s.money)}</span><span>毎月出ていくお金</span><span class="num">${S.yen(pay + rent + rate)}</span><span class="sub">給料${S.yen(pay)}・家賃${S.yen(rent)}${rate >= 1 ? `・利子${S.yen(rate)}` : ""}</span><span></span><span>今年の売上</span><span class="num">${S.yen(s.year.revenue)}</span><span>今年出ていったお金</span><span class="num">${S.yen(s.year.expense)}</span></div>`;
      const ms = s.months.slice(-6);
      if (ms.length) h += `<div class="lbl">月ごと</div><div class="rank" style="grid-template-columns:5em 1fr 1fr">${ms.map((m) => { const d = S.dateOf(m.t - 1); return `<span class="small">${d.year % 100}年${d.month}月</span><span class="n" style="color:var(--green)">＋${S.yen(m.in)}</span><span class="n">−${S.yen(m.out)}</span>`; }).join("")}</div>`;
      h += `<div class="lbl">銀行</div><div class="kv"><span>借りている</span><span class="num">${S.yen(s.loan)}</span><span>借りられる上限</span><span class="num">${S.yen(S.loanLimit(s))}</span>${s.loanDue ? `<span>返す期限</span><span class="num" style="font-size:13px">${S.shortDate(s.loanDue)}</span>` : ""}</div><div class="hint">年${Math.round(D.LOAN_RATE * 100)}%の利子がつきます。期限までに返せないと倒産します。</div>`;
      h += `<div class="btns"><button class="btn" type="button" data-act="borrow" data-v="100">¥100万借りる</button><button class="btn" type="button" data-act="borrow" data-v="500">¥500万借りる</button></div>`;
      if (s.loan > 0) h += `<div class="btns"><button class="btn" type="button" data-act="repay" data-v="100">¥100万返す</button><button class="btn" type="button" data-act="repay" data-v="all">全部返す</button></div>`;
      h += `<div class="lbl">事務所</div><div class="card"><b>${["①", "②", "③"][s.office]} ${esc(o.name)}</b><div class="small">机 ${o.cap}つ（いま${s.staff.length}人）・家賃 月${S.yen(o.rent)}</div></div>`;
      const nx = D.OFFICES[s.office + 1];
      if (nx) {
        h += `<div class="card"><span class="small">つぎの事務所</span><br><b>${["①", "②", "③"][s.office + 1]} ${esc(nx.name)}</b><div class="small">机 ${nx.cap}つ・家賃 月${S.yen(nx.rent)}・引っ越し代 ${S.yen(nx.move)}</div>`;
        if (view.confirm === "move") h += `<div class="btns"><button class="btn" type="button" data-act="cancel">やめる</button><button class="btn pri" type="button" data-act="doMoveOffice">引っ越す</button></div>`;
        else h += `<button class="btn pri" type="button" data-act="askMove" style="margin-top:8px"${s.money < nx.move ? " disabled" : ""}>引っ越す（${S.yen(nx.move)}）</button>${s.money < nx.move ? `<div class="hint">あと${S.yen(nx.move - s.money)}足りません。</div>` : ""}`;
        h += `</div>`;
      } else h += `<div class="hint">この先の事務所は、つぎの版で足します。</div>`;
      return { title: "経営", html: h };
    },
  },
  ind: {
    main() {
      const yf = S.dateOf(s.t).yf;
      const ind = S.industry(s);
      let h = `<div class="lbl">業界の順位（この1年の売上）</div><div class="rank">${ind.map((x, i) => `<span class="n">${i + 1}</span><span class="${x.mine ? "me" : ""}">${esc(x.name)}</span><span class="n">${S.yen(x.v)}</span>`).join("")}</div>`;
      h += `<div class="lbl">今週の売上ランキング</div>`;
      if (s.ranking.length) h += `<div class="rank">${s.ranking.map((r, i) => `<span class="n">${i + 1}</span><span class="ell ${r.mine ? "me" : ""}">『${esc(r.title)}』<span class="small"> ${esc(r.who)}</span></span><span class="n">${S.units(r.n)}</span>`).join("")}</div>`;
      else h += `<div class="hint">まだありません。</div>`;
      const T = s.trend;
      h += `<div class="lbl">今年の流行り</div><div class="card">${genreName(T.genre)}と${themeName(T.theme)}<div class="small">流行っているジャンルやテーマは売れやすく、評論家の点も上がりやすくなります。</div></div>`;
      h += `<div class="lbl">ゲーム機</div><div class="list">${D.CONSOLES.filter((c) => c.year <= S.dateOf(s.t).year + 0).map((c) => { const n = S.installed(c, yf); const old = n < 3; return `<div class="item"><canvas width="10" height="7" data-con="${c.key}" style="width:30px;height:21px"></canvas><span class="grow"><b>${esc(c.name)}</b> <span class="small">${c.kind}・${c.year}年${old ? "・販売終了" : ""}</span></span><span class="num">${Math.round(n)}万台</span></div>`; }).join("")}</div>`;
      h += `<div class="lbl">ゲーム大賞</div>`;
      h += s.award.length ? `<div class="list">${s.award.slice().reverse().map((a) => `<div class="item"><span class="num" style="width:3em">${a.year}</span><span class="grow ${a.mine ? "me" : ""}" style="${a.mine ? "color:var(--blue);font-weight:700" : ""}">『${esc(a.title)}』<span class="small"> ${esc(a.who)}</span></span><span class="num">${a.total}点</span></div>`).join("")}</div>` : `<div class="hint">年末に発表されます。</div>`;
      const g = S.currentGoal(s);
      h += `<div class="lbl">目標（${s.goalsDone.length}／${D.GOALS.length}）</div><div class="card on">${g ? esc(g.text) + `<div class="small">ごほうび ${S.yen(g.reward)}</div>` : "ぜんぶ達成しました"}</div>`;
      h += `<div class="list">${s.goalsDone.slice().reverse().map((x) => `<div class="item small"><span style="width:6em">${S.shortDate(x.t)}</span><span class="grow">✓ ${esc(D.GOALS.find((q) => q.key === x.key).text)}</span></div>`).join("")}</div>`;
      return { title: "業界", small: `${S.myRank(s)}位`, html: h };
    },
  },
  log: {
    main() {
      s.unread = 0;
      return { title: "記録", html: `<div class="list">${s.log.map((l) => `<div class="item" style="font-size:12px;align-items:flex-start"><span class="small" style="width:6.5em;flex:none">${S.shortDate(l.t)}${S.dateOf(l.t).week}週</span><span class="grow" style="${l.big ? "font-weight:700" : ""}">${esc(l.text)}</span></div>`).join("") || `<div class="hint">まだありません。</div>`}</div>` };
    },
  },
  set: {
    main() {
      let h = `<div class="lbl">音</div><button class="btn" type="button" data-act="sound">効果音：${s.sound ? "出す" : "出さない"}</button>`;
      h += `<div class="lbl">保存</div><div class="hint">遊んだ内容は、このiPhoneの中に自動で保存されます。念のため、ファイルにも書き出せます。</div><div class="btns"><button class="btn" type="button" data-act="export">ファイルに書き出す</button><label class="btn" style="cursor:pointer">ファイルを読みこむ<input type="file" accept=".json,application/json" id="importIn" hidden></label></div>`;
      h += `<div class="lbl">はじめから</div>`;
      if (view.confirm === "reset") h += `<div class="warnline">今の会社は消えます。書き出しておけば、あとで読みこんで戻せます。</div><div class="btns"><button class="btn" type="button" data-act="cancel">やめる</button><button class="btn pri" type="button" data-act="doReset">消して、はじめから</button></div>`;
      else h += `<button class="btn" type="button" data-act="askReset">はじめからやり直す</button>`;
      h += `<div class="hint center" style="margin-top:18px">PRESS START　最初の版</div>`;
      return { title: "設定", html: h };
    },
  },
};
function candCard(c) {
  const r = D.roleOf(c.role);
  const best = Object.entries(c.stats).filter(([k]) => k !== r.stat).sort((a, b) => b[1] - a[1])[0];
  const d = S.dateOf(c.until);
  return `<div class="card"><div class="row">${faceTag(c)}<div class="grow"><b>${esc(c.fam)} ${esc(c.given)}</b> <span class="small">${c.age}歳・${D.traitOf(c.trait).name}</span><div class="small"><span class="tag role">${r.name}</span>${statName(r.stat)} <span class="num" style="font-size:14px;color:var(--navy)">${c.stats[r.stat]}</span></div>${best[1] >= 30 ? `<div class="small">これも得意：${statName(best[0])} <span class="num">${best[1]}</span></div>` : ""}<div class="small">月給 ${S.yen(c.salary)}・${d.month}月${d.week}週まで</div></div><button class="sbtn pri" type="button" data-act="hire" data-id="${c.id}"${S.capLeft(s) <= 0 ? " disabled" : ""}>採用</button></div></div>`;
}

/* 企画の下書き（同じチームで4週以内なら、同じ企画のまま） */
function draft(team) {
  let d = drafts[team];
  if (!d || s.t - d.t > 4 * D.TICKS_PER_WEEK || S.teamBusy(s, team)) {
    const pr = S.proposals(s, team);
    const cons = S.consolesOn(s.t);
    const yf = S.dateOf(s.t).yf;
    const best = cons.slice().sort((a, b) => S.installed(b, yf) - S.installed(a, yf))[0];
    d = drafts[team] = { t: s.t, team, ideas: pr.ideas, planner: pr.planner, pick: null, size: "small", console: (cons.find((c) => c.fee === 0) || best).key, title: "", members: new Set(S.teamMembers(s, team).map((p) => p.id)) };
  }
  if (!S.consolesOn(s.t).some((c) => c.key === d.console)) d.console = S.consolesOn(s.t)[0].key;
  return d;
}

/* ===== 押したときの動き ===== */
function act(a, el) {
  const id = el.dataset.id != null && el.dataset.id !== "" ? +el.dataset.id : null;
  beep("tap");
  switch (a) {
    case "close": closeSheet(); return;
    case "back": back(); return;
    case "card": openSheet("staff", "card", { id }, true); return;
    case "new": openSheet("dev", "new", { team: id }, true); return;
    case "idea": { const d = draft(view.p.team); d.pick = +el.dataset.i; const it = d.ideas[d.pick]; d.title = S.makeTitle(s, it.genre, it.theme); renderSheet(true); return; }
    case "size": draft(view.p.team).size = el.dataset.k; renderSheet(true); return;
    case "con": draft(view.p.team).console = el.dataset.k; renderSheet(true); return;
    case "toAssign": { const d = draft(view.p.team); const ti = $("titleIn"); d.title = (ti && ti.value.trim()) || d.title; openSheet("dev", "assign", { team: view.p.team }, true); return; }
    case "mem": { const d = draft(view.p.team); d.members.has(id) ? d.members.delete(id) : d.members.add(id); renderSheet(true); return; }
    case "start": {
      const d = draft(view.p.team); const it = d.ideas[d.pick];
      const r = S.startProject(s, { genre: it.genre, theme: it.theme, size: d.size, console: d.console, team: d.team, members: [...d.members], title: d.title });
      if (!r.ok) { toast(r.why); return; }
      delete drafts[d.team];
      stack = []; view = { tab: "dev", v: "main", p: {} }; renderSheet(); renderTop();
      toast(`『${d.title}』を作りはじめた`);
      return;
    }
    case "take": { const r = S.takeOffer(s, id, +el.dataset.team); if (!r.ok) toast(r.why); renderSheet(true); renderTop(); return; }
    case "game": openSheet("dev", "game", { id }, true); return;
    case "recruit": { const r = S.recruit(s); toast(r.ok ? "求人を出した" : r.why); renderSheet(true); renderTop(); return; }
    case "hire": { const r = S.hire(s, id); toast(r.ok ? "採用した" : r.why); renderSheet(true); renderTop(); return; }
    case "pickMove": view.p.pick = "move"; renderSheet(true); return;
    case "pickRole": view.p.pick = "role"; renderSheet(true); return;
    case "doMove": { const r = S.transfer(s, id, +el.dataset.team); if (!r.ok) toast(r.why); view.p.pick = null; renderSheet(true); return; }
    case "doRole": { const r = S.changeRole(s, id, el.dataset.k); if (!r.ok) toast(r.why); view.p.pick = null; renderSheet(true); renderTop(); return; }
    case "leader": openSheet("org", "leader", { id }, true); return;
    case "setLeader": { const r = S.setLeader(s, +el.dataset.team, el.dataset.id === "" ? null : +el.dataset.id); if (!r.ok) { toast(r.why); return; } back(); return; }
    case "dlg": { const t = s.teams.find((x) => x.id === id); t.delegate = !t.delegate; renderSheet(true); return; }
    case "addTeam": { const r = S.addTeam(s); toast(r.ok ? "チームを増やした" : r.why); renderSheet(true); return; }
    case "borrow": { const r = S.borrow(s, +el.dataset.v); toast(r.ok ? "借りた" : r.why); renderSheet(true); renderTop(); return; }
    case "repay": { const r = S.repay(s, el.dataset.v === "all" ? s.loan : +el.dataset.v); toast(r.ok ? "返した" : r.why); renderSheet(true); renderTop(); return; }
    case "askMove": view.confirm = "move"; renderSheet(true); return;
    case "cancel": view.confirm = null; renderSheet(true); return;
    case "doMoveOffice": { view.confirm = null; const r = S.move(s); if (!r.ok) toast(r.why); else { beep("goal"); toast("引っ越した"); } renderSheet(true); renderTop(); garden.redraw(); return; }
    case "sound": s.sound = !s.sound; renderSheet(true); save(); return;
    case "export": exportSave(); return;
    case "askReset": view.confirm = "reset"; renderSheet(true); return;
    case "doReset": try { localStorage.removeItem(KEY); } catch (e) { /* なし */ } location.reload(); return;
  }
}
function exportSave() {
  save();
  const blob = new Blob([S.serialize(s)], { type: "application/json" });
  const a = document.createElement("a");
  const d = S.dateOf(s.t);
  a.href = URL.createObjectURL(blob);
  a.download = `press-start-${d.year}-${d.month}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("書き出した");
}
function importSave(file) {
  const r = new FileReader();
  r.onload = () => {
    try { s = S.deserialize(r.result); save(); toast("読みこんだ"); closeSheet(); renderTop(); garden.redraw(); }
    catch (e) { toast("読みこめませんでした。PRESS STARTで書き出したファイルを選んでください。"); }
  };
  r.readAsText(file);
}

/* ===== 止まる画面（問66） ===== */
function layer(html, cls = "dim") {
  const L = $("layer");
  L.innerHTML = `<div class="${cls}">${html}</div>`;
  hydrate(L);
  return L.firstElementChild;
}
function clearLayer() { $("layer").innerHTML = ""; blocking = false; }
function done() { s.pending.shift(); clearLayer(); renderTop(); refreshSheet(); save(); if (s.pending.length) showPending(); }

function showPending() {
  const e = s.pending[0];
  if (!e || blocking) return;
  blocking = true;
  const fn = { branch: showBranch, review: showReview, awake: showAwake, entrance: showEntrance, yearEnd: showYearEnd, goal: showGoal, warn: showWarn, bankrupt: showBankrupt }[e.kind];
  if (fn) fn(e); else done();
}
function showBranch(e) {
  const pj = s.projects.find((x) => x.id === e.pid);
  if (!pj) { done(); return; }
  const n = pj.brAt.length, i = pj.brDone;
  const tm = s.teams.find((t) => t.id === pj.team);
  const who = (tm.leader && s.staff.find((p) => p.id === tm.leader)) || S.planner(s, pj.team) || s.staff.find((p) => pj.members.includes(p.id));
  const stage = n === 2 ? ["開発のはじめ", "仕上げ"][i] : D.BRANCH_STAGE[i];
  const ask = n === 2 ? [D.BRANCH_ASK[0], D.BRANCH_ASK[2]][i] : D.BRANCH_ASK[i];
  const q = S.quality(s, pj);
  const pts = (k) => Math.round(q[k] * 50);
  const el = layer(`<div class="paused">‖ 一時停止中</div><div class="modal"><div class="step"><span class="pips">${Array.from({ length: n }, (_, k) => `<i class="${k <= i ? "f" : ""}"></i>`).join("")}</span>分かれ道 ${i + 1}／${n}・${stage}</div><h3>『${esc(pj.title)}』</h3><div class="now3"><span>面白さ<b>${pts("fun")}</b></span><span>絵<b>${pts("gfx")}</b></span><span>音<b>${pts("snd")}</b></span><span>のこり<b>${weeksLeft(pj)}週</b></span></div>${who ? `<div class="from">${faceTag(who)}<div>${esc(who.fam)}「${esc(ask)}」</div></div>` : ""}${e.opts.map((k) => { const b = D.BRANCHES.find((x) => x.key === k); return `<button class="choice" type="button" data-k="${k}">${b.label}<small><span class="up">${b.hint[0]}</span><span class="${b.weeks > 0 ? "dn" : "up"}">${b.hint[1]}</span></small></button>`; }).join("")}<div class="small">数字は、いまの時代に求められる出来を50としたときの目安です。</div></div>`);
  el.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => { beep("tap"); S.chooseBranch(s, pj.id, b.dataset.k); done(); }));
}
function showReview(e) {
  const g = s.games.find((x) => x.id === e.gid);
  if (!g) { done(); return; }
  let step = 0; // 0：まだ／奇数：感想／偶数：点数
  const el = layer(`<div class="in"><div class="ttl">レビュー発表</div><div class="pkg"><canvas data-box="${g.id}"></canvas><div><div class="game">${esc(g.title)}</div><div class="sub">${genreName(g.genre)} × ${themeName(g.theme)}・${sizeName(g.size)}<br>${esc(S.consoleOf(g.console).name)}<br>${S.shortDate(g.releaseT)} 発売</div></div></div><div class="critics">${g.reviews.map((r, i) => `<div class="critic" data-i="${i}"><canvas width="24" height="24" data-critic="${i}"></canvas><div class="score q">?</div><small>${esc(r.name)}</small></div>`).join("")}</div><div class="comment" id="cmt"><b>　</b>タップすると、1人ずつ発表します</div><div class="pre"><span>発売前の期待度<b class="dot">${"★".repeat(g.hype)}${"☆".repeat(5 - g.hype)}</b></span><span>予約<b class="dot">${S.units(g.preorder)}</b></span></div><div class="tally"><div class="total">合計 <span id="tot">0</span> ／ 40</div></div><div id="rvEnd" class="tap">タップで次へ</div></div>`, "full");
  const crit = el.querySelectorAll(".critic");
  const total = () => g.reviews.slice(0, Math.floor(step / 2)).reduce((a, r) => a + r.score, 0);
  function next() {
    if (step >= 8) return;
    step++;
    const i = Math.ceil(step / 2) - 1;
    crit.forEach((c, k) => c.classList.toggle("now", k === i));
    if (step % 2 === 1) { el.querySelector("#cmt").innerHTML = `<b>${esc(g.reviews[i].name)}</b>「${esc(g.reviews[i].text)}」`; beep("tap"); }
    else { const sc = crit[i].querySelector(".score"); sc.textContent = g.reviews[i].score; sc.className = "score pop" + (g.reviews[i].score >= 9 ? " hi" : ""); beep(g.reviews[i].score >= 9 ? "hi" : g.reviews[i].score <= 3 ? "low" : "score"); el.querySelector("#tot").textContent = total(); }
    if (step === 8) {
      crit.forEach((c) => c.classList.remove("now"));
      const end = el.querySelector("#rvEnd");
      end.className = "btns"; end.style.width = "100%"; end.style.maxWidth = "360px";
      end.innerHTML = `<button class="btn" type="button" data-x="close">とじる</button><button class="btn pri" type="button" data-x="sales">売れ行きを見る</button>`;
      if (g.total >= 30) beep("goal");
    }
  }
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-x]");
    if (b) { const go = b.dataset.x === "sales"; done(); if (go) openSheet("dev", "game", { id: g.id }); return; }
    next();
  });
}
function showAwake(e) {
  const p = s.staff.find((x) => x.id === e.pid);
  if (!p) { done(); return; }
  beep("awake");
  const el = layer(`<div class="in awake"><canvas class="rays"></canvas><h2>覚醒！！</h2><canvas class="hero" width="24" height="24" id="hero"></canvas><div class="nm">${esc(p.fam)} ${esc(p.given)}（${roleName(p)}・${p.age}歳）</div><div class="gain">${statName(e.stat)} <span class="dot">${e.before}</span> → <span class="dot to">${e.after}</span> <span class="dot plus">+${e.after - e.before}</span></div><div class="tap">タップでもどる</div></div>`, "full");
  draw(el.querySelector("#hero"), { ...p.look, face: "sparkle" });
  const cv = el.querySelector(".rays");
  requestAnimationFrame(() => {
    const W = Math.floor(cv.clientWidth / 3), H = Math.floor(cv.clientHeight / 3);
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    const cx = W / 2, cy = H * 0.42;
    G.px(c, 0, 0, W, H, "#1d3557");
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = Math.atan2(y - cy, x - cx); if (Math.floor((a + Math.PI) / (Math.PI / 10)) % 2 === 0) G.px(c, x, y, 1, 1, "#24426b"); }
    [[0.15, 0.15], [0.85, 0.2], [0.1, 0.7], [0.9, 0.75], [0.3, 0.9], [0.75, 0.08]].forEach(([fx, fy]) => { const x = Math.round(W * fx), y = Math.round(H * fy); G.px(c, x - 1, y, 3, 1, "#e0a21b"); G.px(c, x, y - 1, 1, 3, "#e0a21b"); });
  });
  el.addEventListener("click", done);
}
function showEntrance(e) {
  const render = () => {
    const grads = e.ids.map((id) => s.candidates.find((c) => c.id === id)).filter(Boolean);
    const el = layer(`<div class="modal"><h3>入社式の季節</h3><div class="small">新卒が${e.ids.length}人、面接に来ました。給料は安めで、伸びしろがあります。空いている机は${Math.max(0, S.capLeft(s))}つです。</div>${grads.map((c) => candCard(c)).join("") || `<div class="hint">全員の返事が決まりました。</div>`}<button class="btn" type="button" data-x="end">面接を終える</button></div>`);
    el.addEventListener("click", (ev) => {
      const h = ev.target.closest("[data-act=hire]");
      if (h) { const r = S.hire(s, +h.dataset.id); beep("tap"); toast(r.ok ? "採用した" : r.why); blocking = false; render(); blocking = true; return; }
      if (ev.target.closest("[data-x=end]")) { e.ids.forEach((id) => { s.candidates = s.candidates.filter((c) => c.id !== id); }); done(); }
    });
  };
  render();
}
function showYearEnd(e) {
  const a = e.award, m = e.sum;
  const pay = s.staff.reduce((x, p) => x + p.salary, 0);
  let h = `<div class="modal"><h3>${m.year}年の終わり</h3>`;
  if (a) h += `<div class="card${a.mine ? " on" : ""}"><div class="small">${a.year}年 ゲーム大賞</div><div class="dot" style="font-size:18px">『${esc(a.title)}』</div><div class="small">${esc(a.who)}・${a.total}点</div>${a.mine ? `<div class="big">${esc(s.company)}が取った！</div>` : ""}</div>`;
  h += `<div class="kv"><span>1年の売上</span><span class="num">${S.yen(m.revenue)}</span><span>出ていったお金</span><span class="num">${S.yen(m.expense)}</span><span>差し引き</span><span class="num" style="color:${m.revenue - m.expense >= 0 ? "var(--green)" : "var(--red)"}">${S.yen(m.revenue - m.expense)}</span><span>出したゲーム</span><span class="num">${m.games}本</span><span>業界の順位</span><span class="num">${m.rank}位</span></div>`;
  h += `<div class="lbl">ボーナス</div><div class="small">払うと、社員のやる気が上がります。</div>`;
  h += `<button class="choice" type="button" data-b="2">たっぷり払う<small>給料1.5か月分・${S.yen(pay * 1.5)}</small></button><button class="choice" type="button" data-b="1">少し払う<small>給料0.5か月分・${S.yen(pay * 0.5)}</small></button><button class="choice" type="button" data-b="0">払わない<small class="dn">やる気が下がる</small></button></div>`;
  const el = layer(h);
  if (a && a.mine) beep("goal");
  el.querySelectorAll("[data-b]").forEach((b) => b.addEventListener("click", () => { beep("tap"); S.payBonus(s, +b.dataset.b); done(); }));
}
function showGoal(e) {
  beep("goal");
  const g = D.GOALS.find((x) => x.key === e.key), nx = S.currentGoal(s);
  const el = layer(`<div class="modal center"><div class="small">目標達成</div><h3>${esc(g.text)}</h3><div class="big">＋${S.yen(e.reward)}</div>${nx ? `<div class="small">つぎの目標：${esc(nx.text)}</div>` : `<div class="small">最初の版の目標は、これでぜんぶです。</div>`}<button class="btn pri" type="button">つづける</button></div>`);
  el.querySelector("button").addEventListener("click", done);
}
function showWarn() {
  beep("low");
  const el = layer(`<div class="modal"><h3>お金が足りません</h3><div>もう銀行からは借りられません。来月の給料と家賃（${S.yen(S.monthlyCost(s))}）を払えないと、倒産します。</div><div class="small">受託の仕事を受けるか、売れているゲームの売上を待ってください。</div><button class="btn pri" type="button">閉じる</button></div>`);
  el.querySelector("button").addEventListener("click", done);
}
function showBankrupt(e) {
  beep("low");
  try { localStorage.removeItem(KEY); } catch (er) { /* なし */ }
  const best = s.games.slice().sort((a, b) => b.sold - a.sold)[0];
  const el = layer(`<div class="modal center"><div class="small">${S.dateText(s.t)}</div><h3>${esc(s.company)}は倒産した</h3><div>${esc(e.why)}</div><div class="kv" style="text-align:left"><span>続けた年数</span><span class="num">${Math.floor(s.t / 192)}年${Math.floor((s.t % 192) / 16)}か月</span><span>出したゲーム</span><span class="num">${s.games.length}本</span>${best ? `<span>いちばん売れた</span><span class="num" style="font-size:12px">『${esc(best.title)}』${S.units(best.sold)}</span>` : ""}</div><button class="btn pri" type="button">はじめからやり直す</button></div>`);
  el.querySelector("button").addEventListener("click", () => location.reload());
}

/* ===== はじめ方（問48） ===== */
function showTitle() {
  const saved = loadSaved();
  blocking = true;
  const el = layer(`<div class="in"><div style="margin-top:auto"></div><div class="logo">PRESS START</div><div class="press">ゲーム会社をはじめる</div><div class="form" id="form">${saved ? `<button class="btn go" type="button" data-x="cont">つづきから</button><div class="small center">${esc(saved.company)}・${S.dateText(saved.t)}</div><div class="lbl" style="margin:6px 0 0">はじめから</div>` : ""}<label>社名<input id="inCo" maxlength="12" placeholder="例：ほしぞらソフト" autocomplete="off"></label><label>社長の名前<input id="inBoss" maxlength="8" placeholder="例：ヒナタ" autocomplete="off"></label><button class="btn ${saved ? "" : "go"}" type="button" data-x="new">${saved ? "新しい会社をはじめる" : "はじめる"}</button>${saved ? `<div class="small">新しい会社をはじめると、今の会社は消えます。</div>` : ""}</div><div style="margin-bottom:auto"></div><div class="small">1980年4月、自宅のガレージから。</div></div>`, "full title");
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-x]");
    if (!b) return;
    if (b.dataset.x === "cont") { s = saved; start(); return; }
    const co = $("inCo").value.trim(), boss = $("inBoss").value.trim();
    if (!co || !boss) { toast("社名と社長の名前を入れてください"); return; }
    s = S.newGame(co, boss);
    save();
    start(true);
  });
}
function start(fresh) {
  clearLayer();
  garden = createGarden($("garden"), { state: () => s, onTap: (id) => openSheet("staff", "card", { id }) });
  renderTop();
  if (fresh) showFirstHire();
}
function showFirstHire() {
  blocking = true;
  const el = layer(`<div class="modal"><h3>最初の社員</h3><div class="small">応募者は3人です。まず1人を採用してください。ほかの2人も、${(() => { const d = S.dateOf(s.candidates[0].until); return `${d.month}月${d.week}週`; })()}までは「社員」から採用できます。<br>面白いゲームを作るには、プランナーかプログラマーがいると心強いです。</div>${s.candidates.map((c) => candCard(c)).join("")}</div>`);
  el.addEventListener("click", (ev) => {
    const h = ev.target.closest("[data-act=hire]");
    if (!h) return;
    beep("tap");
    S.hire(s, +h.dataset.id);
    s.fx.length = 0;
    S.note(s, "下の「開発」から、最初のゲームを作れます", { bubble: false });
    clearLayer();
    renderTop();
    save();
    setTimeout(() => garden.showFx({ kind: "bubble", text: "下の「開発」から、最初のゲームを作れます", who: null }), 400);
  });
}

/* ===== つなぐ ===== */
$("nav").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-tab]");
  if (!b || !s) return;
  beep("tap");
  if (view && view.tab === b.dataset.tab && !stack.length) closeSheet(); else openSheet(b.dataset.tab);
});
$("speed").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; speed = +b.dataset.sp; beep("tap"); renderTop(); });
$("prog").addEventListener("click", () => { if (!s) return; const n = s.projects.length + s.contracts.length; if (n > 1) { progIdx++; renderTop(); } else openSheet("dev"); });
$("logBtn").addEventListener("click", () => { if (!s) return; openSheet("log"); renderTop(); });
$("setBtn").addEventListener("click", () => { if (!s) return; openSheet("set"); });
$("sheetBody").addEventListener("click", (ev) => { const a = ev.target.closest("[data-act]"); if (a && !a.disabled) act(a.dataset.act, a); });
$("sheetBody").addEventListener("change", (ev) => { if (ev.target.id === "importIn" && ev.target.files[0]) importSave(ev.target.files[0]); });
// 引っぱって閉じる
let gy = null;
$("grip").addEventListener("pointerdown", (ev) => { gy = ev.clientY; $("grip").setPointerCapture(ev.pointerId); });
$("grip").addEventListener("pointerup", (ev) => { if (gy != null && ev.clientY - gy > 40) closeSheet(); gy = null; });
$("grip").addEventListener("click", () => { if (gy == null) closeSheet(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); lastNow = performance.now(); });
addEventListener("pagehide", save);

setInterval(loop, 100);
showTitle();
// 確かめるための入口（アドレスの最後が #debug のときだけ）
if (location.hash === "#debug") window.__ps = { S, get s() { return s; }, get blocking() { return blocking; }, run(n) { for (let i = 0; i < n && s && !s.over && !s.pending.length; i++) { S.tick(s); s.fx.length = 0; if (s.pending.length) break; } renderTop(); refreshSheet(); }, speed(v) { speed = v; } };
