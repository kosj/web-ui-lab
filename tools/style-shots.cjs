#!/usr/bin/env node
/**
 * 스타일 갤러리 스크린샷 — 모든 [data-style] × 테마를 #style-<id>로 열어 찍는다.
 * 사용: node tools/style-shots.cjs <출력 폴더> [w=1440] [h=900] [dsf=1] [png|jpg]   (vite preview가 4173에서 떠 있어야 함)
 */
const { chromium } = require('playwright');
(async () => {
  const [, , dir, w = '1440', h = '900', dsf = '1', fmt = 'png'] = process.argv;
  const b = await chromium.launch();
  const out = [];
  for (const [style, theme] of [['graphite', 'dark'], ['cockpit', 'dark'], ['terminal', 'dark'], ['editorial', 'light'], ['glass', 'dark'], ['glass', 'light'], ['graphite', 'light']]) {
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dsf });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.addInitScript(([t]) => { try { localStorage.setItem('lag-board:theme', t); localStorage.setItem('lag-board:motion', 'reduced'); } catch {} }, [theme]);
    await p.goto(`http://localhost:4173/#style-${style}`, { waitUntil: 'networkidle' });
    await p.waitForSelector('.kpis');
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(900);
    const name = `${dir}/${style}-${theme}.${fmt}`;
    await p.screenshot({ path: name, type: fmt === 'jpg' ? 'jpeg' : 'png', ...(fmt === 'jpg' ? { quality: 84 } : {}) });
    const fonts = await p.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i));
    const attrs = await p.evaluate(() => [document.documentElement.dataset.style, document.documentElement.dataset.theme]);
    out.push({ style, theme, attrs, fonts, errs, overflow: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) });
    await p.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
