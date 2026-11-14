#!/usr/bin/env node
/**
 * UI 시각 QA 스크린샷 — 가로 넘침·콘솔 에러를 함께 보고한다.
 * 사용: node tools/ui-shot.cjs <url> <out.png> [width=1600] [height=1000] [theme=dark|light] [full|top]
 * 예:   node tools/ui-shot.cjs http://localhost:4173/ shots/dark.png 1600 1000 dark full
 * theme은 localStorage 키 `<app>:theme`을 설정한다 (기본 lag-board:theme, THEME_KEY 환경변수로 변경).
 */
const { chromium } = require('playwright');

(async () => {
  const [, , url, out, w = '1600', h = '1000', theme = 'dark', mode = 'full'] = process.argv;
  if (!url || !out) {
    console.error('usage: ui-shot.cjs <url> <out.png> [w] [h] [theme] [full|top]');
    process.exit(2);
  }
  const key = process.env.THEME_KEY || 'lag-board:theme';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(([k, t]) => { try { localStorage.setItem(k, t); } catch {} }, [key, theme]);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: out, fullPage: mode === 'full' });
  console.log(JSON.stringify({ out, overflowX, height: await page.evaluate(() => document.body.scrollHeight), problems }, null, 2));
  await browser.close();
  if (overflowX > 0) process.exitCode = 1;
})();
