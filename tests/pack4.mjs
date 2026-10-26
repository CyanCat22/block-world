// 工程与分享包验收：多存档、导出/导入、触屏、动态分辨率、预生成、单文件版
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';
const URL = PAGE_URL;
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1200,760'],
  defaultViewport: { width: 1200, height: 760 }
});
const errs = [];
async function newPage() {
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  return page;
}
const page = await newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await page.evaluate(() => {
  localStorage.clear();
  document.getElementById('seed-input').value = '20261022';
  document.getElementById('btn-start').click();
});
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));
const R = {};

R.slots = await page.evaluate(() => {
  const g = window.__game;
  const cards = document.querySelectorAll('#save-slots .slot-card');
  g.saveSlot = 2; g.saveGame();
  const key2 = localStorage.getItem('mc_sandbox_save_v1_slot2');
  const info2 = g.slotInfo(2);
  g.saveSlot = 3; g.saveGame();
  const key3 = localStorage.getItem('mc_sandbox_save_v1_slot3');
  return {
    cards: cards.length,
    slot1: !!localStorage.getItem('mc_sandbox_save_v1'),
    slot2: !!key2, slot3: !!key3,
    info2: info2 ? { day: info2.day, villagers: info2.villagers } : null,
    continueHidden: document.getElementById('btn-continue').classList.contains('hidden')
  };
});

R.pregenerate = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  return { chunks: g.world.chunks.size, renderDist: g.world.renderDist, around: g.world.chunks.size >= 121, pix: { ratio: g.pixelRatio, max: g.maxPixelRatio } };
});

R.resolution = await page.evaluate(() => {
  const g = window.__game;
  const before = g.pixelRatio;
  g.fps = 10; g.resTimer = 0; g.updateResolution(3);
  const low = g.pixelRatio;
  g.fps = 60; g.resTimer = 0; g.updateResolution(3);
  const high = g.pixelRatio;
  return { before, low, high, max: g.maxPixelRatio };
});

R.export = await page.evaluate(async () => {
  const g = window.__game;
  let blob = null, filename = null;
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  const origRevoke = URL.revokeObjectURL; URL.revokeObjectURL = () => {};
  g.nature.day = 6;
  g.saveGame();
  g.exportSave();
  URL.createObjectURL = origCreate;
  HTMLAnchorElement.prototype.click = origClick;
  URL.revokeObjectURL = origRevoke;
  let parsed = null;
  if (blob) { const text = await blob.text(); parsed = JSON.parse(text); }
  return { hasBlob: !!blob, filename, day: parsed && parsed.nature ? parsed.nature.day : null, hasWorld: !!(parsed && parsed.world && parsed.world.seed !== undefined), hasPlayer: !!(parsed && parsed.player), quests: parsed ? (parsed.quests || []).length : null };
});

R.import = await page.evaluate(async () => {
  const g = window.__game;
  const data = g.buildSaveData();
  data.nature = data.nature || {};
  data.nature.day = 9;
  data.reputation = 66;
  const text = JSON.stringify(data);
  const file = new File([text], 'save.json', { type: 'application/json' });
  await g.importSaveFile(file);
  await new Promise(r => setTimeout(r, 800));
  return { started: g.started, day: g.nature.day, rep: g.reputation, chunks: g.world.chunks.size, modal: g.ui.modal, paused: g.paused };
});

R.touchState = await page.evaluate(() => {
  const g = window.__game;
  const controls = document.getElementById('touch-controls');
  return { hidden: controls.classList.contains('hidden'), hasTouchObj: !!g.touch, touchSupported: ('ontouchstart' in window) || navigator.maxTouchPoints > 0 };
});

// 触屏模拟：直接注入 touch 状态，验证移动与视角输入生效
R.touchInput = await page.evaluate(async () => {
  const g = window.__game, p = g.player;
  g.freeze = false;
  g.touch = { active: true, x: 0, y: -1, lookX: 0, lookY: 0 };
  const before = p.pos.clone();
  const yaw0 = p.yaw;
  for (let i = 0; i < 20; i++) g.update(0.05);
  const moved = Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
  g.touch.lookX = 120;
  for (let i = 0; i < 4; i++) g.update(0.05);
  const yawChanged = Math.abs(p.yaw - yaw0) > 0.05;
  g.touch = null;
  return { moved: +moved.toFixed(2), yawChanged };
});

// 触屏设备页面（模拟 hasTouch）
const tp = await newPage();
const ctx = tp; // emulate on same page
await tp.emulate({
  viewport: { width: 820, height: 500, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});
await tp.goto(URL, { waitUntil: 'load' });
await tp.waitForFunction('window.__MC_READY === true');
await new Promise(r => setTimeout(r, 400));
R.touchDevice = await tp.evaluate(() => {
  const g = window.__game;
  return {
    coarse: window.matchMedia('(pointer: coarse)').matches,
    controlsHidden: document.getElementById('touch-controls').classList.contains('hidden'),
    active: !!(g.touch && g.touch.active),
    buttons: document.querySelectorAll('#touch-controls [data-touch]').length
  };
});
await tp.close();

// 单文件构建产物
const sp = await newPage();
await sp.goto(DIST_URL, { waitUntil: 'load' });
await sp.waitForFunction('window.__MC_READY === true');
R.singleFile = await sp.evaluate(() => ({
  externalScripts: document.querySelectorAll('script[src]').length,
  externalStyles: document.querySelectorAll('link[rel="stylesheet"]').length,
  title: document.querySelector('.title-cn').textContent,
  slots: document.querySelectorAll('#save-slots .slot-card').length
}));
await sp.close();

R.errs = errs.slice(0, 10);
console.log(JSON.stringify(R, null, 1));
await browser.close();