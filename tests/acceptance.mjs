// 验收测试：动物刷新、下雨、火焰蔓延、摔落伤害、潜水
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--headless=new','--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--window-size=960,600'],
  defaultViewport: { width: 960, height: 600 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push((e.stack || e.message).split('\n').slice(0, 4).join(' | ')));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await page.evaluate(() => { localStorage.removeItem('mc_sandbox_save_v1'); document.getElementById('seed-input').value='20261022'; document.getElementById('btn-start').click(); });
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));
const R = {};

R.animals = await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 8; i++) g.nature.trySpawnAnimals();
  return { counts: ['sheep','cow','pig','chicken'].map(k => k + ':' + g.entities.countKind(k)), total: g.entities.list.length };
});

R.rain = await page.evaluate(async () => {
  const g = window.__game;
  g.nature.weather = 'rain'; g.nature.weatherBlend = 1; g.nature.rain.visible = true;
  g.audio.setRain(true);
  await new Promise(r => setTimeout(r, 600));
  return { visible: g.nature.rain.visible, opacity: +g.nature.rainMat.opacity.toFixed(2) };
});

R.fire = await page.evaluate(async () => {
  const g = window.__game, w = g.world, p = g.player.pos;
  g.nature.weather = 'clear'; g.nature.weatherBlend = 0;   // 晴天测试火势蔓延
  const x = Math.floor(p.x) + 3, z = Math.floor(p.z) + 3, y = w.surfaceY(x, z) + 1;
  // 清空 3x1x1 空间放木头
  for (let dx = 0; dx < 3; dx++) w.setBlock(x + dx, y, z, MC.B.LOG);
  for (let dx = 0; dx < 3; dx++) w.setBlock(x + dx, y + 1, z, MC.B.AIR);
  w.setBlock(x, y + 1, z, MC.B.FIRE, false);
  g.nature.fireTimers.set(`${x},${y+1},${z}`, 20);
  const before = w.getBlock(x + 1, y, z);
  await new Promise(r => setTimeout(r, 4500));
  return { before, logsLeft: [0,1,2].map(dx => w.getBlock(x + dx, y, z)), fireNow: w.getBlock(x, y + 1, z) };
});

R.fall = await page.evaluate(async () => {
  const g = window.__game, p = g.player;
  p.health = 20; p.dead = false;
  const ground = g.world.surfaceY(Math.floor(p.pos.x), Math.floor(p.pos.z));
  p.pos.set(p.pos.x, ground + 12, p.pos.z);
  p.vel.set(0, 0, 0);
  await new Promise(r => setTimeout(r, 3000));
  return { hp: p.health, y: +p.pos.y.toFixed(1) };
});

R.water = await page.evaluate(async () => {
  const g = window.__game, p = g.player, w = g.world;
  // 找最近的水面
  let found = null;
  const px = Math.floor(p.pos.x), pz = Math.floor(p.pos.z);
  for (let r = 0; r < 90 && !found; r += 2) {
    for (let a = 0; a < 12; a++) {
      const ang = a / 12 * Math.PI * 2;
      const x = Math.floor(px + Math.cos(ang) * r), z = Math.floor(pz + Math.sin(ang) * r);
      if (w.getBlock(x, MC.WORLD_CONST ? MC.WORLD_CONST.SEA : 30, z) === MC.B.WATER) { found = { x, z }; break; }
    }
  }
  if (!found) return { noWater: true };
  p.pos.set(found.x + 0.5, (MC.WORLD_CONST ? MC.WORLD_CONST.SEA : 30) - 1.5, found.z + 0.5);
  p.vel.set(0, 0, 0);
  await new Promise(r => setTimeout(r, 1200));
  return { inWater: p.headInWater, air: +p.air.toFixed(1), y: +p.pos.y.toFixed(1), water: !!found };
});

R.time = await page.evaluate(() => {
  const g = window.__game;
  return { clock: document.getElementById('clock-text').textContent, weather: document.getElementById('weather-text').textContent, day: g.nature.day };
});
R.errs = errs.slice(0, 6);
console.log(JSON.stringify(R, null, 1));
await browser.close();
