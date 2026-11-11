/* 経営会議（問113〜116）：報告する人が1人ずつ出てきて、タップで次へ。年の会議では目標・方針・予算を選ぶ。
   メッセージの受け取り箱（問112） */
import { closeMeeting, evalWord, type Msg } from '../core/meeting';
import { answerWantOut } from '../core/bond';
import type { GameState } from '../core/game';
import type { Policy } from '../core/match';
import { Rng } from '../core/rng';
import { $, $$, esc, sheet, toast, yen } from './dom';

const ROLE_ICON: Record<string, string> = { 経理: '¥', 営業: '♪', 監督: '監', コーチ: 'コ', ユースコーチ: 'ユ', スカウト: 'ス', 選手: '選' };
const face = (role: string) => `<span class="mface mface-${esc(role)}" aria-hidden="true">${ROLE_ICON[role] ?? '・'}</span>`;

export function openMeeting(G: GameState, done: () => void) {
  const m = G.meet; if (!m) { done(); return; }
  let k = 0; const n = m.items.length;
  const askHTML = (ask: string) => {
    if (ask === 'goal') return `<div class="mchoices">${m.goals!.map((g, i) => `<button class="mchoice" data-mg="${i}" aria-pressed="${m.pick.goal === i}"><span class="tag ${i === 0 ? 'bad' : i === 2 ? '' : 'gold'}">${g.level}</span><b>${esc(g.text)}</b>${i === 1 ? '<span class="muted small">監督のおすすめ</span>' : ''}</button>`).join('')}</div>
      <div class="muted small">むずかしい目標ほど、届いたときに監督の評価・人気・スポンサーが大きく上がる。届かないと下がる。</div>`;
    if (ask === 'policy') return `<div class="seg" role="group" aria-label="強化方針">${(['若手多め', 'ふつう', '勝ち優先'] as Policy[]).map((x) => `<button data-mp="${x}" aria-pressed="${m.pick.policy === x}">${x === '若手多め' ? '若手を育てる' : x === '勝ち優先' ? '勝ちを優先' : 'バランス'}</button>`).join('')}</div>`;
    if (ask === 'budget') return `<div class="mchoices">${m.budgets!.map((b, i) => `<button class="mchoice" data-mb="${i}" aria-pressed="${m.pick.budget === i}"><span class="tag">${['少なめ', 'ふつう', '多め'][i]}</span><b>${yen(b)}まで</b></button>`).join('')}</div>`;
    return '';
  };
  const show = () => {
    const last = k >= n;
    let body: string;
    if (!last) {
      const it = m.items[k];
      body = `<div class="mspeak">${face(it.role)}<div class="grow"><div class="mrole">${esc(it.role)}</div><div class="mwho">${esc(it.who)}</div></div></div>
        <div class="talk-bubble mbubble">${it.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>${it.ask ? askHTML(it.ask) : ''}`;
    } else {
      body = m.kind === 'year' ? `<section class="card"><h2>決まったこと</h2><dl class="kv"><dt>来年の目標</dt><dd>${esc(m.goals![m.pick.goal].text)}（${m.goals![m.pick.goal].level}）</dd><dt>強化方針</dt><dd>${m.pick.policy === '若手多め' ? '若手を育てる' : m.pick.policy === '勝ち優先' ? '勝ちを優先' : 'バランス'}</dd><dt>補強の予算</dt><dd>${yen(m.budgets![m.pick.budget])}まで</dd><dt>監督の評価</dt><dd>${evalWord(G.mgrEval ?? 60)}</dd></dl>
        <div class="muted small" style="margin-top:6px">このあと12月は、契約の更新と冬の移籍の期間。</div></section>` : `<section class="card"><h2>${esc(m.title)}は終わり</h2><div class="muted">また来月。</div></section>`;
    }
    sheet(`<div class="bar"><h2>${esc(m.title)}</h2><span class="muted small">${Math.min(k + 1, n + 1)} / ${n + 1}</span></div><div class="hubart hubart-office meetart" role="img" aria-label="会議室の絵"></div><div class="meet">${body}</div>`,
      `<div class="in2">${last ? '' : '<button class="btn ghost" id="mtSkip">最後まで飛ばす</button>'}<button class="btn primary" id="mtNext">${last ? '閉じる' : '次へ'}</button></div>`);
    $('#mtNext').addEventListener('click', () => { if (last) { closeMeeting(G); done(); } else { k++; show(); } });
    $('#mtSkip')?.addEventListener('click', () => { k = n; show(); });
    $$<HTMLElement>('[data-mg]').forEach((b) => b.addEventListener('click', () => { m.pick.goal = +b.dataset.mg!; show(); }));
    $$<HTMLElement>('[data-mb]').forEach((b) => b.addEventListener('click', () => { m.pick.budget = +b.dataset.mb!; show(); }));
    $$<HTMLElement>('[data-mp]').forEach((b) => b.addEventListener('click', () => { m.pick.policy = b.dataset.mp as Policy; show(); }));
  };
  show();
}

/** メッセージから飛べる先（古いメッセージは題名から決める） */
export type MsgGo = { to: 'scout' | 'player' | 'squad' | 'people'; pid?: number; label: string };
function goOf(G: GameState, x: Msg): MsgGo | null {
  if (x.from === 'スカウト') return { to: 'scout', label: 'スカウトの報告を見る' };
  const pid = x.pid ?? G.squad.find((p) => x.title.startsWith(p.name))?.id;
  if (pid != null && G.squad.some((p) => p.id === pid)) return { to: 'player', pid, label: 'この選手を見る' };
  if (x.from === '監督' && /連敗/.test(x.title)) return { to: 'squad', label: 'トップチームを見る' };
  if (x.from === '監督') return { to: 'people', label: 'スタッフを見る' };
  return null;
}
export function openInbox(G: GameState, back: () => void, save: () => void, go: (g: MsgGo) => void = () => {}) {
  let open = -1;
  const draw = () => {
    const box = G.inbox ?? [];
    const rows = box.map((x, i) => { const p = x.kind === 'wantOut' && x.pid != null ? G.squad.find((q) => q.id === x.pid && q.wantOut) : undefined;
      return `<div class="srow-wrap"><button class="srow mrow ${x.read ? '' : 'unread'}" data-mi="${i}" aria-expanded="${open === i}">${face(x.from)}<span class="grow" style="min-width:0"><span class="sname">${x.read ? '' : '<span class="dot" aria-label="読んでいない"></span>'}${esc(x.title)}</span><br><span class="pmeta">${esc(x.from)} ${esc(x.who)} ・ ${esc(x.at)}</span></span></button>
        ${open === i ? `<div class="sdetail"><div class="talk-bubble">${esc(x.body)}</div>${p ? `<div class="row" style="gap:6px;margin-top:6px"><button class="btn small primary" data-mwo="${p.id}:keep">残ってもらう</button><button class="btn small ghost" data-mwo="${p.id}:sell">売りに出す</button></div>` : ''}${goOf(G, x) ? `<button class="btn small primary wide" data-mgo="${i}" style="margin-top:8px">${goOf(G, x)!.label} ▶</button>` : ''}</div>` : ''}</div>`; }).join('');
    sheet(`<div class="bar"><h2>メッセージ</h2><span class="muted small">${box.filter((x) => !x.read).length}件 読んでいない</span></div>
      <div class="slist">${rows || '<div class="card muted">まだメッセージはない。選手・監督・コーチ・スカウトから届く。</div>'}</div>`,
      `<div class="in2">${box.some((x) => !x.read) ? '<button class="btn ghost" id="ibAll">全部読んだことにする</button>' : ''}<button class="btn primary" id="ibBack">もどる</button></div>`);
    $('#ibBack').addEventListener('click', back);
    $('#ibAll')?.addEventListener('click', () => { for (const x of box) x.read = true; save(); draw(); });
    $$<HTMLElement>('[data-mi]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.mi!; open = open === i ? -1 : i; box[i].read = true; save(); draw(); }));
    $$<HTMLElement>('[data-mgo]').forEach((b) => b.addEventListener('click', () => { const g = goOf(G, box[+b.dataset.mgo!]); if (g) go(g); }));
    $$<HTMLElement>('[data-mwo]').forEach((b) => b.addEventListener('click', () => { const [id, a] = b.dataset.mwo!.split(':'); const r = new Rng(G.rng); const msg = answerWantOut(G, +id, a === 'sell', r.next()); G.rng = r.s; toast(msg); save(); draw(); }));
  };
  draw();
}
