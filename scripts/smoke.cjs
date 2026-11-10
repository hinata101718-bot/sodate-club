// 画面の動作確認（手元用）：preview を起動してから、 node scripts/smoke.cjs [URL]
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:4173/sodate-club/';
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 375, height: 740 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(url); await pg.waitForTimeout(500);
  const steps = process.env.STEPS ? +process.env.STEPS : 3;
  for (let w = 0; w < steps; w++) {
    const wk = await pg.$('[data-act="week"]');
    if (!wk) { const any = await pg.$('#layer .btn.primary'); if (any) await any.click(); else break; continue; }
    await wk.click(); await pg.waitForTimeout(150);
    for (let i = 0; i < 80; i++) {
      if (await pg.$('.awake')) { await pg.click('#aOk'); continue; }
      if (await pg.$('.cutin')) { await pg.click('.cutin'); continue; }
      const next = await pg.$('#mNext'); if (next) { await next.click(); await pg.waitForTimeout(20); continue; }
      const rc = await pg.$('#rClose'); if (rc) { await rc.click(); break; }
      break;
    }
  }
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
  console.log('scrollWidth', sw, 'errors', errs.length); errs.slice(0, 10).forEach((e) => console.log(e));
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT, fullPage: false });
  await b.close();
})();
