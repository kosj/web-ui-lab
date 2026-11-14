#!/usr/bin/env node
/**
 * 화면 후보 스크린샷 — 커맨드 센터 · 라이브 중계 · 분석 보드(기본 스타일)를 데스크톱·모바일로 찍는다.
 * 사용: node tools/view-shots.cjs <출력 폴더> [dsf=2]   (vite preview가 4173에서 떠 있어야 함)
 * 출력: <view>-1440.jpg (1440×900 첫 화면), <view>-390.jpg (390×844 첫 화면). 모션은 켠 상태(등장 시퀀스가 끝난 뒤).
 */
const { chromium } = require('playwright');
const VIEWS = [
  { id: 'command', hash: '#command', ready: '.cc-pod', wait: 4500 },
  { id: 'broadcast', hash: '#broadcast', ready: '.bc-onair', wait: 3200 },
  { id: 'analysis', hash: '#analysis', ready: '.kpis', wait: 1500 },
];
(async () => {
  const [, , dir, dsf = '2'] = process.argv;
  const b = await chromium.launch();
  const out = [];
  for (const v of VIEWS) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +dsf });
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      await p.goto(`http://localhost:4173/${v.hash}`, { waitUntil: 'networkidle' });
      await p.waitForSelector(v.ready);
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(v.wait);
      const name = `${dir}/${v.id}-${w}.jpg`;
      await p.screenshot({ path: name, type: 'jpeg', quality: 82 });
      out.push({ name, errs, overflow: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) });
      await p.close();
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
