// 最终交付截图：开始界面、出生点、村庄、农田、夜晚、交易、背包、雷雨
import { puppeteer, CHROME, PAGE_URL, DIST_URL, PROJECT_ROOT } from './helpers/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
const out = path.join(PROJECT_ROOT, 'screenshots');
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1440,810'],
  defaultViewport: { width: 1440, height: 810 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.waitForFunction('window.__MC_READY === true');
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: out + '/01-开始界面.png' });

await page.evaluate(() => { document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 3500));
await page.evaluate(() => { const g = window.__game; g.nature.time = (8.5 - 6) / 24; g.nature.weather = 'clear'; g.nature.applySky(0.016); });
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: out + '/02-出生点.png' });

const shot = async (name, fn, wait = 1600) => {
  await page.evaluate(fn);
  await new Promise(r => setTimeout(r, wait));
  const st = await page.evaluate(() => {
    const g = window.__game;
    return { cam: g.camera.position.toArray().map(v => +v.toFixed(1)), rot: [+g.camera.rotation.x.toFixed(2), +g.camera.rotation.y.toFixed(2)], paused: g.paused, freeze: g.freeze };
  });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(st));
};

// 村庄全景（俯视村落）
await shot('03-村庄全景', () => {
  const g = window.__game, v = g.world.village;
  g.freeze = true;
  g.player.pos.set(v.center.x + 1, v.groundY + 13, v.center.z + 20);
  g.player.yaw = 0; g.player.pitch = -0.33;
});

// 农田
await shot('04-农田与村民', () => {
  const g = window.__game, f = g.world.village.farms[0];
  g.freeze = true;
  g.player.pos.set(f.x1 + 4, g.world.village.groundY + 2.2, f.center.z);
  g.player.yaw = Math.PI / 2; g.player.pitch = -0.2;
});

// 与村民面对面
await shot('05-村民对话', () => {
  const g = window.__game, v0 = g.world.village;
  const v = g.villagers.list.find(x => x.profession === 'farmer') || g.villagers.list[0];
  g.freeze = true;
  v.tradeActive = true;
  v.pos.set(v0.center.x + 3, v0.groundY + 1, v0.center.z + 1);
  v.yaw = Math.PI; v.syncMesh();
  g.player.pos.set(v0.center.x + 3, v0.groundY + 1, v0.center.z + 6);
  g.player.yaw = 0; g.player.pitch = -0.06;
  g.ui.bubble(v, '你好啊，旅行者。', 6000);
}, 900);

// 交易界面
await page.evaluate(() => { const g = window.__game; const v = g.villagers.list.find(x => x.profession === 'farmer'); g.openTrade(v); });
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: out + '/06-村民交易.png' });
await page.evaluate(() => window.__game.closeModal());

// 背包与合成
await page.evaluate(() => { const g = window.__game; g.freeze = true; g.player.addItem(MC.B.LOG, 12); g.player.addItem(MC.B.COBBLE, 22); g.player.addItem(MC.B.WOOL, 5); g.openInventory(); });
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: out + '/07-背包与合成.png' });
await page.evaluate(() => window.__game.closeModal());

// 挖掘中（挖掘进度 + 粒子）
await page.evaluate(async () => {
  const g = window.__game; g.freeze = false;
  const p = g.player;
  p.pos.set(g.world.village.center.x + 2, g.world.village.groundY + 1.02, g.world.village.center.z + 9);
  p.yaw = 0; p.pitch = -1.1;
  p.hotbar[0] = MC.I.WOOD_PICK; p.items.set(MC.I.WOOD_PICK, 1); p.selected = 0;
  await new Promise(r => setTimeout(r, 300));
  // 手动挖，保留进度条
  for (let i = 0; i < 6; i++) p.updateMining(0.05, { mouseLeft: true, keys: new Set() });
});
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: out + '/08-挖掘方块.png' });

// 夜晚火把
await shot('09-夜晚火把', () => {
  const g = window.__game, v = g.world.village;
  g.freeze = true;
  g.nature.time = 0.68; g.nature.weather = 'clear'; g.nature.weatherBlend = 0;
  g.nature.applySky(0.016);
  g.player.pos.set(v.center.x + 1, v.groundY + 1.02, v.center.z + 7);
  g.player.yaw = 0.05; g.player.pitch = -0.05;
});

// 雷雨
await shot('10-雷雨天气', () => {
  const g = window.__game;
  g.nature.time = (14 - 6) / 24; g.nature.weather = 'storm'; g.nature.weatherBlend = 1;
  g.nature.applySky(0.016);
  g.player.pos.set(g.world.village.center.x + 6, g.world.village.groundY + 2, g.world.village.center.z + 14);
  g.player.yaw = -0.2; g.player.pitch = 0.12;
});

// 僵尸夜晚
await shot('11-夜晚僵尸', () => {
  const g = window.__game, v = g.world.village;
  g.freeze = true;
  g.nature.time = 0.7; g.nature.weather = 'clear'; g.nature.weatherBlend = 0; g.nature.applySky(0.016);
  g.player.pos.set(v.center.x + 2, v.groundY + 1.02, v.center.z + 8);
  g.player.yaw = 0; g.player.pitch = -0.03;
  const z = g.entities.spawnZombie(v.center.x + 2, v.groundY + 1.02, v.center.z + 2);
  z.update = function () {}; // 定格
  z.vel.set(0, 0, 0);
  z.pos.set(v.center.x + 2.5, v.groundY + 1.02, v.center.z + 2.5);
  z.yaw = Math.PI;
  z.syncMesh();
  g.ui.bubble(z, '呃……', 5000);
}, 900);

// 小地图 + 设置面板
await page.evaluate(() => { const g = window.__game; g.freeze = true; g.player.pos.set(g.world.village.center.x + 1, g.world.village.groundY + 1.02, g.world.village.center.z + 9); g.player.yaw = 0; g.player.pitch = -0.05; g.openSettings(); });
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: out + '/13-小地图与设置.png' });
await page.evaluate(() => window.__game.closeModal());

// 箱子
await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player, B = MC.B;
  g.freeze = true;
  const v = g.world.village;
  const bx = v.center.x + 3, bz = v.center.z + 11, by = w.surfaceY(bx, bz) + 1;
  w.setBlock(bx, by, bz, B.CHEST);
  g.onBlockPlaced(B.CHEST, bx, by, bz);
  const key = bx + ',' + by + ',' + bz;
  const slots = g.chests.get(key);
  const stuff = [[MC.B.LOG, 22], [MC.B.COBBLE, 18], [MC.I.COAL, 6], [MC.I.IRON_INGOT, 3], [MC.I.WHEAT, 9], [MC.I.EMERALD, 4], [MC.B.TORCH, 12], [MC.I.BREAD, 3]];
  stuff.forEach(([id, c], i) => { slots[i] = { id: id, count: c }; });
  p.pos.set(bx + 0.5, by + 1.02, bz + 2.5);
  p.yaw = 0; p.pitch = -0.5;
  g.openChest({ x: bx, y: by, z: bz });
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: out + '/14-箱子储物.png' });
await page.evaluate(() => window.__game.closeModal());

// 熔炉
await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player, B = MC.B;
  g.freeze = true;
  const v = g.world.village;
  const bx = v.center.x + 5, bz = v.center.z + 11, by = w.surfaceY(bx, bz) + 1;
  w.setBlock(bx, by, bz, B.FURNACE);
  g.onBlockPlaced(B.FURNACE, bx, by, bz);
  const key = bx + ',' + by + ',' + bz;
  const st = g.furnaces.get(key);
  st.input = { id: B.IRON_ORE, count: 8 };
  st.fuel = { id: MC.I.COAL, count: 3 };
  st.output = { id: MC.I.IRON_INGOT, count: 5 };
  st.burn = 14; st.burnMax = 20; st.progress = 5.2;
  p.pos.set(bx - 0.5, by + 1.02, bz + 2.5);
  p.yaw = 0; p.pitch = -0.4;
  g.openFurnace({ x: bx, y: by, z: bz });
  g.ui.refreshFurnace();
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: out + '/15-熔炉熔炼.png' });
await page.evaluate(() => window.__game.closeModal());

// 任务面板
await page.evaluate(() => {
  const g = window.__game;
  g.stats.mined[MC.B.LOG] = 3;
  g.stats.crafted = 2;
  g.stats.trades = 1;
  g.reputation = 78;
  g.quests.update(1.2);
  g.openQuests();
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: out + '/16-任务面板.png' });
await page.evaluate(() => window.__game.closeModal());

// 睡觉过夜
await page.evaluate(() => {
  const g = window.__game;
  g.freeze = false;
  g.nature.time = 0.72; g.nature.weather = 'clear';
  g.nature.applySky(0.016);
  g.player.pos.set(g.world.village.center.x + 1, g.world.village.groundY + 1.02, g.world.village.center.z + 8);
  for (const e of g.entities.list.slice()) if (e.kind === 'zombie') e.remove();
  g.trySleep();
});
await new Promise(r => setTimeout(r, 3800));
await page.screenshot({ path: out + '/17-睡到早晨.png' });
await new Promise(r => setTimeout(r, 600));

// 触屏版（模拟手机）
const mp = await browser.newPage();
await mp.emulate({ viewport: { width: 860, height: 540, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
await mp.goto(PAGE_URL, { waitUntil: 'load' });
await mp.waitForFunction('window.__MC_READY === true');
await mp.evaluate(() => { localStorage.clear(); document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await mp.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
await mp.evaluate(() => { const g = window.__game; g.nature.time = (9 - 6) / 24; g.nature.applySky(0.016); g.player.yaw = 0; g.player.pitch = -0.02; });
await new Promise(r => setTimeout(r, 800));
await mp.screenshot({ path: out + '/18-触屏版.png' });
await mp.close();

// 单文件版（同一尺寸重新截图）
const fp = await browser.newPage();
await fp.goto(DIST_URL, { waitUntil: 'load' });
await fp.waitForFunction('window.__MC_READY === true');
await fp.evaluate(() => { localStorage.clear(); document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await fp.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 2600));
await fp.evaluate(() => { const g = window.__game; g.nature.time = (8.5 - 6) / 24; g.nature.applySky(0.016); g.player.yaw = 0.1; g.player.pitch = -0.03; });
await new Promise(r => setTimeout(r, 900));
await fp.screenshot({ path: out + '/12-单文件版.png' });
await fp.close();

console.log('ERRS', JSON.stringify(errs.slice(0, 6)));
await browser.close();