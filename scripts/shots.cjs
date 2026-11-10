// 画面の撮影（幅375px）：npx vite preview を起動してから node scripts/shots.cjs
const { chromium } = require('playwright');
const out = (n) => `docs/reports/shots/${n}.png`;
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:4173/sodate-club/'); await pg.waitForTimeout(500);
  await pg.selectOption('#pref', '静岡県'); await pg.screenshot({ path: out('0-start') });
  for (let i = 0; i < 4; i++) await pg.click('#nNext');
  await pg.waitForTimeout(300);
  const close = async () => { for (let i = 0; i < 60; i++) { if (await pg.$('.awake')) { await pg.click('#aOk').catch(() => {}); continue; } if (await pg.$('#mAll')) await pg.click('#mAll'); if (await pg.$('#layer .dock .btn.primary')) { await pg.click('#layer .dock .btn.primary', { timeout: 2000 }).catch(() => {}); continue; } break; } };
  /* 3月まで進めて、試合を1文ずつ見る */
  for (let i = 0; i < 3; i++) { await pg.click('[data-act="skip"]'); await close(); }
  let gotAwake = false, gotMatch = false, gotReport = false;
  for (let w = 0; w < 40 && !(gotAwake && gotMatch && gotReport); w++) {
    await pg.click('[data-tab="home"]');
    await pg.click('[data-act="week"]'); await pg.waitForTimeout(100);
    if (await pg.$('#mNext')) {
      for (let i = 0; i < 120; i++) {
        if (await pg.$('.cutin')) {
          if (!gotMatch && (await pg.$('.cutin:not(.sp)'))) { await pg.waitForTimeout(700); await pg.screenshot({ path: out('2-goal-cutin') }); await pg.click('.cutin'); await pg.waitForTimeout(300); await pg.screenshot({ path: out('2-match') }); gotMatch = true; continue; }
          await pg.click('.cutin').catch(() => {}); continue;
        }
        if (await pg.$('.endcard')) break;
        await pg.click('#mNext'); await pg.waitForTimeout(30);
      }
      await pg.click('#mNext'); await pg.waitForTimeout(200);
    }
    if (await pg.$('.awake')) { await pg.waitForTimeout(1300); await pg.screenshot({ path: out('4-awake') }); gotAwake = true; await pg.click('#aOk'); }
    if (!gotReport && (await pg.$('.mini span.lit'))) { await pg.screenshot({ path: out('3-report') }); gotReport = true; }
    await close();
  }
  await pg.click('[data-tab="home"]'); await pg.screenshot({ path: out('1-home') });
  await pg.click('[data-tab="squad"]'); const pl = await pg.$('.pl'); await pl.click(); await pg.waitForTimeout(200); await pg.screenshot({ path: out('5-player') });
  await pg.evaluate(() => document.querySelector('#layer .sheet').scrollTo(0, 700)); await pg.waitForTimeout(100); await pg.screenshot({ path: out('5-player-2') });
  await pg.click('#pBack');
  await pg.click('[data-tab="youth"]'); await pg.screenshot({ path: out('6-youth') });
  const yl = await pg.$('[data-act="ylog"]'); if (yl) { await yl.click(); await pg.screenshot({ path: out('6-youth-report') }); await pg.click('#yBack'); }
  await pg.click('[data-tab="money"]'); await pg.screenshot({ path: out('7-money') });
  await pg.click('[data-tab="people"]'); await pg.screenshot({ path: out('8-people') });
  await pg.click('[data-tab="fac"]'); await pg.screenshot({ path: out('9-facilities') });
  console.log({ gotAwake, gotMatch, gotReport, errs });
  await b.close();
})();
