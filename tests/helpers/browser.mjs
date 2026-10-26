// 测试公共启动器：解析 puppeteer-core 与本机 Chrome/Chromium 路径
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch {
  throw new Error('缺少依赖：请在项目根目录执行 npm install');
}

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PAGE_URL = 'file://' + path.join(PROJECT_ROOT, 'index.html');
export const DIST_URL = 'file://' + path.join(PROJECT_ROOT, 'dist/index.html');
export const TEST_HTML_URL = 'file://' + path.join(PROJECT_ROOT, 'tests/audio-test.html');

const CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export const CHROME = CANDIDATES.find(exists) || '';
if (!CHROME) {
  throw new Error('找不到 Chrome/Chromium，请设置环境变量 PUPPETEER_EXECUTABLE_PATH 指向浏览器可执行文件');
}

export { puppeteer };
