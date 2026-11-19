// 修改根目录“更新日志.md”后，执行 node scripts/build-updates.mjs 更新应用页面。
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const markdown = await readFile(new URL('更新日志.md', root), 'utf8');
const escape = value => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const content = [];
let inRelease = false, inList = false;
const closeList = () => { if (inList) { content.push('</ul>'); inList = false; } };
for (const line of markdown.split('\n')) {
  if (!line.trim() || line.startsWith('# ')) { closeList(); continue; }
  if (line.startsWith('## ')) {
    closeList();
    if (inRelease) content.push('</article>');
    content.push(`<article class="panel update-release"><h2>${escape(line.slice(3))}</h2>`);
    inRelease = true;
  } else if (line.startsWith('### ')) {
    closeList(); content.push(`<h3>${escape(line.slice(4))}</h3>`);
  } else if (line.startsWith('- ')) {
    if (!inList) { content.push('<ul>'); inList = true; }
    content.push(`<li>${escape(line.slice(2))}</li>`);
  } else {
    closeList(); content.push(`<p>${escape(line)}</p>`);
  }
}
closeList();
if (inRelease) content.push('</article>');
const page = `<!doctype html>
<!-- 本页面由 scripts/build-updates.mjs 根据“更新日志.md”生成。 -->
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f5ef"><title>更新日志 · 宝宝日常</title><link rel="stylesheet" href="/styles.css"><link rel="icon" type="image/svg+xml" href="/baby-favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"></head>
<body><main class="shell updates-shell">
<header class="topbar"><a class="brand-lockup brand-link" href="/"><div class="brand-mark" aria-hidden="true"><span></span></div><span class="updates-brand">宝宝日常</span></a><a class="back-link" href="/">← 返回日常</a></header>
<section class="operation-heading"><h1>更新日志</h1><p>按日期查看每次更新和改进。</p></section>
${content.join('\n')}
<footer>宝宝日常 · 记录每一次安心</footer>
</main></body></html>
`;
await writeFile(new URL('public/updates.html', root), page);
console.log('已更新应用内的更新日志页面。');
