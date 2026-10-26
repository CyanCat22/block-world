// 把 index.html + style.css + js/*.js + vendor/three.min.js 打包成单个 HTML（file:// 可直接玩）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const htmlPath = path.join(root, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 内联 CSS
const cssTag = '<link rel="stylesheet" href="style.css">';
if (html.includes(cssTag)) {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  html = html.replace(cssTag, () => '<style>\n' + css + '\n</style>');
}

// 内联脚本（保持顺序）
const scriptRe = /<script src="([^"]+)"><\/script>/g;
const scripts = [];
let m;
while ((m = scriptRe.exec(html))) scripts.push(m[1]);
for (const rel of scripts) {
  const file = path.join(root, rel);
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/<\/script>/gi, '<\\/script>');
  html = html.replace('<script src="' + rel + '"></script>', () => '<script>\n/* ==== ' + rel + ' ==== */\n' + code + '\n</script>');
}

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'index.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log(JSON.stringify({
  out: outFile,
  bytes: fs.statSync(outFile).size,
  scripts: scripts.length,
  remainingExternal: (html.match(/<script src=|<link rel="stylesheet"/g) || []).length
}));