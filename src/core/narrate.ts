/* 見どころの文（感想 1・2・9・15）
   1つの場面を「展開 → 勝負 → シュート → 結果」の行に分ける。結果は最後の行だけに書く。
   特殊能力が働いた行は {sp} の札で出す。GKの特殊能力が働いて入らなかったときは、必ずGKが止めた文にする */
import type { Rng } from './rng';
import type { Line, Token } from './types';
import type { Fire, OnPl } from './match';
import { PH } from './phrases';

interface SideLike { t: { me: boolean } }

export function narrate(r: Rng, scene: string, A: SideLike, D: SideLike, att: OnPl, assist: OnPl | null, def: OnPl, g: OnPl,
  ok: boolean, goal: boolean, fires: Fire[], shotFires: Fire[], headed: boolean, rec: OnPl | null, gkFired: boolean): Line[] {
  const a = (x: OnPl): Token => ({ t: x.p.name, me: A.t.me });
  const d = (x: OnPl): Token => ({ t: x.p.name, me: D.t.me });
  const foot = att.p.foot === '左' ? '左足' : att.p.foot === '両' ? (r.next() < 0.5 ? '右足' : '左足') : '右足';
  const as = assist || att;
  /** 文のひな形を、名前の札に置きかえる。{A}=攻める選手 {S}=起点の選手 {D}=守る選手 {G}=GK {R}=取り返す選手 {F}=利き足 */
  const fill = (tpl: string): Line => {
    const out: Line = [];
    const re = /\{(A|S|D|G|R|F)\}/g; let last = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(tpl))) {
      if (m.index > last) out.push(tpl.slice(last, m.index));
      const k = m[1];
      out.push(k === 'A' ? a(att) : k === 'S' ? a(as) : k === 'D' ? d(def) : k === 'G' ? d(g) : k === 'R' ? d(rec || def) : foot);
      last = re.lastIndex;
    }
    if (last < tpl.length) out.push(tpl.slice(last));
    return out;
  };
  const P = (list: string[]) => fill(r.pick(list));
  const B: Line[] = [];
  const ph = PH[scene] || PH.through;
  B.push(P(ph.open));
  if (ph.duel.length) B.push(P(ph.duel));
  if (ph.win.length) B.push(P(ok ? ph.win : ph.lose));
  /* 特殊能力の札は、それが働いた場面の直前に出す（クロス・パス・起点の能力は、ボールを出す行の前。勝負の能力は、勝ち負けの行の前） */
  const early = fires.filter((u) => ['feed', 'cross', 'pass', 'win'].includes(u.step ?? '') || (!u.step && assist && u.t === assist.p.name && ['チャンスメーカー', '攻撃参加'].includes(u.sp)));
  const late = fires.filter((u) => !early.includes(u));
  if (late.length) B.splice(Math.max(1, B.length - 1), 0, late.map((u) => ({ sp: u.sp, t: u.t, me: u.me })));
  const feed = early.filter((u) => u.step === 'feed'), mid = early.filter((u) => u.step !== 'feed');
  if (mid.length) B.splice(Math.min(1, B.length), 0, mid.map((u) => ({ sp: u.sp, t: u.t, me: u.me })));
  if (feed.length) B.splice(0, 0, feed.map((u) => ({ sp: u.sp, t: u.t, me: u.me })));
  if (ok) {
    if (scene === 'pk') B.push(P(PH.shot.pk));
    else if (scene === 'fk') B.push(P(PH.shot.fk));
    else if (headed) B.push(P(PH.shot.head));
    else if (scene === 'mid') B.push(P(PH.shot.mid));
    else B.push(P(PH.shot.foot));
    if (shotFires.length) B.push(shotFires.map((u) => ({ sp: u.sp, t: u.t, me: u.me })));
    if (goal) B.push(P(headed ? PH.goal.head : scene === 'mid' || scene === 'fk' ? PH.goal.long : PH.goal.any));
    else if (gkFired) B.push(P(PH.save.sp));
    else B.push(P(r.next() < 0.6 ? PH.save.any : PH.miss));
  }
  return B.map((l) => l.filter((x) => x !== '' && x != null));
}
