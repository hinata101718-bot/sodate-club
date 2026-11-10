// アイコンのPNGを作る（SVGをブラウザで描いて撮るだけ。色を読み取る計算は使わない）
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const b = await chromium.launch(); const pg = await b.newPage();
  for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    await pg.setViewportSize({ width: size, height: size });
    await pg.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await pg.screenshot({ path: path.join(__dirname, '..', 'public', 'icons', name), omitBackground: false });
  }
  await b.close();
})();
