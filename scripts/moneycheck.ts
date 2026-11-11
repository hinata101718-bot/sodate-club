/* 問125：お金の確かめ。段ごとの1年の収支と、選手の給料・値段の目安 */
import { newGame, advanceWeek, myTier } from '../src/core/game';
import { salaryFor, ovr } from '../src/core/player';
import { marketValue } from '../src/core/market';
import { INCOME_KEYS, EXPENSE_KEYS, MONEY_NAME } from '../src/core/finance';
for (const o of [45, 55, 62, 67, 70, 74, 78, 82]) console.log(`総合${o}: 年俸 ${salaryFor(o)}万  値段(25歳・3年・2部) ${marketValue({ a: [o, o, o, o, o, o, o, o], pos: 'CM', apt: { CM: 3 }, age: 25, contract: 3 } as any, 2)}万`);
for (const tier of [3]) {
  const G = newGame({ seed: 30 + tier });
  const S = G.season; let months: number[] = []; let last = G.owner.money;
  while (G.season === S && G.week < 44) { advanceWeek(G); if (G.week % 4 === 0) { months.push(G.owner.money - last); last = G.owner.money; } }
  const L = G.owner.ledger; const inc = INCOME_KEYS.reduce((s, k) => s + L[k], 0), exp = EXPENSE_KEYS.reduce((s, k) => s + L[k], 0);
  console.log(`--- ${tier}部（無理やり置いた）：収入 ${inc}万 支出 ${exp}万 / ` + [...INCOME_KEYS, ...EXPENSE_KEYS].filter((k) => L[k]).map((k) => `${MONEY_NAME[k]} ${L[k]}`).join('・'));
  console.log('    月ごとの増減', months.join(' '), ' 給料の合計/年', G.squad.reduce((s, p) => s + p.salary, 0), ' 平均総合', Math.round(G.squad.reduce((s, p) => s + ovr(p), 0) / G.squad.length));
  void myTier;
}
