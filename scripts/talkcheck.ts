import { newGame, advanceWeek } from '../src/core/game';
const G = newGame({ seed: 12 }); let n = 0; const fullN: number[] = [], hlN: number[] = [];
const txt = (l: any[]) => l.map((t) => typeof t === 'string' ? t : 'sp' in t ? `[${t.sp}]` : t.t).join('');
for (let i = 0; i < 48; i++) { const r = advanceWeek(G); const m = r.match; if (!m) continue; n++;
  fullN.push(m.full.reduce((s, it) => s + it.lines.length, 0)); hlN.push(m.highlights.reduce((s, it) => s + it.lines.length, 0));
  if (n === 2) { console.log('==== 見どころ', m.title); for (const it of m.highlights) console.log(`${it.who ? it.who : it.min + '分'} ${it.kind}`, it.lines.map(txt).join(' / '));
    console.log('==== 実況（全部）'); for (const it of m.full) console.log(`${it.who ? it.who : it.min + '分'}`, it.lines.map(txt).join(' / '));
    console.log('==== ふり返り'); for (const x of m.recap ?? []) console.log(x.who, txt(x.line)); } }
console.log('実況の行数/試合', Math.round(fullN.reduce((a, b) => a + b, 0) / n), '見どころの行数', Math.round(hlN.reduce((a, b) => a + b, 0) / n));
