// 빌드 결과(dist)를 Artifact 게시용 페이지 조각(dist-artifact)으로 변환한다.
// Artifact는 <!doctype>/<html>/<head>/<body>를 직접 감싸므로 본문 조각만 남기고,
// JS·CSS·폰트는 assets/ 아래 개별 파일로 함께 게시한다.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const out = new URL('../dist-artifact/', import.meta.url).pathname;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(dist, 'assets'), join(out, 'assets'), { recursive: true });

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);
const js = [...html.matchAll(/<script type="module"[^>]*src="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);

const page = `<title>렉 보드</title>
<meta name="claude:viewport-fit-sides" content="cover">
${css.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n')}
<div id="root"></div>
${js.map((s) => `<script type="module" src="${s}"></script>`).join('\n')}
`;
writeFileSync(join(out, 'index.html'), page);
const files = readdirSync(join(out, 'assets'));
writeFileSync(join(out, 'files.json'), JSON.stringify(Object.fromEntries(files.map((f) => [`assets/${f}`, `assets/${f}`])), null, 2));
console.log(`artifact page: ${css.length} css, ${js.length} js, ${files.length} asset files`);
