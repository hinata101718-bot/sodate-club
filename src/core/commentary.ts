/* 実況と解説（問121〜123）
   - 実況：試合の流れ（ボールを奪う・ドリブル・遠めのシュート・パスがつながる）を細かく伝える
   - 実況と解説の2人が、試合の前（前ふり）・前半のあと・試合のあと（ふり返り）に話す
   - 言い回しは、点差・時間帯・選手の特徴（年齢・ユース出身・ベテラン・今季の得点）・大事な試合で変える
   - 1試合の中で、同じ言い回しはなるべくくり返さない */
import type { Rng } from './rng';
import type { Line, Player, Token } from './types';

export const ANNOUNCER = '真鍋 一平';
export const ANALYST = '大門 剛史';
export type Who = '実況' | '解説';

/* ---------- くり返さない選び方 ---------- */
let used = new Set<string>();
export function resetPhrases() { used = new Set(); }
export function pickFresh(r: Rng, list: string[]): string {
  const fresh = list.filter((x) => !used.has(x));
  const t = r.pick(fresh.length ? fresh : list);
  used.add(t); return t;
}
/** {A}{D}{T}{O}{N}{M} を札や数字に置きかえる */
export function fillLine(tpl: string, map: Record<string, Token>): Line {
  const out: Line = []; const re = /\{([A-Z])\}/g; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) { if (m.index > last) out.push(tpl.slice(last, m.index)); out.push(map[m[1]] ?? ''); last = re.lastIndex; }
  if (last < tpl.length) out.push(tpl.slice(last));
  return out.filter((x) => x !== '');
}

/* ---------- 試合の流れの出来事（問121） ---------- */
export type PlayKind = 'tk' | 'dr' | 'off' | 'blk' | 'sv' | 'chain';
export const PLAY: Record<PlayKind, string[]> = {
  tk: ['{D} が {A} からボールを奪った。', '{D} の読みが当たった。{A} へのパスをカット。', '{D} が後ろから足を伸ばして、ボールをつつき出す。', '{A} が持ちすぎた。{D} がすかさず奪う。', '{D} が体を入れて、{A} からボールを取り上げた。', '{D} がパスコースに入っていた。インターセプト。', '{A} のトラップが少し大きい。{D} が見逃さない。', '{D} のスライディングがボールだけを捉えた。'],
  dr: ['{A} がドリブルで1人かわした。', '{A} が細かいタッチで前へ運ぶ。{D} は付いていけない。', '{A} のフェイントに、{D} が逆を取られた。', '{A} が {D} の横をすり抜けていく。', '{A} がボールを持つと、スタンドがざわつく。また1人かわした。', '{A} が切り返して、{D} を外す。', '{A} がスピードに乗った。{D} は後ろから追うだけ。'],
  off: ['{A} が遠めから狙った。ボールは枠の外。', '{A} のミドルシュート。少し浮いてしまった。', '{A} が思い切って打つ。ゴールの横へそれた。', '{A} が振り抜いたが、当たりがよくない。', '{A} の角度のないシュートは、サイドネットの外。', '{A} のシュートは、ゴールの上を越えていく。'],
  blk: ['{A} のシュートを、{D} が体で止めた。', '{A} が打つ。{D} が足を伸ばしてブロック。', '{A} のミドルは、{D} に当たってコーナーキック。', '{D} が体を投げ出して、{A} のシュートをはね返す。'],
  sv: ['{A} のシュートを、{D} ががっちりキャッチ。', '{A} の遠めのシュート。{D} が正面で抑えた。', '{A} が狙ったが、{D} は落ち着いていた。', '{A} のシュートは、{D} の胸の中へ。'],
  chain: ['{T} が後ろからていねいにパスをつなぐ。{A} を中心に、もう10本近く回っている。', '{T} のパス回しが続く。{A} が何度もボールを受ける。', '{T} がボールを持つ時間が長い。{A} が左右に散らす。', '{T} が落ち着いてボールを動かす。{O} はなかなか奪えない。'],
};
export function playLine(r: Rng, k: PlayKind, map: Record<string, Token>): Line { return fillLine(pickFresh(r, PLAY[k]), map); }

/* ---------- ゴールのあとのひとこと（点差・時間帯・選手の特徴：問123 A・B） ---------- */
export interface GoalCtx { min: number; flow: string | null; lead: number; first: boolean; p: Player; seasonGoals: number; headed: boolean; mem: boolean; me: boolean }
export function goalComment(r: Rng, c: GoalCtx, name: Token): Line | null {
  const time: string[] = [];
  if (c.min <= 5 && c.first) time.push('開始早々の先制点！', 'いきなり試合が動いた！');
  else if (c.min >= 78 && c.first) time.push('終盤に、ついに均衡が破れた！', 'ようやく試合が動いた！ この時間の先制点！');
  else if (c.min >= 85 && c.flow === '同点') time.push('土壇場で追いついた！', 'この時間に、同点ゴール！');
  else if (c.min >= 85 && (c.flow === '勝ち越し' || c.flow === '逆転')) time.push('終了間際の勝ち越しゴール！', 'この時間に決めた！ 大きな1点！');
  else if (c.flow === '逆転') time.push('ついに試合をひっくり返した！', '逆転です！');
  else if (c.lead >= 3) time.push(`これで${c.lead}点差。`, `${c.lead}点差。試合はかなり決まってきた。`);
  else if (c.flow === '同点') time.push('すぐに追いついた！', '振り出しにもどした！');
  const who: string[] = [];
  if (c.mem) who.push('{N}、プロ初ゴール！', 'プロになって初めてのゴール、{N}！');
  else if (c.p.age <= 19) who.push(`${c.p.age}歳の {N} が決めた！`, `まだ${c.p.age}歳、{N}！`);
  if (c.p.origin === 'ユース出身' && c.me) who.push('ユース育ちの {N}！', 'クラブのユースから上がってきた {N}！');
  if (c.p.age >= 33) who.push('ベテラン {N}、さすがの一発。', '経験がものを言った。{N}！');
  if (c.seasonGoals >= 8) who.push(`{N}、これで今季${c.seasonGoals}点目！`, `今季${c.seasonGoals}点目。{N} が止まらない！`);
  if (c.headed && c.p.height >= 186) who.push('長身を生かした、{N} のヘディング！', `${c.p.height}センチ、{N} が頭で決めた！`);
  const parts: string[] = [];
  if (time.length) parts.push(pickFresh(r, time));
  if (who.length && (r.next() < 0.75 || !parts.length)) parts.push(pickFresh(r, who));
  if (!parts.length) return null;
  return fillLine(parts.join(' '), { N: name });
}
/** 同点のまま終盤：決定機のあとに、ときどきひとこと */
export const LATE_TIE = ['同点のまま、時間がなくなっていく。', 'どちらに転ぶか、まったくわからない。', 'あと少しで決まっていた。スタンドから大きなため息。'];

/* ---------- 試合の前・前半のあと・試合のあと（問122） ---------- */
export interface Stakes { kind: '' | '優勝' | '昇格' | '残留' | '決勝' | '地元'; text?: string }
const S = (who: Who, line: Line) => ({ who, line });
export interface MicLine { who: Who; line: Line }
export function preTalk(r: Rng, home: Token, away: Token, info: string, st: Stakes, ace: { name: Token; goals: number } | null): MicLine[] {
  const out: MicLine[] = [];
  const open = st.kind === '決勝' ? ['天皇杯、いよいよ決勝です。{H} 対 {W}。', 'ついに決勝の舞台。{H} と {W} が向かい合います。']
    : st.kind === '優勝' ? ['優勝の行方を左右する一戦。{H} 対 {W}。', '負けられない試合です。{H} 対 {W}、優勝争いの大一番。']
    : st.kind === '昇格' ? ['昇格をかけた大事な一戦。{H} 対 {W}。', '上の段へ。昇格争いの直接対決、{H} 対 {W}。']
    : st.kind === '残留' ? ['残留をかけた、負けられない試合。{H} 対 {W}。', '下の段に落ちるわけにはいかない。{H} 対 {W}。']
    : st.kind === '地元' ? ['同じ地方どうしの一戦です。{H} 対 {W}。スタンドの熱も違います。', 'お隣どうしの対決、{H} 対 {W}。']
    : ['{H} 対 {W}。まもなくキックオフです。', 'こんにちは。今日は {H} のホームで、{W} との一戦です。', 'さあ、{H} 対 {W}。試合が始まります。'];
  out.push(S('実況', fillLine(pickFresh(r, open) + (info ? ` ${info}` : ''), { H: home, W: away })));
  if (ace) out.push(S('解説', fillLine(pickFresh(r, ace.goals >= 3 ? [`注目は {N}。今季もう${ace.goals}点取っています。`, `{N} に、いい形でボールを入れたいですね。今季${ace.goals}点です。`] : ['注目は {N} ですね。今日も中心になるはずです。', '{N} がどれだけボールに触れるか。そこが見どころです。']), { N: ace.name })));
  return out;
}
export interface HalfInfo { score: [number, number]; poss: [number, number]; shots: [number, number]; names: [Token, Token]; star: { name: Token; why: string } | null }
export function halfTalk(r: Rng, h: HalfInfo): MicLine[] {
  const [a, b] = h.poss; const lead = h.score[0] === h.score[1] ? -1 : h.score[0] > h.score[1] ? 0 : 1;
  const L1 = lead < 0 ? ['前半を終えて {S}。ボールを持った時間は {P}、シュートは {X}。', '前半は {S} で折り返し。シュートは {X} です。'] : ['前半を終えて、{L} が {S} でリード。ボールを持った時間は {P}。', '{L} がリードして前半終了。シュートは {X} です。'];
  const out: MicLine[] = [S('実況', fillLine(pickFresh(r, L1), { S: `${h.score[0]} - ${h.score[1]}`, P: `${a}% 対 ${b}%`, X: `${h.shots[0]}本 対 ${h.shots[1]}本`, L: lead === 1 ? h.names[1] : h.names[0] }))];
  if (h.star) out.push(S('解説', fillLine(pickFresh(r, ['前半は {N} が効いていますね。{W}', '{N} がいいですね。{W}', '目立っているのは {N}。{W}']), { N: h.star.name, W: h.star.why })));
  return out;
}
export interface FullInfo { score: [number, number]; pk: [number, number] | null; names: [Token, Token]; poss: [number, number]; winner: 0 | 1 | null; decider: { name: Token; min: number } | null;
  mom: { name: Token; rt: string; why: string } | null; saves: { name: Token; n: number } | null; final: boolean; big: boolean }
export function fullTalk(r: Rng, f: FullInfo): MicLine[] {
  const out: MicLine[] = [];
  const sc = `${f.score[0]} - ${f.score[1]}`;
  if (f.winner == null) out.push(S('実況', fillLine(pickFresh(r, ['試合終了。{S} の引き分けです。', '{S}。勝ち点1ずつを分け合いました。', '決着はつかず。{S} で終わりました。']), { S: sc })));
  else {
    const w = f.names[f.winner];
    const diff = Math.abs(f.score[0] - f.score[1]);
    const lines = f.pk ? [`PK戦の末、{W} が勝ち上がりました！`, '{W}、PK戦を制しました！'] : f.final ? ['{W}、優勝です！ この大会の頂点に立ちました！', '{W} が決勝を制しました！'] : diff >= 3 ? ['{S}。{W} の完勝でした。', '{W} が {S} の大勝です。'] : f.big ? ['{W}、大きな勝利です！ {S}！', '{S}。大事な試合で、{W} が勝ちました！'] : ['試合終了。{S} で {W} の勝利です。', '{W} が {S} で勝ちました。', '{S}。{W} が勝ち点3をつかみました。'];
    out.push(S('実況', fillLine(pickFresh(r, lines), { W: w, S: sc })));
    if (f.decider && diff === 1 && !f.pk) out.push(S('実況', fillLine(pickFresh(r, ['決勝点は{M}分、{N} でした。', '{M}分の {N} のゴールが、勝負を決めました。']), { N: f.decider.name, M: String(f.decider.min) })));
  }
  if (f.mom) out.push(S('解説', fillLine(pickFresh(r, ['今日いちばんよかったのは {N}。評価点は{R}です。{W}', 'MOMは {N}。{R}。{W}', '{N} ですね。{W}評価点{R}、文句なしです。']), { N: f.mom.name, R: f.mom.rt, W: f.mom.why })));
  const [a, b] = f.poss;
  if (f.winner != null && ((f.winner === 0 && a < 45) || (f.winner === 1 && b < 45))) out.push(S('解説', fillLine(pickFresh(r, ['ボールは持たれましたが、少ないチャンスを決め切りましたね。', 'ボールを持った時間は{P}。それでも勝つ。したたかな試合でした。']), { P: `${a}% 対 ${b}%` })));
  else if (f.saves && f.saves.n >= 4) out.push(S('解説', fillLine(pickFresh(r, ['{N} のセーブも大きかった。{K}本止めています。', 'キーパーの {N} が{K}本のセーブ。チームを救いました。']), { N: f.saves.name, K: String(f.saves.n) })));
  else out.push(S('解説', fillLine(pickFresh(r, ['ボールを持った時間は{P}でした。', '{P}。ボールの持ち方にも、両チームの色が出ていました。']), { P: `${a}% 対 ${b}%` })));
  return out.slice(0, 4);
}
