// 界面流程测试：暂停/帮助/背包/死亡/继续游戏/快捷键
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1200,700'],
  defaultViewport: { width: 1200, height: 700 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.evaluate(() => localStorage.removeItem('mc_sandbox_save_v1'));
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
const R = {};

// 开始界面内容
console.log('stage:', 'R.start'); R.start = await page.evaluate(() => ({
  visible: !document.getElementById('start-screen').classList.contains('hidden'),
  title: document.querySelector('.title-cn').textContent,
  startBtn: document.getElementById('btn-start').textContent.trim(),
  continueHidden: document.getElementById('btn-continue').classList.contains('hidden'),
  loadingHidden: document.getElementById('loading').classList.contains('hidden'),
  canvas: !!document.querySelector('canvas')
}));

await page.evaluate(() => { document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 2000));

// HUD 内容
console.log('stage:', 'R.hud'); R.hud = await page.evaluate(() => ({
  hudVisible: !document.getElementById('hud').classList.contains('hidden'),
  clock: document.getElementById('clock-text').textContent,
  weather: document.getElementById('weather-text').textContent,
  hearts: document.querySelectorAll('#hearts .stat-icon').length,
  hunger: document.querySelectorAll('#hunger .stat-icon').length,
  slots: document.querySelectorAll('#hotbar .slot').length,
  firstIcon: !!document.querySelector('#hotbar .slot .icon').style.backgroundImage,
  hint: !!document.getElementById('hint'),
  hand: !!window.__game.hand
}));

// 打开背包 → 关闭
await page.evaluate(() => window.__game.openInventory());
await new Promise(r => setTimeout(r, 300));
console.log('stage:', 'R.inventory'); R.inventory = await page.evaluate(() => ({
  modal: window.__game.ui.modal,
  visible: !document.getElementById('inventory-screen').classList.contains('hidden'),
  cells: document.querySelectorAll('#inv-grid .item-cell').length,
  recipes: document.querySelectorAll('#recipe-list .recipe').length
}));
await page.evaluate(() => window.__game.closeModal());
await new Promise(r => setTimeout(r, 300));
R.inventoryClosed = await page.evaluate(() => window.__game.ui.modal);

// 帮助（H 键）
await page.evaluate(() => { window.__game.ui.modal = null; });
await page.keyboard.press('KeyH');
await new Promise(r => setTimeout(r, 300));
console.log('stage:', 'R.help'); R.help = await page.evaluate(() => ({
  modal: window.__game.ui.modal,
  visible: !document.getElementById('help-screen').classList.contains('hidden'),
  rules: document.querySelectorAll('#help-screen .help-cols ul').length
}));
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 300));
R.helpClosed = await page.evaluate(() => ({ modal: window.__game.ui.modal, paused: window.__game.paused }));

// 暂停菜单（Esc）
await page.evaluate(() => { window.__game.ui.modal = null; window.__game.paused = false; });
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 300));
console.log('stage:', 'R.pause'); R.pause = await page.evaluate(() => ({ paused: window.__game.paused, visible: !document.getElementById('pause-screen').classList.contains('hidden') }));
await page.evaluate(() => document.getElementById('btn-help').click());
await new Promise(r => setTimeout(r, 250));
R.pauseHelp = await page.evaluate(() => ({ paused: window.__game.paused, help: !document.getElementById('help-screen').classList.contains('hidden'), pauseVisible: !document.getElementById('pause-screen').classList.contains('hidden') }));
await page.evaluate(() => document.querySelector('#help-screen [data-close]').click());
await new Promise(r => setTimeout(r, 250));
R.pauseHelpClosed = await page.evaluate(() => ({ paused: window.__game.paused, pauseVisible: !document.getElementById('pause-screen').classList.contains('hidden'), modal: window.__game.ui.modal }));
await page.evaluate(() => document.getElementById('btn-resume').click());
await new Promise(r => setTimeout(r, 400));
R.resumed = await page.evaluate(async () => {
  const g = window.__game;
  const t = g.nature.time;
  await new Promise(res => setTimeout(res, 500));
  return { paused: g.paused, timeAdvancing: g.nature.time !== t };
});

// 死亡界面与重生
await page.evaluate(() => { const g = window.__game; g.player.damage(40, '僵尸'); });
await new Promise(r => setTimeout(r, 400));
console.log('stage:', 'R.death'); R.death = await page.evaluate(() => ({ visible: !document.getElementById('death-screen').classList.contains('hidden'), msg: document.getElementById('death-msg').textContent }));
await page.evaluate(() => document.getElementById('btn-respawn').click());
await new Promise(r => setTimeout(r, 400));
R.respawn = await page.evaluate(() => {
  const g = window.__game;
  return { hp: g.player.health, pos: g.player.pos.toArray().map(v => +v.toFixed(1)), deathHidden: document.getElementById('death-screen').classList.contains('hidden') };
});

// 调试与静音快捷键
await page.keyboard.press('F3');
await page.keyboard.press('KeyM');
await new Promise(r => setTimeout(r, 500));
console.log('stage:', 'R.keys'); R.keys = await page.evaluate(() => ({ debugVisible: !document.getElementById('debug').classList.contains('hidden'), debugText: document.getElementById('debug').textContent.slice(0, 60), muted: localStorage.getItem('mc_audio_muted') }));

// 存档后刷新 → 继续
await page.evaluate(() => window.__game.saveGame());
await page.close();
const page2 = await browser.newPage();
await page2.setViewport({ width: 1200, height: 700 });
await page2.goto(PAGE_URL, { waitUntil: 'load' });
await page2.waitForFunction('window.__MC_READY === true');
R.continueVisible = await page2.evaluate(() => !document.getElementById('btn-continue').classList.contains('hidden'));
await page2.evaluate(() => document.getElementById('btn-continue').click());
await page2.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));
console.log('stage:', 'R.continue'); R.continue = await page2.evaluate(() => {
  const g = window.__game;
  return { villagers: g.villagers.list.length, day: g.nature.day, clock: document.getElementById('clock-text').textContent, pos: g.player.pos.toArray().map(v => +v.toFixed(1)) };
});
R.errs = errs.slice(0, 8);
console.log(JSON.stringify(R, null, 1));
await browser.close();