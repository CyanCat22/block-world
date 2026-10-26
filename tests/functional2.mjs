// 功能测试 v2：挖掘/放置/交易/僵尸/村民作息/作物/树苗/暂停竞态/存档
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=960,600'],
  defaultViewport: { width: 960, height: 600 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await page.evaluate(() => { localStorage.removeItem('mc_sandbox_save_v1'); document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 2000));
const R = {};

// 1. 用鼠标长按挖一块脚边草地
R.mining = await page.evaluate(async () => {
  const g = window.__game, p = g.player;
  p.pitch = -1.25; p.yaw = 0;
  // 手持木镐
  const target = p.getTargetBlock();
  if (!target) return { noTarget: true };
  const id = target.id;
  const t0 = performance.now();
  let n = 0;
  while (performance.now() - t0 < 2500 && g.world.getBlock(target.x, target.y, target.z) === id) {
    p.updateMining(0.05, { mouseLeft: true, keys: new Set() });
    n++;
  }
  return { target: { x: target.x, y: target.y, z: target.z }, id, after: g.world.getBlock(target.x, target.y, target.z), frames: n, ms: Math.round(performance.now() - t0), drops: Array.from(p.items.entries()) };
});

// 2. 放置方块（低头看地面）
R.place = await page.evaluate(() => {
  const g = window.__game, p = g.player;
  p.pitch = -1.3;
  p.items.set(MC.B.PLANKS, 10);
  p.items.set(MC.B.TORCH, 4);
  p.hotbar[0] = MC.B.PLANKS;
  p.selected = 0;
  const t = p.getTargetBlock();
  const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
  const before = g.world.getBlock(x, y, z);
  p.useHeld({});
  const placed = g.world.getBlock(x, y, z);
  // 放火把
  p.hotbar[0] = MC.B.TORCH;
  p.useHeld({});
  return { before, placed, planks: p.countOf(MC.B.PLANKS), torches: p.countOf(MC.B.TORCH), mods: g.world.mods.size };
});

// 3. 暂停竞态：交易开关后时间应继续流动
R.pauseRace = await page.evaluate(async () => {
  const g = window.__game;
  const v = g.villagers.list[0];
  const t0 = g.nature.time;
  g.openTrade(v);
  g.closeModal();
  await new Promise(r => setTimeout(r, 1200));
  return { paused: g.paused, advanced: +(g.nature.time - t0).toFixed(5), modal: g.ui.modal };
});

// 4. 村民作息：10 点工作且会移动
R.schedule = await page.evaluate(async () => {
  const g = window.__game;
  g.nature.time = (10 - 6) / 24;
  const before = g.villagers.list.map(v => [v.pos.x, v.pos.z]);
  await new Promise(r => setTimeout(r, 4000));
  const after = g.villagers.list.map(v => [v.pos.x, v.pos.z]);
  const moved = before.map((b, i) => +Math.hypot(after[i][0] - b[0], after[i][1] - b[1]).toFixed(2));
  return { states: g.villagers.list.map(v => v.state), moved };
});

// 5. 作物生长 & 树苗成树
R.growth = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  const p = g.player.pos;
  const x = Math.floor(p.x) + 4, z = Math.floor(p.z) + 4;
  const y = w.surfaceY(x, z);
  // 平整出农田 + 水
  w.setBlock(x, y, z, MC.B.FARMLAND_WET, false);
  w.setBlock(x, y + 1, z, MC.B.WHEAT0, false);
  let grown = false;
  for (let i = 0; i < 400 && !grown; i++) g.nature.tickBlock(w, x, y + 1, z, w.getBlock(x, y + 1, z));
  grown = w.getBlock(x, y + 1, z) !== MC.B.WHEAT0;
  // 树苗
  const tx = x + 3, tz = z + 3;
  const ty = w.surfaceY(tx, tz);
  for (let dy = 1; dy <= 6; dy++) if (w.getBlock(tx, ty + dy, tz) !== MC.B.AIR) w.setBlock(tx, ty + dy, tz, MC.B.AIR, false);
  w.setBlock(tx, ty, tz, MC.B.GRASS, false);
  w.setBlock(tx, ty + 1, tz, MC.B.SAPLING, false);
  let tree = false;
  for (let i = 0; i < 900 && !tree; i++) {
    g.nature.tickBlock(w, tx, ty + 1, tz, w.getBlock(tx, ty + 1, tz));
    tree = w.getBlock(tx, ty + 1, tz) === MC.B.LOG;
  }
  return { grown: w.getBlock(x, y + 1, z), tree };
});

// 6. 火焰：引燃后蔓延/烧尽
R.fire = await page.evaluate(async () => {
  const g = window.__game, w = g.world, p = g.player.pos;
  const x = Math.floor(p.x) + 6, z = Math.floor(p.z) + 6;
  const y = w.surfaceY(x, z) + 1;
  // 造一小片木头
  for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 2; dz++) w.setBlock(x + dx, y, z + dz, MC.B.LOG);
  w.setBlock(x, y + 1, z, MC.B.FIRE);
  g.nature.fireTimers.set(`${x},${y + 1},${z}`, 1.2);
  await new Promise(r => setTimeout(r, 2500));
  let fireBlocks = 0, burned = 0;
  for (let dx = -2; dx < 5; dx++) for (let dz = -2; dz < 4; dz++) {
    if (w.getBlock(x + dx, y + 1, z + dz) === MC.B.FIRE) fireBlocks++;
  }
  return { fireBlocks };
});

// 7. 僵尸追击与伤害
R.zombie = await page.evaluate(async () => {
  const g = window.__game;
  g.player.health = 20;
  g.player.dead = false;
  g.nature.time = (22 - 6) / 24;
  const z = g.entities.spawnZombie(g.player.pos.x + 5, g.player.pos.y, g.player.pos.z);
  const d0 = g.distanceToPlayer(z.pos);
  await new Promise(r => setTimeout(r, 3500));
  return { d0: +d0.toFixed(2), d1: +g.distanceToPlayer(z.pos).toFixed(2), hp: g.player.health, alive: !z.removed };
});

// 8. 死亡与重生
R.death = await page.evaluate(async () => {
  const g = window.__game;
  g.player.damage(30, '僵尸');
  await new Promise(r => setTimeout(r, 300));
  const shown = !document.getElementById('death-screen').classList.contains('hidden');
  g.respawn();
  return { shown, hud: document.getElementById('hud').classList.contains('hidden'), hp: g.player.health, inv: g.player.items.size };
});

// 9. 存档/读档
await page.evaluate(() => { window.__game.saveGame(); });
const bytes = await page.evaluate(() => localStorage.getItem('mc_sandbox_save_v1').length);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await page.evaluate(() => document.getElementById('btn-continue').click());
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));
R.save = { bytes, loaded: await page.evaluate(() => { const g = window.__game; return { pos: g.player.pos.toArray().map(v => +v.toFixed(1)), items: Array.from(g.player.items.entries()), day: g.nature.day, villagers: g.villagers.list.length, mods: g.world.mods.size }; }) };
R.errs = errs.slice(0, 8);
console.log(JSON.stringify(R, null, 1));
await browser.close();