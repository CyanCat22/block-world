// 线上部署验收：node tests/deploy-smoke.mjs [url]
import { puppeteer, CHROME } from './helpers/browser.mjs';

const url = process.argv[2] || 'https://cyancat22.github.io/block-world/';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist', '--window-size=1200,760'],
  defaultViewport: { width: 1200, height: 760 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) errs.push('http ' + r.status() + ' ' + r.url()); });
const R = { url };
try {
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  R.status = resp && resp.status();
  await page.waitForFunction('window.__MC_READY === true', { timeout: 60000 });
  R.title = await page.title();
  R.slots = await page.evaluate(() => document.querySelectorAll('#save-slots .slot-card').length);
  await page.evaluate(() => {
    localStorage.clear();
    document.getElementById('seed-input').value = '20261022';
    document.getElementById('btn-start').click();
  });
  await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 90000 });
  await new Promise(r => setTimeout(r, 3000));
  R.running = await page.evaluate(() => {
    const g = window.__game;
    return {
      started: g.started,
      chunks: g.world.chunks.size,
      villagers: g.villagers.list.length,
      day: g.nature.day,
      hour: +g.nature.hour.toFixed(1),
      pixelRatio: g.pixelRatio
    };
  });
  await page.evaluate(() => window.__game.saveGame());
  R.saved = await page.evaluate(() => ({ slot1: !!localStorage.getItem('mc_sandbox_save_v1') }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__MC_READY === true', { timeout: 60000 });
  R.continueVisible = await page.evaluate(() => !document.getElementById('btn-continue').classList.contains('hidden'));
  await page.evaluate(() => document.getElementById('btn-continue').click());
  await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  R.reloaded = await page.evaluate(() => ({
    day: window.__game.nature.day,
    villagers: window.__game.villagers.list.length,
    pos: window.__game.player.pos.toArray().map(v => +v.toFixed(1))
  }));

  const mp = await browser.newPage();
  await mp.emulate({
    viewport: { width: 860, height: 540, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  await mp.goto(url, { waitUntil: 'load', timeout: 60000 });
  await mp.waitForFunction('window.__MC_READY === true', { timeout: 60000 });
  await mp.evaluate(() => {
    localStorage.clear();
    document.getElementById('seed-input').value = '20261022';
    document.getElementById('btn-start').click();
  });
  await mp.waitForFunction('window.__game && window.__game.started === true', { timeout: 90000 });
  await new Promise(r => setTimeout(r, 2000));
  R.mobile = await mp.evaluate(() => ({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    controlsVisible: !document.getElementById('touch-controls').classList.contains('hidden'),
    buttons: document.querySelectorAll('#touch-controls [data-touch]').length
  }));
  await mp.close();
} catch (e) {
  R.error = e.message;
}
R.errs = errs.slice(0, 10);
console.log(JSON.stringify(R, null, 1));
await browser.close();
process.exit(R.error || R.errs.length ? 1 : 0);
