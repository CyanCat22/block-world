// 音频扩展验收：主音量 / 环境音 / 材质脚步 / 方位声像 / 新音效
// 运行：node tests/audio-env.mjs
// 使用纯 audio.js 测试页（file://），不依赖游戏集成。
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';

const TEST_URL = TEST_HTML_URL;

const ORIGINAL_SOUNDS = [
  'break_stone', 'break_wood', 'break_dirt', 'break_leaves',
  'place', 'step', 'jump', 'hurt', 'eat', 'trade', 'emerald', 'click',
  'craft', 'door', 'sleep', 'villager_hmm', 'villager_hurt', 'zombie',
  'sheep', 'pig', 'chicken', 'cow', 'thunder', 'lightning', 'splash', 'levelup'
];
const NEW_SOUNDS = [
  'bird', 'cricket', 'drip', 'chest_open', 'chest_close', 'furnace',
  'hoe', 'hit_wood', 'villager_no', 'gift',
  'step_grass', 'step_stone', 'step_sand', 'step_wood', 'step_dirt', 'step_gravel', 'step_water'
];

const errors = [];
const problems = [];

function check(name, cond) {
  if (!cond) problems.push(name);
}
function checkEqual(name, actual, expected) {
  if (actual !== expected) problems.push(name + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}
function attachLogging(page, tag) {
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(tag + ' console.error: ' + m.text());
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=960,600'],
  defaultViewport: { width: 960, height: 600 }
});

const R = {};
try {
  const page = await browser.newPage();
  attachLogging(page, '[main]');
  await page.goto(TEST_URL, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('window.__AUDIO_READY === true');

  // 清空存储并重载：确认默认主音量 0.8、默认未静音
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* 忽略 */ } });
  await page.reload({ waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('window.__AUDIO_READY === true');

  R.defaults = await page.evaluate(() => {
    const methods = ['init', 'play', 'playAt', 'setVolume', 'getVolume', 'setAmbient',
      'setRain', 'setWind', 'setUnderwater', 'stopAll', 'setEnabled', 'toggleMuted'];
    const types = {};
    methods.forEach((m) => { types[m] = typeof MC.audio[m]; });
    let stored = null;
    try { stored = localStorage.getItem('mc_audio_volume'); } catch (e) { stored = 'err'; }
    return { volume: MC.audio.getVolume(), enabled: MC.audio.enabled, stored, methods: types };
  });

  // 记录 createGain 调用次数，用于断言 setAmbient 重复同 mode 不重建节点
  await page.evaluate(() => {
    window.__gainCount = 0;
    const proto = window.AudioContext && window.AudioContext.prototype;
    if (proto && proto.createGain && !proto.__testWrapped) {
      const orig = proto.createGain;
      proto.createGain = function () { window.__gainCount++; return orig.apply(this, arguments); };
      proto.__testWrapped = true;
    }
  });

  // 真实用户手势 → init（模拟游戏开始按钮）
  await page.click('#btn-init');
  R.initResult = await page.evaluate(() => MC.audio.init());

  R.volumeFlow = await page.evaluate(() => {
    const out = {};
    out.setResult = MC.audio.setVolume(0.5);
    out.getAfterSet = MC.audio.getVolume();
    try { out.stored05 = localStorage.getItem('mc_audio_volume'); } catch (e) { out.stored05 = 'err'; }
    MC.audio.setVolume(1.7);
    out.clampedHigh = MC.audio.getVolume();
    MC.audio.setVolume(-2);
    out.clampedLow = MC.audio.getVolume();
    MC.audio.setVolume(NaN);
    out.nanIgnored = MC.audio.getVolume();
    MC.audio.setVolume(0.5);
    return out;
  });

  R.sounds = await page.evaluate(async (names) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    for (const n of names) {
      out[n] = MC.audio.play(n, { volume: 0.7, pitch: 1 });
      await sleep(200);
    }
    out.__unknown = MC.audio.play('definitely_not_a_sound');
    out.__zeroVolume = MC.audio.play('click', { volume: 0 });
    out.__panLeft = MC.audio.play('step_grass', { pan: -1 });
    out.__panRight = MC.audio.play('step_grass', { pan: 1 });
    return out;
  }, ORIGINAL_SOUNDS.concat(NEW_SOUNDS));

  R.playAt = await page.evaluate(() => {
    const listener = { pos: { x: 0, y: 0, z: 0 }, yaw: 0 };
    const out = {};
    out.near = MC.audio.playAt('bird', { x: 5, y: 0, z: 0 }, listener);       // 5 格：满音量
    out.edge8 = MC.audio.playAt('bird', { x: 0, y: 0, z: -8 }, listener);     // 8 格：边界
    out.mid = MC.audio.playAt('bird', { x: 16, y: 0, z: 0 }, listener);       // 16 格：半衰减
    out.far = MC.audio.playAt('bird', { x: 40, y: 0, z: 0 }, listener);       // 40 格：静音
    out.arrayPos = MC.audio.playAt('bird', [3, 0, 0], { pos: [0, 0, 0], yaw: Math.PI / 2 });
    out.noListener = MC.audio.playAt('bird', { x: 2, y: 0, z: 2 });
    out.unknown = MC.audio.playAt('definitely_not_a_sound', { x: 1, y: 0, z: 0 }, listener);
    return out;
  });

  R.ambient = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { calls: [], repeatGainDelta: -1 };
    MC.audio.setAmbient('day');
    await sleep(350);
    const before = window.__gainCount;
    MC.audio.setAmbient('day'); // 重复同一模式：应直接返回，不重启
    out.repeatGainDelta = window.__gainCount - before;
    await sleep(1600);
    MC.audio.setAmbient('night');
    out.calls.push('night');
    await sleep(1800);
    MC.audio.setAmbient('rain');
    out.calls.push('rain');
    await sleep(1800);
    MC.audio.setAmbient('cave');
    out.calls.push('cave');
    await sleep(1800);
    MC.audio.setAmbient('none');
    out.calls.push('none');
    await sleep(1700);
    // 非法模式必须安全归一为 none
    out.invalid = MC.audio.setAmbient('volcano');
    out.invalidNull = MC.audio.setAmbient(null);
    return out;
  });

  // 天气雨 + 环境音 rain 共用同一层雨声，切换后不抛错
  R.rainShare = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { ok: true };
    MC.audio.setRain(true);
    MC.audio.setAmbient('rain');
    await sleep(300);
    MC.audio.setAmbient('none');
    await sleep(300);
    MC.audio.setRain(false);
    return out;
  });

  R.enableFlow = await page.evaluate(() => {
    const out = {};
    MC.audio.setVolume(1);
    out.vol1 = MC.audio.getVolume();
    try { out.storedVol1 = localStorage.getItem('mc_audio_volume'); } catch (e) { out.storedVol1 = 'err'; }

    MC.audio.setEnabled(false);
    out.disabled = MC.audio.enabled;
    try { out.storedMuted = localStorage.getItem('mc_audio_muted'); } catch (e) { out.storedMuted = 'err'; }
    out.playWhileMuted = MC.audio.play('click');

    MC.audio.setEnabled(true);
    out.enabledAgain = MC.audio.enabled;
    try { out.storedUnmuted = localStorage.getItem('mc_audio_muted'); } catch (e) { out.storedUnmuted = 'err'; }

    out.toggle1 = MC.audio.toggleMuted(); // -> false
    out.toggle2 = MC.audio.toggleMuted(); // -> true
    out.stopAll = MC.audio.stopAll();
    return out;
  });

  // 持久化：重新加载页面后从 localStorage 恢复
  await page.evaluate(() => MC.audio.setVolume(0.7));
  await page.reload({ waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('window.__AUDIO_READY === true');
  R.persistence = await page.evaluate(() => {
    let stored = null;
    try { stored = localStorage.getItem('mc_audio_volume'); } catch (e) { stored = 'err'; }
    return { getVolume: MC.audio.getVolume(), stored, enabled: MC.audio.enabled };
  });

  // 无 AudioContext：所有方法必须静默、不抛异常
  const page2 = await browser.newPage();
  attachLogging(page2, '[no-ctx]');
  await page2.evaluateOnNewDocument(() => {
    try {
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
    } catch (e) { /* 忽略 */ }
  });
  await page2.goto(TEST_URL, { waitUntil: 'load', timeout: 20000 });
  await page2.waitForFunction('window.__AUDIO_READY === true');
  R.noContext = await page2.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { throws: [] };
    try {
      out.init = MC.audio.init();
      out.play = MC.audio.play('bird');
      out.playAt = MC.audio.playAt('bird', { x: 1, y: 0, z: 0 }, { pos: { x: 0, y: 0, z: 0 }, yaw: 0 });
      out.setVolume = MC.audio.setVolume(0.42);
      out.getVolume = MC.audio.getVolume();
      out.ambientDay = MC.audio.setAmbient('day');
      out.ambientNight = MC.audio.setAmbient('night');
      out.ambientNone = MC.audio.setAmbient('none');
      out.rain = MC.audio.setRain(true);
      out.rainOff = MC.audio.setRain(false);
      out.wind = MC.audio.setWind(true);
      out.windOff = MC.audio.setWind(false);
      out.underwater = MC.audio.setUnderwater(true);
      out.underwaterOff = MC.audio.setUnderwater(false);
      out.stopAll = MC.audio.stopAll();
      out.toggle = MC.audio.toggleMuted();
      out.toggle2 = MC.audio.toggleMuted();
    } catch (e) {
      out.throws.push(e && e.message ? e.message : String(e));
    }
    await sleep(300);
    return out;
  });

  // ---------------- 断言 ----------------
  check('default volume 0.8', R.defaults.volume === 0.8);
  check('default enabled', R.defaults.enabled === true);
  check('no stored volume before first set', R.defaults.stored === null);
  for (const m of Object.keys(R.defaults.methods)) check('API ' + m, R.defaults.methods[m] === 'function');
  check('init result true', R.initResult === true);

  checkEqual('setVolume return', R.volumeFlow.setResult, 0.5);
  checkEqual('getVolume after set', R.volumeFlow.getAfterSet, 0.5);
  checkEqual('stored volume 0.5', R.volumeFlow.stored05, '0.5');
  checkEqual('volume clamp high', R.volumeFlow.clampedHigh, 1);
  checkEqual('volume clamp low', R.volumeFlow.clampedLow, 0);
  checkEqual('volume NaN ignored', R.volumeFlow.nanIgnored, 0);

  for (const n of ORIGINAL_SOUNDS.concat(NEW_SOUNDS)) check('play ' + n, R.sounds[n] === true);
  check('unknown sound silent', R.sounds.__unknown === false);
  check('zero volume silent', R.sounds.__zeroVolume === false);
  check('pan left play', R.sounds.__panLeft === true);
  check('pan right play', R.sounds.__panRight === true);

  check('playAt near', R.playAt.near === true);
  check('playAt 8m edge', R.playAt.edge8 === true);
  check('playAt 16m mid', R.playAt.mid === true);
  check('playAt 40m silent', R.playAt.far === false);
  check('playAt array pos', R.playAt.arrayPos === true);
  check('playAt no listener', R.playAt.noListener === true);
  check('playAt unknown silent', R.playAt.unknown === false);

  check('ambient repeat no restart', R.ambient.repeatGainDelta === 0);
  check('ambient invalid mode', R.ambient.invalid === 'none');
  check('ambient null mode', R.ambient.invalidNull === 'none');
  check('rain share no throw', R.rainShare.ok === true);

  checkEqual('volume 1 persisted', R.enableFlow.storedVol1, '1');
  checkEqual('disabled state', R.enableFlow.disabled, false);
  checkEqual('muted storage', R.enableFlow.storedMuted, '1');
  check('play while muted silent', R.enableFlow.playWhileMuted === false);
  checkEqual('re-enabled state', R.enableFlow.enabledAgain, true);
  checkEqual('unmuted storage', R.enableFlow.storedUnmuted, '0');
  checkEqual('toggleMuted off', R.enableFlow.toggle1, false);
  checkEqual('toggleMuted on', R.enableFlow.toggle2, true);
  check('stopAll', R.enableFlow.stopAll === true);

  checkEqual('volume persisted after reload', R.persistence.getVolume, 0.7);
  checkEqual('volume storage after reload', R.persistence.stored, '0.7');
  checkEqual('enabled persisted after reload', R.persistence.enabled, true);

  checkEqual('no-ctx init false', R.noContext.init, false);
  check('no-ctx play false', R.noContext.play === false);
  check('no-ctx playAt false', R.noContext.playAt === false);
  checkEqual('no-ctx setVolume', R.noContext.setVolume, 0.42);
  checkEqual('no-ctx getVolume', R.noContext.getVolume, 0.42);
  checkEqual('no-ctx getAmbient day', R.noContext.ambientDay, 'day');
  checkEqual('no-ctx getAmbient none', R.noContext.ambientNone, 'none');
  check('no-ctx throws empty', R.noContext.throws.length === 0);

  check('browser errors empty', errors.length === 0);
} catch (e) {
  problems.push('harness: ' + (e && e.stack ? e.stack : e));
} finally {
  // Chrome 155 在存在 AudioContext 时偶发 close 卡住：限时等待后强杀，避免测试进程挂死
  try {
    await Promise.race([
      browser.close().then(() => true, () => false),
      new Promise((r) => setTimeout(() => r(false), 4000))
    ]);
  } catch (e) { /* 忽略 */ }
  try {
    const proc = browser.process();
    if (proc) proc.kill('SIGKILL');
  } catch (e) { /* 忽略 */ }
}

const pass = problems.length === 0;
console.log(JSON.stringify({ pass, problems, errors, results: R }, null, 2));

// 兜底：若事件循环因浏览器残留句柄不退出，8s 后强制结束（unref 不影响正常退出）
setTimeout(() => process.exit(pass ? 0 : 1), 8000).unref();
process.exitCode = pass ? 0 : 1;