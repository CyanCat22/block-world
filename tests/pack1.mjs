// 夜晚体验包验收：设置/小地图/影子/睡觉/雨灭火/中键取方块
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1200,760'],
  defaultViewport: { width: 1200, height: 760 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await page.evaluate(() => { localStorage.removeItem('mc_sandbox_save_v1'); localStorage.removeItem('mc_settings_v1'); document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 2000));
const R = {};

// 设置面板
R.settingsOpen = await page.evaluate(() => {
  window.__game.openSettings();
  return {
    modal: window.__game.ui.modal,
    visible: !document.getElementById('settings-screen').classList.contains('hidden'),
    pauseHidden: document.getElementById('pause-screen').classList.contains('hidden'),
    minimapHidden: document.getElementById('minimap').classList.contains('hidden')
  };
});
R.settingsChange = await page.evaluate(() => {
  const g = window.__game;
  const fire = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  fire('set-sensitivity', 0.004);
  fire('set-volume', 0.5);
  fire('set-renderdist', 8);
  fire('set-fov', 90);
  const sh = document.getElementById('set-shadows'); sh.checked = false; sh.dispatchEvent(new Event('change', { bubbles: true }));
  return { settings: g.settings, renderDist: g.world.renderDist, shadowVisible: g.entities.list.some(e => e.shadow && e.shadow.visible) };
});
R.settingsClose = await page.evaluate(() => {
  const g = window.__game;
  g.closeModal(true);
  return { modal: g.ui.modal, hidden: document.getElementById('settings-screen').classList.contains('hidden') };
});
R.persist = await page.evaluate(() => JSON.parse(localStorage.getItem('mc_settings_v1')));

// FOV 生效
await new Promise(r => setTimeout(r, 600));
R.fov = await page.evaluate(() => ({ fov: +window.__game.camera.fov.toFixed(1), setting: window.__game.settings.fov }));

// 恢复设置
await page.evaluate(() => {
  const g = window.__game;
  Object.assign(g.settings, { sensitivity: 0.0023, volume: 0.8, renderDist: 5, fov: 72, shadows: true, minimap: true });
  g.applySettings();
});

// 小地图
R.minimap = await page.evaluate(() => {
  const cv = document.getElementById('minimap-canvas');
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) colors.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return {
    hidden: document.getElementById('minimap').classList.contains('hidden'),
    distinctColors: colors.size,
    dirText: document.getElementById('minimap-dir').textContent,
    canvasSize: [cv.width, cv.height]
  };
});
R.tabToggle = await page.evaluate(() => {
  const g = window.__game;
  g.settings.minimap = false; g.applySettings();
  const off = document.getElementById('minimap').classList.contains('hidden');
  g.settings.minimap = true; g.applySettings();
  const on = !document.getElementById('minimap').classList.contains('hidden');
  return { off, on };
});

// 影子
R.shadow = await page.evaluate(() => {
  const g = window.__game;
  const v = g.villagers.list[0];
  return {
    hasShadow: !!v.shadow,
    visible: v.shadow ? v.shadow.visible : false,
    pos: v.shadow ? v.shadow.position.toArray().map(n => +n.toFixed(2)) : null,
    scale: v.shadow ? +v.shadow.scale.x.toFixed(2) : null,
    opacity: v.shadow ? +v.shadow.material.opacity.toFixed(2) : null
  };
});

// 睡觉（把床放在面前并右键）
R.sleep = await page.evaluate(async () => {
  const g = window.__game, w = g.world, p = g.player;
  // 清理僵尸
  for (const e of g.entities.list.slice()) if (e.kind === 'zombie') e.remove();
  // 夜晚
  g.nature.time = 0.72; g.nature.weather = 'clear'; g.nature.weatherBlend = 0; g.nature.applySky(0.016);
  // 在玩家旁边放一张床，站到床正上方低头看它
  const bx = Math.floor(p.pos.x) + 1, bz = Math.floor(p.pos.z);
  const by = w.surfaceY(bx, bz);
  w.setBlock(bx, by, bz, MC.B.BED);
  p.pos.set(bx + 0.5, by + 2.02, bz + 0.5);
  p.yaw = 0; p.pitch = -1.5;
  p.updateCamera(g.camera);
  const target = p.getTargetBlock();
  const day0 = g.nature.day, hp0 = p.health;
  const used = p.useHeld({ mouseRight: true });
  const targetId = target ? target.id : null;
  await new Promise(r => setTimeout(r, 4600));
  return {
    used, targetId, sleeping: g.sleeping, freeze: g.freeze,
    day0, day1: g.nature.day, time: +g.nature.time.toFixed(3),
    hp0, hp1: p.health, overlayHidden: document.getElementById('sleep-overlay').classList.contains('hidden'),
    toast: document.querySelector('#toast-wrap .toast:last-child') ? document.querySelector('#toast-wrap .toast:last-child').textContent : ''
  };
});

// 白天睡觉应被拒绝
R.sleepDay = await page.evaluate(() => {
  const g = window.__game;
  g.nature.time = 0.2; g.nature.applySky(0.016);
  g.trySleep();
  return { sleeping: g.sleeping };
});

// 雨灭火
R.rainFire = await page.evaluate(async () => {
  const g = window.__game, w = g.world, p = g.player;
  g.nature.weather = 'rain'; g.nature.weatherBlend = 1;
  const bx = Math.floor(p.pos.x) + 4, bz = Math.floor(p.pos.z) + 4;
  // 找一根上方完全无遮挡的柱子，保证火暴露在雨里
  const by = w.surfaceY(bx, bz) + 6;
  w.setBlock(bx, by, bz, MC.B.FIRE, false);
  g.nature.fireTimers.set(bx + ',' + by + ',' + bz, 60);
  await new Promise(r => setTimeout(r, 2500));
  return { stillFire: w.getBlock(bx, by, bz) === MC.B.FIRE, timers: g.nature.fireTimers.size };
});

// 中键取方块：准星对着脚下方块，背包里只有掉落物泥土
R.pick = await page.evaluate(() => {
  const g = window.__game, p = g.player, w = g.world;
  // 在正前方放一块泥土，准星平视它
  const px = Math.floor(p.pos.x), pz = Math.floor(p.pos.z);
  const py = w.surfaceY(px, pz) + 1.02;
  p.pos.set(px + 0.5, py, pz + 0.5);
  const bx = px + 2, by = Math.floor(py) + 1, bz = pz;
  w.setBlock(bx, by, bz, MC.B.DIRT);
  p.items.set(MC.B.DIRT, 5);
  p.items.delete(MC.B.GRASS);
  p.hotbar[0] = 0; p.hotbar[3] = MC.B.DIRT;
  p.selectSlot(0);
  p.yaw = -Math.PI / 2; p.pitch = 0; p.updateCamera(g.camera);
  const target = p.getTargetBlock();
  p.pickBlock();
  return { targetId: target ? target.id : null, selected: p.selected, selectedId: p.selectedItem() };
});

R.errs = errs.slice(0, 8);
console.log(JSON.stringify(R, null, 1));
await browser.close();