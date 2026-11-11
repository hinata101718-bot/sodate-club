import { newGame, advanceWeek } from '../src/core/game';
const G = newGame({ seed: 9 }); let shown = 0;
for (let i = 0; i < 48 && shown < 4; i++) { const r = advanceWeek(G); const m = r.match; if (!m) continue;
  for (const it of m.full) { const idx = it.lines.findIndex((l) => l.some((t) => typeof t === 'object' && 'sp' in t)); if (idx < 0 || it.kind === 'talk') continue;
    const sp = it.lines[idx].map((t: any) => t.sp).filter(Boolean).join(','); if (!/クロス|スルーパス|視野|プレースキッカー|チャンス/.test(sp)) continue;
    shown++; console.log('---', sp); for (const l of it.lines) console.log(' ', l.map((t: any) => typeof t === 'string' ? t : 'sp' in t ? `[${t.sp}]` : t.t).join('')); if (shown >= 4) break; } }
