/* =========================================================
 *  game.js — 启动、渲染循环、输入、特效、存档、界面联动
 * =======================================================*/
(function () {
  'use strict';
  const B = MC.B, I = MC.I;
  const SAVE_KEY = 'mc_sandbox_save_v1';
  const SAVE_SLOT_KEYS = { 1: SAVE_KEY, 2: 'mc_sandbox_save_v1_slot2', 3: 'mc_sandbox_save_v1_slot3' };

  // ---------------- 特效 ----------------
  class Effects {
    constructor(game) {
      this.game = game;
      this.group = new THREE.Group();
      game.scene.add(this.group);
      this.pool = [];
      this.particles = [];
      const geo = new THREE.BoxGeometry(1, 1, 1);
      for (let i = 0; i < 90; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
        m.visible = false;
        m.frustumCulled = false;
        this.group.add(m);
        this.pool.push(m);
      }
      this.bolt = null;
      this.instances = 0;
      this.avgCache = new Map();
      this.lastSmoke = 0;
    }

    avgColor(blockId) {
      if (this.avgCache.has(blockId)) return this.avgCache.get(blockId);
      const def = MC.BLOCKS[blockId];
      let color = new THREE.Color(0x9a9a9a);
      if (def && def.tiles) {
        const tile = def.tiles.side !== undefined ? def.tiles.side : (def.tiles.all !== undefined ? def.tiles.all : def.tiles.top);
        const c = MC.tileCanvases[tile];
        if (c) {
          try {
            const ctx = c.getContext('2d');
            const data = ctx.getImageData(0, 0, 16, 16).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i + 3] < 40) continue;
              r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
            }
            if (n > 0) color.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
          } catch (e) { /* file:// 下没有跨域问题，忽略 */ }
        }
      }
      this.avgCache.set(blockId, color);
      return color;
    }

    spawn(x, y, z, color, count, speed, size, gravity, life) {
      for (let i = 0; i < count; i++) {
        const mesh = this.pool.find(m => !m.visible);
        if (!mesh) return;
        mesh.visible = true;
        mesh.position.set(x + (Math.random() - 0.5) * 0.7, y + Math.random() * 0.7, z + (Math.random() - 0.5) * 0.7);
        mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
        mesh.material.color.copy(color);
        mesh.material.opacity = 1;
        mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        this.particles.push({
          mesh,
          vx: (Math.random() - 0.5) * speed,
          vy: Math.random() * speed * 0.8 + 1,
          vz: (Math.random() - 0.5) * speed,
          life: life || 0.55 + Math.random() * 0.35,
          maxLife: life || 0.8,
          gravity: gravity === undefined ? 18 : gravity,
          rot: (Math.random() - 0.5) * 6
        });
      }
    }

    blockBreak(x, y, z, blockId) {
      this.spawn(x + 0.5, y + 0.4, z + 0.5, this.avgColor(blockId), 9, 4.5, 0.14, 16, 0.7);
    }
    hit(pos) {
      this.spawn(pos.x, pos.y + 0.9, pos.z, new THREE.Color(0xcc3333), 5, 3, 0.1, 10, 0.45);
    }
    poof(pos, hex) {
      this.spawn(pos.x, pos.y + 0.5, pos.z, new THREE.Color(hex || 0xdddddd), 10, 3.5, 0.16, 6, 0.9);
    }
    splash(x, y, z) {
      this.spawn(x + 0.5, y + 0.6, z + 0.5, new THREE.Color(0x76b8ee), 8, 3.2, 0.1, 12, 0.6);
    }
    growSparkle(x, y, z) {
      this.spawn(x + 0.5, y + 0.6, z + 0.5, new THREE.Color(0xb9e86a), 3, 1.2, 0.07, -1.5, 0.8);
    }
    smoke(pos) {
      const now = performance.now();
      if (now - this.lastSmoke < 180) return;
      this.lastSmoke = now;
      this.spawn(pos.x, pos.y + 1.4, pos.z, new THREE.Color(0x333333), 2, 1.1, 0.12, -1.2, 1.2);
    }
    flashBolt(x, y, z) {
      if (!this.boltMesh) {
        const geo = new THREE.BoxGeometry(0.22, 1, 0.22);
        const mat = new THREE.MeshBasicMaterial({ color: 0xfff8cc, transparent: true, opacity: 0.95, fog: false });
        this.boltMesh = new THREE.Mesh(geo, mat);
        this.boltMesh.frustumCulled = false;
        this.group.add(this.boltMesh);
      }
      this.boltMesh.visible = true;
      this.boltMesh.position.set(x + 0.5, y + 9, z + 0.5);
      this.boltMesh.scale.set(1, 18, 1);
      this.boltMesh.material.opacity = 1;
      this.boltLife = 0.28;
    }

    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
          this.particles.splice(i, 1);
          continue;
        }
        p.vy -= p.gravity * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.rot * dt;
        p.mesh.rotation.y += p.rot * dt;
        p.mesh.material.opacity = Math.min(1, p.life / 0.4);
      }
      if (this.boltMesh && this.boltMesh.visible) {
        this.boltLife -= dt;
        this.boltMesh.material.opacity = Math.max(0, this.boltLife / 0.28);
        if (this.boltLife <= 0) this.boltMesh.visible = false;
      }
    }
  }

  // ---------------- 手持物品（第一人称视图） ----------------
  class Hand {
    constructor(game) {
      this.game = game;
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = 64;
      this.ctx = this.canvas.getContext('2d');
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.magFilter = THREE.NearestFilter;
      this.tex.minFilter = THREE.NearestFilter;
      this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
      this.sprite = new THREE.Sprite(this.mat);
      this.sprite.scale.set(0.24, 0.24, 1);
      this.sprite.position.set(0.42, -0.30, -0.6);
      this.sprite.renderOrder = 1000;
      game.camera.add(this.sprite);
      game.scene.add(game.camera);
      this.item = -2;
      this.t = 0;
      this.loading = null;
    }

    refresh(item) {
      if (item === this.item) return;
      this.item = item;
      this.ctx.clearRect(0, 0, 64, 64);
      if (!item) { this.tex.needsUpdate = true; return; }
      const img = new Image();
      this.loading = img;
      img.onload = () => {
        if (this.item !== item) return;
        this.ctx.clearRect(0, 0, 64, 64);
        this.ctx.drawImage(img, 0, 0, 64, 64);
        this.tex.needsUpdate = true;
      };
      img.src = MC.icon(item);
    }

    update(dt, miningProgress) {
      const g = this.game;
      this.t += dt;
      const item = g.player.selectedItem();
      this.refresh(item);
      const t = this.t;
      let bx = Math.sin(t * 1.7) * 0.004;
      let by = Math.sin(t * 2.3) * 0.007;
      let rot = 0;
      if (g.player.sprinting) { bx += Math.sin(t * 11) * 0.012; by += Math.cos(t * 22) * 0.01; }
      if (miningProgress > 0) {
        const s = Math.sin(t * 34);
        bx += s * 0.035;
        by += Math.abs(s) * 0.045;
        rot = s * 0.16;
      }
      this.sprite.position.set(0.42 + bx, -0.30 + by, -0.6);
      this.mat.rotation = rot;
      this.sprite.visible = !!item && !g.player.dead;
    }
  }

  // ---------------- 游戏 ----------------
  class Game {
    constructor() {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x8fc4f0);
      this.scene.fog = new THREE.Fog(0x8fc4f0, 45, 95);
      this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);
      this.camera.rotation.order = 'YXZ';
      this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      this.pixelRatio = this.maxPixelRatio;
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resTimer = 0;
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.domElement.id = 'game-canvas';
      document.getElementById('game-root').appendChild(this.renderer.domElement);

      this.settings = this.loadSettings();
      this.sleeping = false;
      this.chests = new Map();
      this.furnaces = new Map();
      this.chestPos = null;
      this.furnacePos = null;
      this.stats = this.newStats();
      this.quests = new MC.QuestManager(this);
      this.saveSlot = 1;
      this.shakeTime = 0;
      this.cameraBob = 0;
      this.reputation = 50;
      this.godMode = false;
      this.paused = true;
      this.started = false;
      this.modal = null;
      this.keys = new Set();
      this.mouse = { left: false, right: false, leftPressed: false, rightPressed: false, middlePressed: false, dx: 0, dy: 0 };
      this.fps = 60;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
      this.lastTime = performance.now();
      this.autosaveTimer = 0;
      this.freeze = false;
      this.ui = null;
      this.world = null;
      this.player = null;
      this.entities = null;
      this.villagers = null;
      this.nature = null;
      this.effects = null;
      this.audio = this.wrapAudio();
      this.bindEvents();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
      this.setupStartScreen();
      this.setupWindowSize();
    }

    wrapAudio() {
      const a = MC.audio || {};
      const safe = (name, fallback) => (typeof a[name] === 'function' ? (...args) => { try { return a[name](...args); } catch (e) { return undefined; } } : fallback);
      return {
        init: safe('init', () => {}),
        play: safe('play', () => {}),
        setRain: safe('setRain', () => {}),
        setWind: safe('setWind', () => {}),
        setUnderwater: safe('setUnderwater', () => {}),
        stopAll: safe('stopAll', () => {}),
        setEnabled: safe('setEnabled', () => {}),
        toggleMuted: safe('toggleMuted', () => {}),
        setVolume: safe('setVolume', () => {}),
        getVolume: safe('getVolume', () => 0.8),
        setAmbient: safe('setAmbient', () => {}),
        playAt: safe('playAt', () => {}),
        get enabled() { return a.enabled !== false; }
      };
    }

    setupWindowSize() {
      window.addEventListener('resize', () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      });
    }

    // ---------------- 设置 ----------------
    loadSettings() {
      const def = { sensitivity: 0.0023, volume: 0.8, renderDist: 5, fov: 72, shadows: true, minimap: true };
      try {
        const raw = localStorage.getItem('mc_settings_v1');
        if (raw) {
          const d = JSON.parse(raw);
          for (const k of Object.keys(def)) {
            if (d[k] !== undefined && typeof d[k] === typeof def[k]) def[k] = d[k];
          }
        }
      } catch (e) { /* 忽略 */ }
      return def;
    }

    saveSettings() {
      try { localStorage.setItem('mc_settings_v1', JSON.stringify(this.settings)); } catch (e) { /* 忽略 */ }
    }

    applySettings() {
      const s = this.settings;
      try { this.audio.setVolume(s.volume); } catch (e) { /* 忽略 */ }
      if (this.world) this.world.setRenderDistance(s.renderDist);
      const map = document.getElementById('minimap');
      if (map) map.classList.toggle('hidden', !s.minimap);
      if (this.entities) {
        for (const e of this.entities.list) if (e.shadow) e.shadow.visible = s.shadows;
      }
      this.saveSettings();
    }

    syncSettingsUI() {
      const s = this.settings;
      const bind = (id, key, fmt, toVal) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = toVal(s[key]);
        const out = document.getElementById(id + '-val');
        if (out) out.textContent = fmt(s[key]);
      };
      bind('set-sensitivity', 'sensitivity', v => v.toFixed(4), v => v.toFixed(4));
      bind('set-volume', 'volume', v => Math.round(v * 100) + '%', v => v);
      bind('set-renderdist', 'renderDist', v => v + ' 区块', v => v);
      bind('set-fov', 'fov', v => v + '°', v => v);
      const sh = document.getElementById('set-shadows');
      if (sh) sh.checked = !!s.shadows;
      const mm = document.getElementById('set-minimap');
      if (mm) mm.checked = !!s.minimap;
    }

    openSettings() {
      document.getElementById('settings-screen').classList.remove('hidden');
      const pause = document.getElementById('pause-screen');
      if (pause) pause.classList.add('hidden');
      this.ui.modal = 'settings';
      this.releasePointer();
      this.syncSettingsUI();
    }

    closeSettings() {
      document.getElementById('settings-screen').classList.add('hidden');
      this.ui.modal = null;
      if (this.paused) {
        document.getElementById('pause-screen').classList.remove('hidden');
      } else {
        this.requestPointer();
      }
    }

    // ---------------- 睡觉 ----------------
    trySleep() {
      if (!this.started || this.sleeping) return;
      if (!this.nature.isNight() && this.nature.weather !== 'storm') {
        this.ui.toast('只有夜晚或雷雨时才能睡觉', 'warn');
        this.audio.play('villager_no', { volume: 0.35 });
        return;
      }
      const danger = this.entities.list.some(e => e.kind === 'zombie' && !e.dead && this.distanceToPlayer(e.pos) < 14);
      if (danger) {
        this.ui.toast('附近有怪物，无法入睡', 'warn');
        this.audio.play('villager_no', { volume: 0.35 });
        return;
      }
      this.sleeping = true;
      this.freeze = true;
      if (this.stats) this.stats.sleeps++;
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
      this.audio.play('sleep', { volume: 0.6 });
      const ov = document.getElementById('sleep-overlay');
      ov.classList.remove('hidden');
      requestAnimationFrame(() => ov.classList.add('show'));
      setTimeout(() => {
        // 直接睡到清晨，并让村民进入新的一天（补货/繁衍）
        this.nature.time = 0.03;
        this.nature.day += 1;
        this.nature.weather = 'clear';
        this.nature.weatherBlend = 0;
        this.nature.applySky(0.016);
        this.player.health = Math.min(this.player.maxHealth, this.player.health + 10);
        this.player.hunger = Math.max(1, this.player.hunger - 1);
        this.ui.setHealth(this.player.health, this.player.maxHealth);
        this.ui.setHunger(this.player.hunger, this.player.maxHunger);
        this.ui.setClock(this.nature.clockText, this.nature.isDaytime());
        setTimeout(() => {
          ov.classList.remove('show');
          setTimeout(() => {
            ov.classList.add('hidden');
            this.freeze = false;
            this.sleeping = false;
            this.ui.toast('早上好，第 ' + this.nature.day + ' 天', 'good');
          }, 900);
        }, 900);
      }, 1500);
    }

    saveKey(slot) { return SAVE_SLOT_KEYS[slot || this.saveSlot] || SAVE_KEY; }

    slotInfo(slot) {
      try {
        const raw = localStorage.getItem(this.saveKey(slot));
        if (!raw) return null;
        const d = JSON.parse(raw);
        return { day: d.nature ? d.nature.day : 1, time: d.nature ? d.nature.time : 0.06, savedAt: d.savedAt || 0, villagers: (d.villagers || []).length };
      } catch (e) { return null; }
    }

    buildSaveData() {
      return {
        version: 1,
        world: this.world.serialize(),
        player: this.player.serialize(),
        nature: { time: this.nature.time, day: this.nature.day, weather: this.nature.weather },
        chests: Array.from(this.chests.entries()),
        furnaces: Array.from(this.furnaces.entries()),
        stats: this.stats,
        quests: this.quests.serialize(),
        villagers: this.villagers.serialize(),
        reputation: this.reputation,
        settings: this.settings,
        sleeping: this.sleeping,
        savedAt: Date.now()
      };
    }

    exportSave() {
      if (!this.started) return;
      this.saveGame();
      const data = this.buildSaveData();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      const day = data.nature.day;
      a.href = URL.createObjectURL(blob);
      a.download = `方块世界-第${day}天-存档.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
      this.ui.toast('存档已导出为 JSON 文件', 'good');
    }

    async importSaveFile(file) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !data.world || !data.player) throw new Error('格式不对');
        document.getElementById('pause-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.add('hidden');
        this.paused = false;
        await this.loadFromData(data);
        this.ui.toast('存档导入成功', 'good');
      } catch (e) {
        this.ui.toast('导入失败：文件不是有效的存档', 'warn');
      }
    }

    // ---------------- 开始界面 ----------------
    renderSlots() {
      const wrap = document.getElementById('save-slots');
      if (!wrap) return;
      wrap.innerHTML = '';
      for (let i = 1; i <= 3; i++) {
        const info = this.slotInfo(i);
        const btn = document.createElement('button');
        btn.className = 'slot-card' + (i === this.saveSlot ? ' active' : '');
        let dateText = '';
        if (info && info.savedAt) {
          const d = new Date(info.savedAt);
          dateText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        btn.innerHTML = info
          ? `<b>存档 ${i}</b><small>第 ${info.day} 天 · ${dateText}<br>村民 ${info.villagers} 位</small>`
          : `<b>存档 ${i}</b><small class="slot-empty">空存档 · 点击选择</small>`;
        btn.addEventListener('click', () => {
          this.saveSlot = i;
          this.renderSlots();
          const cont = document.getElementById('btn-continue');
          if (cont) cont.classList.toggle('hidden', !this.slotInfo(i));
        });
        wrap.appendChild(btn);
      }
      const cont = document.getElementById('btn-continue');
      if (cont) cont.classList.toggle('hidden', !this.slotInfo(this.saveSlot));
    }

    setupStartScreen() {
      const start = document.getElementById('start-screen');
      const loading = document.getElementById('loading');
      const continueBtn = document.getElementById('btn-continue');
      this.renderSlots();

      document.getElementById('btn-start').addEventListener('click', async () => {
        this.audio.init();
        const seedInput = document.getElementById('seed-input').value.trim();
        let seed;
        if (seedInput) {
          if (/^\d+$/.test(seedInput)) seed = parseInt(seedInput, 10);
          else { seed = 0; for (const ch of seedInput) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; }
        } else seed = (Math.random() * 0xffffffff) >>> 0;
        start.classList.add('hidden');
        await this.startNew(seed);
      });
      continueBtn.addEventListener('click', async () => {
        this.audio.init();
        start.classList.add('hidden');
        await this.loadGame(this.saveSlot);
      });
      document.getElementById('seed-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-start').click();
      });
    }

    async startNew(seed) {
      this.showLoading('正在生成世界…', 0);
      await frame();
      this.buildWorld(seed, null);
      this.showLoading('正在堆叠方块…', 35);
      await frame();
      this.world.preload(this.player.pos, 2);
      this.showLoading('正在唤醒村民…', 65);
      await frame();
      this.world.preload(this.player.pos, 3);
      this.showLoading('正在点燃火把…', 90);
      await frame();
      this.finishStart();
      this.saveGame();
      this.renderSlots();
      this.ui.toast('已保存到存档 ' + this.saveSlot, 'good');
    }

    async loadGame(slot) {
      let data = null;
      try { data = JSON.parse(localStorage.getItem(this.saveKey(slot || this.saveSlot))); } catch (e) { data = null; }
      if (!data) { this.showLoading('存档损坏，开始新世界…', 50); await frame(); await this.startNew((Math.random() * 0xffffffff) >>> 0); return; }
      await this.loadFromData(data);
    }

    async loadFromData(data) {
      this.showLoading('正在读取存档…', 0);
      await frame();
      this.buildWorld(data.world.seed, data.world);
      this.showLoading('正在恢复世界…', 35);
      await frame();
      this.world.preload(this.player.pos, 2);
      this.showLoading('正在唤醒村民…', 70);
      await frame();
      this.world.preload(this.player.pos, 3);
      if (data.player) this.player.deserialize(data.player);
      if (data.nature) {
        this.nature.time = data.nature.time || 0.06;
        this.nature.day = data.nature.day || 1;
        this.nature.weather = data.nature.weather || 'clear';
        this.nature.weatherBlend = this.nature.weather === 'clear' ? 0 : 0.7;
        this.nature.applySky(0);
        this.ui.setWeather(this.nature.weatherLabel);
      }
      this.stats = data.stats || this.newStats();
      if (this.quests) this.quests.deserialize(data.quests || []);
      this.chests = new Map(data.chests || []);
      this.furnaces = new Map(data.furnaces || []);
      for (const [k, f] of this.furnaces) {
        if (f.burn > 0) {
          const pos = k.split(',').map(Number);
          this.updateFurnaceBlock(pos, true);
        }
      }
      this.reputation = data.reputation !== undefined ? data.reputation : 50;
      this.showLoading('正在整理背包…', 90);
      await frame();
      this.finishStart();
      this.ui.toast('欢迎回来，旅行者。', 'good');
    }

    showLoading(text, pct) {
      const loading = document.getElementById('loading');
      loading.classList.remove('hidden');
      document.getElementById('loading-text').textContent = text;
      document.getElementById('loading-fill').style.width = pct + '%';
    }

    finishStart() {
      document.getElementById('loading').style.opacity = '0';
      document.getElementById('loading').style.transition = 'opacity .4s';
      setTimeout(() => document.getElementById('loading').classList.add('hidden'), 420);
      document.getElementById('hud').classList.remove('hidden');
      this.started = true;
      this.paused = false;
      this.ui.refreshHotbar();
      this.ui.setHealth(this.player.health, 20);
      this.ui.setHunger(this.player.hunger, 20);
      this.ui.setWeather(this.nature.weatherLabel);
      try { this.audio.setVolume(this.settings.volume); } catch (e) { /* 忽略 */ }
      this.applySettings();
      this.requestPointer();
      const hint = document.getElementById('hint');
      setTimeout(() => { if (hint) hint.style.opacity = '0.15'; }, 20000);
    }

    buildWorld(seed, saved) {
      if (this.world) {
        this.world.dispose();
        this.entities.clearAll();
      }
      this.chests = new Map();
      this.furnaces = new Map();
      this.stats = this.newStats();
      if (this.quests) this.quests.reset();
      this.world = new MC.World(this.scene, seed, saved);
      this.village = this.world.village;
      this.player = new MC.Player(this);
      this.player.resetForSpawn(this.world.spawn);
      if (saved && saved.player) this.player.deserialize(saved.player);
      this.entities = new MC.EntityManager(this);
      this.villagers = new MC.VillagerManager(this);
      this.villagers.spawnInitial();
      this.nature = new MC.Nature(this);
      this.effects = new Effects(this);
      this.ui = new MC.UI(this);
      if (!this.hand) this.hand = new Hand(this);
      this.ui.setClock(this.nature.clockText, this.nature.isDaytime());
      this.reputation = 50;
      this.world.update(this.player.pos, { budget: 12 });
      this.applySettings();
    }

    // ---------------- 输入 ----------------
    bindEvents() {
      window.addEventListener('keydown', (e) => {
        if (!this.started) return;
        const code = e.code;
        // 禁止浏览器滚动等
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
        this.keys.add(code);
        if (e.repeat) return;
        if (code === 'Escape') {
          if (this.ui.modal === 'inventory' || this.ui.modal === 'trade' || this.ui.modal === 'chest' || this.ui.modal === 'furnace' || this.ui.modal === 'quests') this.closeModal();
          else if (this.ui.modal === 'help') this.closeModal(true);
          else if (this.ui.modal === 'settings') this.closeModal(true);
          else this.togglePause();
          return;
        }
        if (this.paused) return;
        if (this.ui.modal) {
          if (code === 'KeyE' && this.ui.modal === 'inventory') this.closeModal();
          return;
        }
        if (code.startsWith('Digit')) {
          const n = parseInt(code.slice(5), 10);
          if (n >= 1 && n <= 9) this.player.selectSlot(n - 1);
        }
        if (code === 'KeyJ' && !this.paused && !this.ui.modal && this.started) {
        this.openQuests();
        return;
      }
      if (code === 'Tab') {
          this.settings.minimap = !this.settings.minimap;
          this.applySettings();
          this.ui.toast(this.settings.minimap ? '小地图已开启' : '小地图已关闭', 'good');
        }
        if (code === 'KeyE') this.openInventory();
        else if (code === 'KeyH') this.openHelp();
        else if (code === 'F3') this.ui.toggleDebug();
        else if (code === 'KeyM') {
          this.audio.toggleMuted();
          this.ui.toast(this.audio.enabled ? '音效已开启' : '音效已静音', 'good');
        } else if (code === 'KeyF') {
          if (this.godMode) { this.player.flyMode = !this.player.flyMode; this.ui.toast(this.player.flyMode ? '飞行模式开启' : '飞行模式关闭', 'good'); }
        }
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

      const canvas = this.renderer.domElement;
      canvas.addEventListener('click', () => {
        if (this.started && !this.paused && !this.ui.modal && document.pointerLockElement !== canvas) {
          canvas.requestPointerLock();
        }
      });
      document.addEventListener('pointerlockchange', () => {
        const locked = document.pointerLockElement === canvas;
        if (!locked) {
          this.mouse.left = false;
          this.mouse.right = false;
          if (this._expectUnlock) {
            // 是我们主动释放（打开背包/交易等），不弹暂停菜单
            this._expectUnlock = false;
            return;
          }
          if (this.started && !this.paused && !this.ui.modal) this.togglePause();
        }
      });
      document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === canvas && !this.paused && !this.ui.modal) {
          this.mouse.dx += e.movementX || 0;
          this.mouse.dy += e.movementY || 0;
        }
      });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
        if (e.button === 1) { e.preventDefault(); this.mouse.middlePressed = true; }
        if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('wheel', (e) => {
        if (this.started && !this.paused && !this.ui.modal) {
          this.player.cycleSlot(e.deltaY > 0 ? 1 : -1);
        }
      }, { passive: true });

      // 界面按钮
      document.getElementById('btn-resume').addEventListener('click', () => this.togglePause());
      document.getElementById('btn-save').addEventListener('click', () => { this.saveGame(); this.ui.toast('世界已保存', 'good'); });
      document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());
      document.getElementById('btn-help').addEventListener('click', () => this.openHelp());
      const bindSetting = (id, key, parse, fmt) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
          const v = parse(el.value);
          this.settings[key] = v;
          const out = document.getElementById(id + '-val');
          if (out) out.textContent = fmt(v);
          this.applySettings();
        });
      };
      bindSetting('set-sensitivity', 'sensitivity', v => parseFloat(v), v => v.toFixed(4));
      bindSetting('set-volume', 'volume', v => parseFloat(v), v => Math.round(v * 100) + '%');
      bindSetting('set-renderdist', 'renderDist', v => parseInt(v, 10), v => v + ' 区块');
      bindSetting('set-fov', 'fov', v => parseInt(v, 10), v => v + '°');
      const sh = document.getElementById('set-shadows');
      if (sh) sh.addEventListener('change', () => { this.settings.shadows = sh.checked; this.applySettings(); });
      const mm = document.getElementById('set-minimap');
      if (mm) mm.addEventListener('change', () => { this.settings.minimap = mm.checked; this.applySettings(); });
      document.getElementById('btn-exit').addEventListener('click', () => {
        this.saveGame();
        location.reload();
      });
      document.getElementById('btn-export').addEventListener('click', () => this.exportSave());
      document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('import-file').click();
      });
      document.getElementById('import-file').addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (f) this.importSaveFile(f);
        ev.target.value = '';
      });
      document.getElementById('btn-respawn').addEventListener('click', () => this.respawn());
      document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-close');
          if (id === 'help-screen' || id === 'settings-screen') this.closeModal(true);
          else this.closeModal();
        });
      });
      window.addEventListener('beforeunload', () => { if (this.started) this.saveGame(); });
    }

    requestPointer() {
      if (document.pointerLockElement) return;
      try { this.renderer.domElement.requestPointerLock(); } catch (e) { /* 忽略 */ }
    }
    releasePointer() {
      if (document.pointerLockElement) {
        this._expectUnlock = true;
        document.exitPointerLock();
      }
    }

    // ---------------- 界面开关 ----------------
    openInventory() {
      this.ui.openInventory();
      this.modal = 'inventory';
      this.mouse.left = this.mouse.right = false;
    }
    openHelp() {
      document.getElementById('help-screen').classList.remove('hidden');
      this.ui.modal = this.ui.modal || 'help';
      this.releasePointer();
    }
    closeModal(backToPause) {
      if (this.ui.modal === 'inventory') this.ui.closeInventory();
      else if (this.ui.modal === 'trade') this.ui.closeTrade();
      else if (this.ui.modal === 'help') {
        document.getElementById('help-screen').classList.add('hidden');
        this.ui.modal = null;
      } else if (this.ui.modal === 'settings') {
        document.getElementById('settings-screen').classList.add('hidden');
        this.ui.modal = null;
      } else if (this.ui.modal === 'chest') {
        this.ui.closeChest();
      } else if (this.ui.modal === 'furnace') {
        this.ui.closeFurnace();
      } else if (this.ui.modal === 'quests') {
        this.ui.closeQuests();
      }
      this.modal = null;
      if (this.paused) {
        document.getElementById('pause-screen').classList.remove('hidden');
      } else {
        this.requestPointer();
      }
    }
    togglePause() {
      if (!this.started) return;
      this.paused = !this.paused;
      document.getElementById('pause-screen').classList.toggle('hidden', !this.paused);
      if (this.paused) {
        this.releasePointer();
        this.keys.clear();
      } else {
        document.getElementById('help-screen').classList.add('hidden');
        this.ui.modal = null;
        this.requestPointer();
      }
    }

    newStats() {
      return { mined: {}, crafted: 0, trades: 0, zombieKills: 0, sleeps: 0 };
    }

    // ---------------- 好感度 ----------------
    repInfo() {
      const r = this.reputation;
      if (r >= 90) return { label: '挚友', discount: 2, bonus: true };
      if (r >= 70) return { label: '信赖', discount: 1, bonus: false };
      if (r >= 40) return { label: '友好', discount: 0, bonus: false };
      if (r >= 20) return { label: '普通', discount: 0, bonus: false };
      return { label: '警惕', discount: 0, penalty: 1, bonus: false };
    }

    tradeGiveCount(t) {
      const info = this.repInfo();
      return Math.max(1, t.give.count + (info.penalty || 0) - (info.discount || 0));
    }

    // ---------------- 箱子 / 熔炉 ----------------
    posKey(p) { return p.x + ',' + p.y + ',' + p.z; }

    onBlockPlaced(id, x, y, z) {
      const k = x + ',' + y + ',' + z;
      if (id === MC.B.CHEST && !this.chests.has(k)) {
        this.chests.set(k, new Array(27).fill(null));
      }
      if (id === MC.B.FURNACE && !this.furnaces.has(k)) {
        this.furnaces.set(k, { input: null, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 });
      }
    }

    openChest(t) {
      const k = this.posKey(t);
      if (!this.chests.has(k)) this.chests.set(k, new Array(27).fill(null));
      this.chestPos = { x: t.x, y: t.y, z: t.z };
      this.ui.openChest(k);
      this.modal = 'chest';
      this.ui.modal = 'chest';
      this.mouse.left = this.mouse.right = false;
      this.keys.clear();
      this.releasePointer();
      this.audio.play('chest_open', { volume: 0.5 });
    }

    openFurnace(t) {
      const k = this.posKey(t);
      if (!this.furnaces.has(k)) this.furnaces.set(k, { input: null, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 });
      this.furnacePos = { x: t.x, y: t.y, z: t.z };
      this.ui.openFurnace(k);
      this.modal = 'furnace';
      this.ui.modal = 'furnace';
      this.mouse.left = this.mouse.right = false;
      this.keys.clear();
      this.releasePointer();
      this.audio.play('chest_open', { volume: 0.45, pitch: 0.8 });
    }

    spillChest(t) {
      const k = this.posKey(t);
      const arr = this.chests.get(k);
      if (arr) {
        let count = 0;
        for (const slot of arr) {
          if (slot) { this.player.addItem(slot.id, slot.count); count += slot.count; }
        }
        this.chests.delete(k);
        if (count > 0) this.ui.toast('箱子里的物品已放回背包', 'good');
      }
    }

    spillFurnace(t) {
      const k = this.posKey(t);
      const f = this.furnaces.get(k);
      if (!f) return;
      let count = 0;
      for (const slot of [f.input, f.fuel, f.output]) {
        if (slot) { this.player.addItem(slot.id, slot.count); count += slot.count; }
      }
      this.furnaces.delete(k);
      if (count > 0) this.ui.toast('熔炉里的物品已放回背包', 'good');
    }

    updateFurnaceBlock(pos, lit) {
      const w = this.world;
      const id = w.getBlock(pos[0], pos[1], pos[2]);
      if (id === MC.B.FURNACE || id === MC.B.FURNACE_LIT) {
        const want = lit ? MC.B.FURNACE_LIT : MC.B.FURNACE;
        if (id !== want) w.setBlock(pos[0], pos[1], pos[2], want, false);
      }
    }

    updateFurnaces(dt) {
      if (!this.furnaces.size) return;
      for (const [key, f] of this.furnaces) {
        const pos = key.split(',').map(Number);
        const smelt = f.input ? MC.smeltOf(f.input.id) : null;
        const room = smelt && (!f.output || (f.output.id === smelt.out && f.output.count < 64));
        if (f.burn <= 0 && room && f.fuel) {
          const fuelTime = MC.fuelOf(f.fuel.id);
          if (fuelTime > 0) {
            f.burn = fuelTime;
            f.burnMax = fuelTime;
            f.fuel.count--;
            if (f.fuel.count <= 0) f.fuel = null;
            this.updateFurnaceBlock(pos, true);
          }
        }
        if (f.burn > 0) {
          f.burn = Math.max(0, f.burn - dt);
          if (room) {
            f.progress += dt;
            if (f.progress >= smelt.time) {
              f.progress = 0;
              f.input.count--;
              if (f.input.count <= 0) f.input = null;
              if (f.output) f.output.count++;
              else f.output = { id: smelt.out, count: 1 };
              this.audio.play('furnace', { volume: 0.25 });
            }
          } else {
            f.progress = 0;
          }
          if (f.burn <= 0) {
            f.burn = 0;
            this.updateFurnaceBlock(pos, false);
          }
        } else {
          f.progress = 0;
        }
      }
    }

    // ---------------- 玩家交互 ----------------
    getTargetEntity(maxDist) {
      const eye = this.player.getEyePos();
      const dir = this.player.getLookDir();
      return this.entities.pick(eye, dir, maxDist || 3.6, e => e.kind !== 'zombie' || true);
    }

    handleInteraction(dt) {
      const player = this.player;
      const entity = this.getTargetEntity(3.6);
      this.targetEntity = entity;

      // 中键：取方块到快捷栏
      if (this.mouse.middlePressed) {
        this.mouse.middlePressed = false;
        player.pickBlock();
      }
      // 左键：攻击实体（否则交给挖掘）
      if (this.mouse.leftPressed) {
        this.mouse.leftPressed = false;
        if (entity) player.attack(entity, this);
      }
      // 右键：交易 / 使用
      if (this.mouse.rightPressed) {
        this.mouse.rightPressed = false;
        if (entity && entity.isVillager) {
          const dist = player.pos.distanceTo(entity.pos);
          if (dist < 4.2) { this.openTrade(entity); return; }
        }
        if (entity && entity.isAnimal) { player.feedAnimal(entity); return; }
        player.useHeld({ mouseRight: true });
      }
      // 挖掘（有实体目标时不挖方块）
      const miningInput = {
        keys: this.keys,
        mouseLeft: this.mouse.left && !entity,
        dx: 0, dy: 0
      };
      player.updateMining(dt, miningInput);
    }

    openQuests() {
      this.ui.openQuests();
      this.modal = 'quests';
      this.ui.modal = 'quests';
      this.mouse.left = this.mouse.right = false;
      this.keys.clear();
      this.releasePointer();
      this.audio.play('click', { volume: 0.3 });
    }

    openTrade(villager) {
      this.ui.openTrade(villager);
      this.modal = 'trade';
      this.mouse.left = this.mouse.right = false;
      this.keys.clear();
    }

    // ---------------- 保存 / 死亡 ----------------
    saveGame() {
      if (!this.started || !this.world) return;
      try {
        const data = {
          version: 1,
          world: this.world.serialize(),
          player: this.player.serialize(),
          nature: { time: this.nature.time, day: this.nature.day, weather: this.nature.weather },
          chests: Array.from(this.chests.entries()),
          furnaces: Array.from(this.furnaces.entries()),
          stats: this.stats,
          quests: this.quests.serialize(),
          villagers: this.villagers.serialize(),
          reputation: this.reputation,
        settings: this.settings,
        sleeping: this.sleeping,
          savedAt: Date.now()
        };
        localStorage.setItem(this.saveKey(), JSON.stringify(data));
      } catch (e) {
        console.warn('保存失败', e);
      }
    }

    onPlayerDeath(reason) {
      this.audio.play('hurt', { volume: 0.7 });
      this.ui.showDeath(reason || '未知原因');
      this.releasePointer();
    }

    respawn() {
      this.ui.hideDeath();
      this.player.resetForSpawn(this.world.spawn);
      this.player.hunger = 20;
      this.player.items = new Map();
      this.player.hotbar = new Array(9).fill(0);
      this.player.giveStartingItems();
      this.ui.refreshHotbar();
      this.paused = false;
      this.keys.clear();
      this.requestPointer();
      this.ui.toast('你在村庄里醒了过来。', 'good');
    }

    // ---------------- 主循环 ----------------
    loop(now) {
      requestAnimationFrame(this.loop);
      const dtRaw = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(0.05, Math.max(0, dtRaw));
      this._fpsAccum += dtRaw; this._fpsFrames++;
      if (this._fpsAccum > 0.5) {
        this.fps = this._fpsFrames / this._fpsAccum;
        this._fpsAccum = 0; this._fpsFrames = 0;
      }
      if (!this.started || !this.world) { return; }
      if (this.paused) {
        this.renderer.render(this.scene, this.camera);
        return;
      }
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    }

    update(dt) {
      const player = this.player;
      const uiOpen = !!this.ui.modal;
      // 输入传给玩家
      let keys = uiOpen ? new Set() : this.keys;
      let lookX = uiOpen ? 0 : this.mouse.dx;
      let lookY = uiOpen ? 0 : this.mouse.dy;
      const tc = this.touch;
      if (!uiOpen && tc && tc.active) {
        keys = new Set(this.keys);
        if (tc.y < -0.28) keys.add('KeyW');
        if (tc.y > 0.28) keys.add('KeyS');
        if (tc.x < -0.28) keys.add('KeyA');
        if (tc.x > 0.28) keys.add('KeyD');
        if (Math.hypot(tc.x, tc.y) > 0.92) keys.add('ShiftLeft');
        lookX += tc.lookX;
        lookY += tc.lookY;
        tc.lookX = 0; tc.lookY = 0;
      }
      const input = {
        keys: keys,
        dx: lookX,
        dy: lookY,
        mouseLeft: false,
        mouseRight: false
      };
      this.mouse.dx = 0; this.mouse.dy = 0;
      if (!this.freeze) {
        player.update(dt, input);
        if (!uiOpen && !player.dead) this.handleInteraction(dt);
      }

      this.world.update(player.pos, { budget: 10 });
      this.entities.update(dt);
      this.villagers.update(dt);
      this.nature.update(dt);
      this.updateFurnaces(dt);
      this.quests.update(dt);
      this.effects.update(dt);
      if (this.hand) this.hand.update(dt, player.mining ? player.mining.progress / player.mining.total : 0);

      // 相机
      player.updateCamera(this.camera);
      if (this.shakeTime > 0) {
        this.shakeTime -= dt;
        const s = Math.min(1, this.shakeTime * 4) * 0.12;
        this.camera.position.x += (Math.random() - 0.5) * s;
        this.camera.position.y += (Math.random() - 0.5) * s;
      }
      // 水下
      this.audio.setUnderwater(player.headInWater);
      this.updateAmbient(dt);
      this.updateResolution(dt);
      // 界面
      this.ui.update(dt, this.camera);
      // 自动保存
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 120) { this.autosaveTimer = 0; this.saveGame(); }
    }

    // ---------------- 声音（环境 + 方位） ----------------
    updateAmbient(dt) {
      this.ambientTimer = (this.ambientTimer || 0) - dt;
      if (this.ambientTimer > 0) return;
      this.ambientTimer = 1.2;
      if (!this.audio || !this.audio.setAmbient) return;
      const p = this.player;
      let mode = 'day';
      if (this.nature.weather !== 'clear') mode = 'rain';
      else if (this.nature.isNight()) mode = 'night';
      const surf = this.world.surfaceY(Math.floor(p.pos.x), Math.floor(p.pos.z));
      if (p.pos.y < surf - 3 && !p.headInWater) mode = 'cave';
      this.audio.setAmbient(mode);
    }

    playAt(name, pos, opts) {
      if (!pos) return false;
      const listener = { pos: { x: this.player.pos.x, y: this.player.pos.y + 1.4, z: this.player.pos.z }, yaw: this.player.yaw };
      if (this.audio && this.audio.playAt) {
        return this.audio.playAt(name, { x: pos.x, y: pos.y, z: pos.z }, listener, opts);
      }
      this.audio.play((opts && opts.fallback) || name, { volume: 0.35 });
      return true;
    }

    updateResolution(dt) {
      this.resTimer = (this.resTimer || 0) + dt;
      if (this.resTimer < 2.2) return;
      this.resTimer = 0;
      let next = this.pixelRatio;
      if (this.fps < 26 && next > 0.7) next = Math.max(0.7, next - 0.15);
      else if (this.fps > 52 && next < this.maxPixelRatio) next = Math.min(this.maxPixelRatio, next + 0.1);
      if (Math.abs(next - this.pixelRatio) > 0.001) {
        this.pixelRatio = next;
        this.renderer.setPixelRatio(next);
      }
    }

    distanceToPlayer(pos) {
      if (!this.player) return 0;
      return Math.hypot(pos.x - this.player.pos.x, pos.y - this.player.pos.y, pos.z - this.player.pos.z);
    }

    // ---------------- 测试接口 ----------------
    debugState() {
      if (!this.started) return { started: false };
      return {
        started: true,
        pos: this.player.pos.toArray(),
        health: this.player.health,
        hunger: this.player.hunger,
        time: this.nature.time,
        hour: this.nature.hour,
        day: this.nature.day,
        weather: this.nature.weather,
        chunks: this.world.chunks.size,
        villagers: this.villagers.list.length,
        entities: this.entities.list.length,
        fps: this.fps,
        reputation: this.reputation,
        settings: this.settings,
        sleeping: this.sleeping,
        inventory: Array.from(this.player.items.entries())
      };
    }
  }

  function frame() { return new Promise(r => setTimeout(r, 20)); }

  window.addEventListener('load', () => {
    window.__game = new Game();
    window.__MC_READY = true;
  });
})();