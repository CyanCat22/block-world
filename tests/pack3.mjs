// 世界更活包验收：A* 寻路、村民/僵尸导航、环境音、好感折扣、任务成就
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1100,720'],
  defaultViewport: { width: 1100, height: 720 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await page.evaluate(() => { localStorage.removeItem('mc_sandbox_save_v1'); localStorage.removeItem('mc_settings_v1'); document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));
const R = {};

// A* 绕过墙
R.path = await page.evaluate(() => {
  const g = window.__game, w = g.world, B = MC.B;
  const px = Math.floor(g.player.pos.x), pz = Math.floor(g.player.pos.z);
  const y = w.surfaceY(px, pz) + 1;
  // 清出 9x5 的场地，四周立墙，墙在中间（x+3）
  for (let dx = -1; dx <= 7; dx++) for (let dz = -2; dz <= 2; dz++) {
    for (let dy = 0; dy < 4; dy++) w.setBlock(px + dx, y + dy, pz + dz, B.AIR);
    w.setBlock(px + dx, y - 1, pz + dz, B.STONE);
  }
  for (let dz = -2; dz <= 2; dz++) if (dz !== 1) w.setBlock(px + 3, y, pz + dz, B.STONE);
  const start = { x: px, y: y, z: pz };
  const goal = { x: px + 6, y: y, z: pz };
  const path = MC.Pathfinder.find(w, start, goal, { maxNodes: 800 });
  const ok = !!path && path.length > 0 && path.every(n => w.getBlock(n.x, n.y - 1, n.z) === B.STONE);
  const endOk = !!path && path[path.length - 1].x === goal.x && path[path.length - 1].z === goal.z;
  const throughWall = !!path && path.some(n => n.x === px + 3 && w.getBlock(n.x, n.y, n.z) === B.STONE);
  return { hasPath: !!path, len: path ? path.length : 0, ok, endOk, throughWall, first: path ? path[0] : null, last: path ? path[path.length - 1] : null };
});

// 村民用寻路走向目标（墙后）
R.villagerNav = await page.evaluate(async () => {
  const g = window.__game, w = g.world, B = MC.B;
  const px = Math.floor(g.player.pos.x), pz = Math.floor(g.player.pos.z);
  const y = w.surfaceY(px, pz) + 1;
  // 在高处平台上放村民和墙，避免被地形干扰
  for (let dx = -2; dx <= 8; dx++) for (let dz = -3; dz <= 3; dz++) {
    for (let dy = 0; dy < 4; dy++) w.setBlock(px + dx, y + dy, pz + dz, B.AIR);
    w.setBlock(px + dx, y - 1, pz + dz, B.STONE);
  }
  for (let dz = -3; dz <= 3; dz++) if (dz !== 2) w.setBlock(px + 3, y, pz + dz, B.STONE);
  g.paused = true;
  const v = g.villagers.list[0];
  const startPos = { x: px + 0.5, y: y + 0.02, z: pz + 0.5 };
  v.pos.set(startPos.x, startPos.y, startPos.z);
  v.vel.set(0, 0, 0);
  v.bedPos = null; v.workPos = null;
  v.path = null; v.pathTimer = 0; v.pathTarget = null; v.stuckTimer = 0;
  const target = { x: px + 6.5, z: pz + 0.5 };
  const startDist = Math.hypot(target.x - v.pos.x, target.z - v.pos.z);
  for (let i = 0; i < 220; i++) {
    v.goTo(target.x, target.z, v.baseSpeed * 1.6, 0.05, g);
    v.physics(0.05, g);
    await new Promise(r => setTimeout(r, 8));
  }
  g.paused = false;
  const endDist = Math.hypot(target.x - v.pos.x, target.z - v.pos.z);
  const crossed = v.pos.x > px + 3.2;
  return { startDist: +startDist.toFixed(1), endDist: +endDist.toFixed(1), crossed, pos: v.pos.toArray().map(n => +n.toFixed(1)), usedPath: !!(v.path && v.path.length) };
});

// 僵尸绕墙追玩家
R.zombieNav = await page.evaluate(async () => {
  const g = window.__game, w = g.world, B = MC.B;
  const px = Math.floor(g.player.pos.x), pz = Math.floor(g.player.pos.z);
  const y = w.surfaceY(px, pz) + 1;
  for (let dx = -4; dx <= 10; dx++) for (let dz = -4; dz <= 4; dz++) {
    for (let dy = 0; dy < 4; dy++) w.setBlock(px + dx, y + dy, pz + dz, B.AIR);
    w.setBlock(px + dx, y - 1, pz + dz, B.STONE);
  }
  for (let dz = -4; dz <= 4; dz++) if (Math.abs(dz) > 1) w.setBlock(px + 4, y, pz + dz, B.STONE);
  g.nature.time = 0.8; g.nature.weather = 'clear'; g.nature.applySky(0.016);
  const z = g.entities.spawnZombie(px + 8.5, y + 1.02, pz + 0.5);
  g.player.pos.set(px + 0.5, y + 1.02, pz + 0.5);
  g.freeze = true;
  const startX = z.pos.x;
  for (let i = 0; i < 160; i++) {
    z.behave(0.05, g);
    z.physics(0.05, g);
    await new Promise(r => setTimeout(r, 6));
  }
  const moved = startX - z.pos.x;
  const passed = z.pos.x < px + 4.2;
  z.remove();
  g.freeze = false;
  return { startX: +startX.toFixed(1), endX: +z.pos.x.toFixed(1), moved: +moved.toFixed(1), passed };
});

// 环境音（三种场景不报错）
R.ambient = await page.evaluate(async () => {
  const g = window.__game;
  const out = [];
  const orig = g.audio.setAmbient.bind(g.audio);
  g.audio.setAmbient = (m) => { out.push(m); return orig(m); };
  g.nature.weather = 'clear'; g.nature.time = 0.3; g.updateAmbient(2);
  g.nature.time = 0.85; g.updateAmbient(2);
  g.nature.weather = 'rain'; g.updateAmbient(2);
  g.nature.weather = 'clear';
  // 地下
  const p = g.player; p.pos.y = 8; g.updateAmbient(2);
  return { modes: out };
});

// 好感折扣 + 交易
R.trade = await page.evaluate(() => {
  const g = window.__game, p = g.player;
  const v = g.villagers.list[0];
  const t = v.trades[0];
  g.reputation = 50;
  const costNormal = g.tradeGiveCount(t);
  g.reputation = 95;
  const costFriend = g.tradeGiveCount(t);
  p.items.set(t.give.id, 30);
  g.ui.openTrade(v);
  g.ui.performTrade(0);
  const got = t.get.id;
  const countAfter = p.countOf(got);
  const repAfter = g.reputation;
  const title = document.getElementById('trade-title').textContent;
  g.closeModal();
  return { costNormal, costFriend, discount: t.give.count - costFriend, got, countAfter, repAfter, trades: g.stats.trades, title };
});

// 任务链
R.quests = await page.evaluate(async () => {
  const g = window.__game;
  g.stats.mined[MC.B.LOG] = 2;
  g.stats.crafted = 1;
  g.stats.trades = Math.max(1, g.stats.trades);
  g.reputation = 80;
  g.quests.update(1.2);
  const done = Array.from(g.quests.completed);
  const list = g.quests.list.length;
  return { done, list, sticks: g.player.countOf(MC.I.STICK), planks: g.player.countOf(MC.B.PLANKS), emeralds: g.player.countOf(MC.I.EMERALD) };
});

// 任务面板 UI（按 J）
R.questUI = await page.evaluate(async () => {
  const g = window.__game;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j', bubbles: true }));
  await new Promise(r => setTimeout(r, 120));
  const el = document.getElementById('quest-screen');
  const rows = document.querySelectorAll('#quest-list .quest-row').length;
  const done = document.querySelectorAll('#quest-list .quest-row.done').length;
  const rep = document.getElementById('quest-rep').textContent;
  const modal = g.ui.modal;
  const visible = !el.classList.contains('hidden');
  const modalText = document.querySelector('#quest-list .quest-row .quest-title').textContent;
  g.closeModal();
  return { visible, rows, done, rep, modal, modalText, hiddenAfter: el.classList.contains('hidden') };
});

R.errs = errs.slice(0, 8);
console.log(JSON.stringify(R, null, 1));
await browser.close();