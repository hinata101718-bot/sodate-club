/* 監督（企画書 10-1）。コーチとスカウトは段階4で足す */
import { Rng } from './rng';
import { FORM, STYLE_NAMES, type StyleName } from './constants';
import { STAFF_GIV, STAFF_SUR } from './data/names';
import type { Manager } from './types';

const FORMS_FOR: Record<StyleName, string[]> = {
  'ロングカウンター': ['4-4-2', '5-3-2', '4-1-4-1', '3-5-2'],
  'ポゼッション': ['4-3-3', '4-2-3-1', '3-4-3', '4-1-4-1'],
  'サイドアタック': ['4-4-2', '4-3-3', '3-4-3', '4-2-3-1'],
  'ローブロック': ['5-3-2', '4-1-4-1', '4-4-2', '3-5-2'],
  'ゲーゲンプレス': ['4-3-3', '4-2-3-1', '3-4-3', '4-4-2'],
};
export function staffName(r: Rng) { return r.pick(STAFF_SUR) + ' ' + r.pick(STAFF_GIV); }
/** q：腕前の目安（0〜1） */
export function makeManager(r: Rng, ids: { n: number }, q = 0.5, style?: StyleName): Manager {
  const st = style ?? r.pick(STYLE_NAMES);
  const pool = [...FORMS_FOR[st]]; r.shuffle(pool);
  const nf = r.next() < 0.5 ? 2 : 3;
  const forms = pool.slice(0, nf).filter((f) => FORM[f]);
  const grow = Math.round((0.85 + q * 0.4 + (r.next() - 0.5) * 0.15) * 100) / 100;
  return {
    id: ids.n++, name: staffName(r), style: st, forms,
    youth: Math.round((0.7 + r.next() * 0.7) * 100) / 100,
    obey: Math.round((0.25 + r.next() * 0.7) * 100) / 100,
    grow, salary: Math.round((800 + q * 4000 + r.next() * 600) / 10) * 10, age: r.int(38, 64),
  };
}
export function youthWord(m: Manager) { return m.youth >= 1.2 ? '若手をどんどん使う' : m.youth <= 0.85 ? 'ベテランを信じる' : '若手もベテランも、その時の調子で使う'; }
export function obeyWord(m: Manager) { return m.obey >= 0.7 ? '頼みを素直に聞いてくれる' : m.obey <= 0.4 ? '頑固で、頼みはあまり聞かない' : '頼みは、ときどき聞いてくれる'; }
export function growWord(m: Manager) { return m.grow >= 1.15 ? '育てるのがとてもうまい' : m.grow >= 1.0 ? '育てるのがうまい' : '育てるのはふつう'; }
