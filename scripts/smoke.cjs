// 画面の動作確認（手元用）：npx vite preview を起動してから、 node scripts/smoke.cjs
// STEPS=進める回数  MODE=week|skip  SHOT=撮った絵の置き場所
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:4173/sodate-club/';
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: +(process.env.W || 375), height: 740 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(url); await pg.waitForTimeout(400);
  if (process.env.FRESH) { await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(300); }
  const steps = +(process.env.STEPS || 3); const mode = process.env.MODE || 'week';
  let maxW = 0;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < 300; i++) {
      if (await pg.$('#nNext')) { await pg.click('#nNext'); continue; }
      if (await pg.$('.awake')) { await pg.click('#aOk', { timeout: 3000 }).catch(() => {}); continue; }
      if (await pg.$('.cutin')) { await pg.click('.cutin', { timeout: 3000 }).catch(() => {}); continue; }
      if (await pg.$('#mAll')) { await pg.click('#mAll'); await pg.click('#mNext'); continue; }
      if (await pg.$('#layer .dock .btn.primary')) { await pg.click('#layer .dock .btn.primary', { timeout: 3000 }).catch(() => {}); continue; }
      break;
    }
    await pg.waitForTimeout(40);
    if (await pg.$('.awake, .cutin, #layer .sheet')) { s--; continue; }
    const btn = await pg.$(`[data-act="${mode}"]`); if (!btn) { console.log("no btn at", s, await pg.evaluate(() => document.querySelector("#layer").innerHTML.slice(0, 200))); break; } await btn.click(); await pg.waitForTimeout(30);
    maxW = Math.max(maxW, await pg.evaluate(() => document.documentElement.scrollWidth));
  }
  for (let i = 0; i < 50 && (await pg.$('.awake, .cutin, #layer .sheet')); i++) {
    if (await pg.$('.awake')) { await pg.click('#aOk', { timeout: 3000 }).catch(() => {}); continue; }
    if (await pg.$('#mAll')) { await pg.click('#mAll'); }
    await pg.click('#layer .dock .btn.primary', { timeout: 3000 }).catch(() => {});
  }
  for (const t of ['squad', 'youth', 'people', 'fac', 'money', 'home']) { const n = await pg.$(`[data-tab="${t}"]`); if (n) { await n.click(); maxW = Math.max(maxW, await pg.evaluate(() => document.documentElement.scrollWidth)); } }
  const sub = await pg.textContent('#clubSub');
  console.log('sub:', sub, '| maxScrollWidth', maxW, '| errors', errs.length); errs.slice(0, 10).forEach((e) => console.log(e));
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT });
  await b.close();
})();
