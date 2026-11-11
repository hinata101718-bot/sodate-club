/* アップデートのお知らせ（感想）：新しい版を開いた最初の1回だけ、何が変わったかを短く出す。
   新しい項目は、いちばん上に足していく（id は増やしていく） */
import { $, esc, sheet, closeSheet } from './dom';

export const CHANGES: { id: number; date: string; items: string[] }[] = [
  { id: 4, date: '11月12日', items: [
    'お金の数字をJリーグの目安にそろえた：スポンサー・入場料・選手の給料・移籍金・施設の値段が、だいたい現実の桁になった（いまのセーブのお金も約2.5倍にした）',
    '毎月の収支に、グッズの売り上げ・リーグからの分配金・試合の運営費と遠征費が入った',
    '選手登録・経営会議・メッセージで、押すたびに画面のいちばん上にもどらないようにした',
    '選手の画面に「表彰歴」が出る（MVP・得点王・アシスト王・ベストヤングプレイヤー賞・ベストイレブン。移籍しても残る）',
    'クラブに1年いる選手は、コーチが成長タイプ（早熟・ふつう・晩成・長く伸びる）を見きわめる。年末の会議で知らせ、選手の画面に出る（腕のいいコーチなら夏にわかる）',
  ] },
  { id: 3, date: '11月12日', items: [
    '実況が細かくなった：ボールを奪う・ドリブル・遠めのシュートなども出る。見どころにも、自分の選手のいいプレーが入る',
    '実況と解説の2人が、試合の前・前半のあと・試合のあとに話す',
    '実況の言い回しが増えた：点差や時間帯、選手の年齢やユース出身などで変わる。同じ試合で同じ言い方はくり返さない',
  ] },
  { id: 2, date: '11月12日', items: [
    '経営会議：全員が報告書を持ってきて、今月の不足と来月の動きを話す（監督の方針・コーチの練習の強さは、来月の試合に効く）',
    'メッセージから、その画面（スカウトの報告・選手）へ飛べる',
    '週の報告に、総合力がどれくらい上がったかが出る',
    '「先発で」と頼んだ選手が、適性のない場所で使われないようにした',
    '候補リストに入れた選手は、スカウトの報告から外れる',
    '特殊能力の札が、働いた場面の前に出る',
  ] },
  { id: 1, date: '11月11日', items: [
    'ホーム・チーム・経営・リーグ・経営会議・表彰式に、背景の絵が入った',
  ] },
];
const KEY = 'sodate-club:seen-change';
/** まだ見ていないお知らせがあれば出す。はじめて遊ぶ人には出さない（最新を見たことにする） */
export function showChangesOnce(kv: { getItem(k: string): string | null; setItem(k: string, v: string): void }, firstTime: boolean, done: () => void) {
  const latest = CHANGES[0].id; let seen = 0;
  try { seen = +(kv.getItem(KEY) ?? '0'); } catch { /* 読めないときは出す */ }
  const mark = () => { try { kv.setItem(KEY, String(latest)); } catch { /* 書けなくても遊べる */ } };
  if (firstTime) { mark(); done(); return; }
  const list = CHANGES.filter((c) => c.id > seen).slice(0, 3);
  if (!list.length) { done(); return; }
  sheet(`<div class="bar"><h2>アップデートのお知らせ</h2></div>
    ${list.map((c) => `<section class="card"><h2>${esc(c.date)}</h2><ul class="chlist">${c.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('')}
    <div class="muted small">セーブはそのまま続けて遊べます。</div>`,
    `<div class="in2 one"><button class="btn primary" id="chOk">はじめる</button></div>`);
  $('#chOk').addEventListener('click', () => { mark(); closeSheet(); done(); });
}
