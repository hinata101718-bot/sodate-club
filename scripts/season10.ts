/* 10シーズンの確かめ（アップデート3）：目標・監督の評価・表彰・登録・お金 */
import { newGame, advanceWeek, myTier } from '../src/core/game';
import { regd } from '../src/core/squad';
for (const seed of [11, 12]) {
  const G = newGame({ seed });
  for (let s = 0; s < 10; s++) {
    const S = G.season; let msgs = 0, meets = 0; let regOk = true;
    while (G.season === S) { const r = advanceWeek(G); if (G.meet) meets++; if (r.match && r.match.played.some((p) => !G.squad.find((q) => q.id === p.id)?.reg && G.squad.find((q) => q.id === p.id))) regOk = false; }
    msgs = (G.inbox ?? []).length;
    const h = G.history[G.history.length - 1]; const gl = (G.goalLog ?? []).slice(-1)[0];
    const aw = h.awards.filter((a) => a.tier === h.tier).map((a) => `${a.title}:${a.name}${a.me ? '★' : ''}(${a.detail.split('・')[0].trim()})`).join(' / ');
    console.log(`seed${seed} ${h.season}年目 ${h.tier}部${h.rank}位 目標「${gl?.text}」${gl?.ok ? '○' : '×'}(${gl?.level}) 評価${G.mgrEval} 予算${G.budget?.cap ?? '-'} トップ${G.squad.length}人 登録${regd(G).length} 会議${meets} msg${msgs} 登録外の出場なし:${regOk} お金${G.owner.money}`);
    console.log('   ', aw, ' XI自分', (h.xi ?? []).filter((a) => a.me).length);
  }
  void myTier;
}
