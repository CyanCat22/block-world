// 用方块数据画村庄俯视地图（不依赖截图）
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=800,600'],
  defaultViewport: { width: 800, height: 600 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await page.evaluate(() => { localStorage.removeItem('mc_sandbox_save_v1'); document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1000));

const map = await page.evaluate(() => {
  const g = window.__game, v = g.world.village, w = g.world;
  const B = MC.B;
  const cx = v.center.x, cz = v.center.z;
  const R = 26;
  const legend = { 0: ' ', 1: '#', 2: '.', 3: ',', 4: 'T', 5: '~', 6: '=', 7: 'P', 8: 'G', 9: 'p', 10: 'w', 11: 'f', 12: 'h', 13: 'W', 14: 'c', 15: 'o', 16: 'i', 17: 'd', 18: 'F', 19: '|', 20: 'S', 21: 'A', 22: '$', 23: 'R', 24: 'Y', 25: 'B', 26: 'N', 27: '&', 28: 'C', 29: 'X', 30: 'M', 31: '?' };
  const ch = (id) => {
    switch (id) {
      case B.AIR: return ' ';
      case B.STONE: return '%';
      case B.GRASS: return ',';
      case B.DIRT: return '.';
      case B.COBBLE: return 'C';
      case B.LOG: return 'L';
      case B.LEAVES: return '&';
      case B.SAND: return ':';
      case B.WATER: return '~';
      case B.PLANKS: return '=';
      case B.GLASS: return 'o';
      case B.BEDROCK: return '#';
      case B.GRAVEL: return ':';
      case B.FARMLAND: return 'f';
      case B.FARMLAND_WET: return 'F';
      case B.WHEAT0: case B.WHEAT1: case B.WHEAT2: case B.WHEAT3: return 'w';
      case B.TORCH: return 'i';
      case B.SAPLING: return 's';
      case B.FLOWER_RED: case B.FLOWER_YELLOW: return '*';
      case B.TALL_GRASS: return '"';
      case B.BED: return 'B';
      case B.CRAFTING: return 'T';
      case B.ANVIL: return 'A';
      case B.BOOKSHELF: return 'K';
      case B.FIRE: return '!';
      default: return '?';
    }
  };
  const rowsY = [v.groundY + 1, v.groundY + 4];
  const out = [];
  for (const y of rowsY) {
    const rows = [];
    for (let dz = -R; dz <= R; dz += 2) {
      let line = '';
      for (let dx = -R; dx <= R; dx += 1) {
        line += ch(w.getBlock(cx + dx, y, cz + dz));
      }
      rows.push(line);
    }
    out.push(rows.join('\n'));
  }
  return { center: [cx, cz], groundY: v.groundY, rows: out, beds: v.beds.length, houses: v.houses.length, spawn: w.spawn };
});
console.log('CENTER', map.center, 'groundY', map.groundY, 'beds', map.beds, 'houses', map.houses, 'spawn', map.spawn);
console.log('--- y = groundY+1 (地面层) ---');
console.log(map.rows[0]);
console.log('--- y = groundY+4 (屋顶/墙) ---');
console.log(map.rows[1]);
console.log('ERRS', errs.slice(0, 3));
await browser.close();