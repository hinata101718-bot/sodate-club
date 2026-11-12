/* 春の昇格会議の話し合い（感想67）：ユースコーチが推薦の理由を話し、監督は「すぐ使いたい子」を言う */
import { ovr } from './player';
import { POS } from './constants';
import type { Player } from './types';
import type { GameState } from './game';

export type PromoTalk = { coach: { who: string; lines: string[] }; mgr: { who: string; lines: string[]; want: number[] }; why: Record<number, string> };
const SLOTS: Record<string, number> = { GK: 2, CB: 4, SB: 3, DM: 2, CM: 3, AM: 2, WG: 3, ST: 3 };

/** 監督の目：同じポジションのトップの選手と比べて、すぐ使えるか・人が足りないポジションか */
function mgrNeed(G: GameState, p: Player): { want: boolean; why: string } {
  const same = G.squad.filter((x) => x.pos === p.pos).map(ovr).sort((a, b) => b - a);
  const o = ovr(p); const lack = same.length < (SLOTS[p.pos] ?? 2);
  const weakest = same.length ? same[same.length - 1] : 0;
  if (lack) return { want: o >= weakest - 8 || same.length <= 1, why: `${p.pos}が${same.length}人しかいないので、数がほしいです` };
  if (o >= weakest - 2) return { want: true, why: `いまの${p.pos}の控えと、ほぼ同じくらい使えます` };
  return { want: false, why: '' };
}
export function promoTalk(G: GameState): PromoTalk {
  const rec = new Set(G.promo?.rec ?? []);
  const rep = G.youthLog[G.youthLog.length - 1];
  const starsOf = (p: Player) => rep?.lines.find((l) => l.pid === p.id)?.stars ?? 0;
  const why: Record<number, string> = {};
  /* 監督の理由は、話すことばにする */
  const recP = G.youth.filter((p) => rec.has(p.id));
  /* ユースコーチ：伸びしろ（★）と、トップでやれそうか */
  const cl: string[] = [];
  const youthCoach = G.owner.coaches.youth?.name ?? '（いない）';
  if (!recP.length) cl.push('今年は、トップに推薦できる子がいません。3年生は、ここで卒業になります。');
  else {
    cl.push(`今年トップに推薦したいのは、${recP.map((p) => p.name).join('、')} です。`);
    for (const p of recP) {
      const s = starsOf(p); const early = (p.grade || 3) < 3;
      const t = early ? `まだ${p.grade}年ですが、伸びしろが大きいので、早めに上で揉まれたほうがいいと思います。` : s >= 4 ? 'まだまだ伸びます。トップの練習で、一気に化けるかもしれません。' : ovr(p) >= 50 ? 'ユースではもう物足りないくらいです。上の練習にもついていけます。' : 'すぐには出番がないかもしれませんが、腐らずに続けられる子です。';
      why[p.id] = `コーチ「${t}」`; cl.push(`${p.name}（${p.pos}・${p.grade}年）：${t}`);
    }
  }
  const out3 = G.youth.filter((p) => p.grade === 3 && !rec.has(p.id));
  if (out3.length) cl.push(`ほかの3年生（${out3.slice(0, 3).map((p) => p.name).join('、')}${out3.length > 3 ? ' ほか' : ''}）は、ここで卒業です。よく頑張ってくれました。`);
  /* 監督：すぐ使えるか・ポジションの数 */
  const want: number[] = []; const ml: string[] = [];
  for (const p of [...G.youth].sort((a, b) => ovr(b) - ovr(a))) { const n = mgrNeed(G, p); if (n.want && want.length < 3) { want.push(p.id); why[p.id] = (why[p.id] ? why[p.id] + '　' : '') + `監督「${n.why}」`; } }
  const nmG = (id: number) => { const p = G.youth.find((x) => x.id === id); return p ? `${p.name}（${p.pos}・${p.grade}年）` : ''; };
  if (!want.length) ml.push('正直に言うと、今すぐ試合で使えそうな子はいません。上げるなら、育てるつもりで。');
  else {
    ml.push(`私がほしいのは、${want.map(nmG).join('、')} です。`);
    const only = want.filter((id) => !rec.has(id)); const notMine = [...rec].filter((id) => !want.includes(id));
    if (only.length) ml.push(`${only.map((id) => G.youth.find((p) => p.id === id)!.name).join('、')} は、コーチの推薦には入っていませんが、うちの手薄なところを埋めてくれます。`);
    if (notMine.length) ml.push(`${notMine.map((id) => G.youth.find((p) => p.id === id)?.name).filter(Boolean).join('、')} は先が楽しみですが、すぐには使えません。上げるかどうかは、オーナーにお任せします。`);
    if (!only.length && !notMine.length) ml.push('コーチと同じ考えです。');
  }
  const room = 35 - G.squad.length;
  if (room <= 2) ml.push(`トップは今${G.squad.length}人で、あと${Math.max(0, room)}人しか入れません。`);
  void POS;
  return { coach: { who: youthCoach, lines: cl }, mgr: { who: G.mgr.name, lines: ml, want }, why };
}
