/* =========================================================
 *  nature.js — 自然规则：昼夜、天气、云、雨、作物、树木、火焰、水流、生物刷新
 * =======================================================*/
(function () {
  'use strict';
  const B = MC.B;
  const DAY_LENGTH = 720;   // 一整天 12 分钟
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Nature {
    constructor(game) {
      this.game = game;
      this.time = 0.06;         // 0=日出 0.25=正午 0.5=日落 0.75=午夜
      this.day = 1;
      this.weather = 'clear';
      this.weatherTimer = 150 + Math.random() * 120;
      this.weatherBlend = 0;    // 0 晴 → 1 雨
      this.lightningTimer = 0;
      this.flash = 0;
      this.fireTimers = new Map();
      this.rain = null;
      this.sky = { sunElev: 0 };
      this.tickTimer = 0;
      this.zombieTimer = 0;
      this.animalTimer = 0;
      this.torchLights = [];
      this.torchTimer = 0;
      this._tmpColorA = new THREE.Color();
      this._tmpColorB = new THREE.Color();
      this.buildSky();
      this.setupLights();
      this.buildRain();
      this.setupTorchLights();
      this.applySky(0);
    }

    // ---------------- 天空对象 ----------------
    buildSky() {
      const scene = this.game.scene;
      // 星星
      const starGeo = new THREE.BufferGeometry();
      const sp = [];
      for (let i = 0; i < 900; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 0.98);
        const r = 360;
        sp.push(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(theta) * r);
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      this.starMat = new THREE.PointsMaterial({
        map: MC.env.star, size: 3.2, transparent: true, opacity: 0,
        depthWrite: false, fog: false, color: 0xffffff, sizeAttenuation: true
      });
      this.stars = new THREE.Points(starGeo, this.starMat);
      this.stars.frustumCulled = false;
      scene.add(this.stars);

      // 太阳 / 月亮
      const sunMat = new THREE.SpriteMaterial({ map: MC.env.sun, transparent: true, depthWrite: false, fog: false, color: 0xffffff });
      this.sun = new THREE.Sprite(sunMat);
      this.sun.scale.set(42, 42, 1);
      scene.add(this.sun);
      const moonMat = new THREE.SpriteMaterial({ map: MC.env.moon, transparent: true, depthWrite: false, fog: false });
      this.moon = new THREE.Sprite(moonMat);
      this.moon.scale.set(26, 26, 1);
      scene.add(this.moon);

      // 云层
      const cloudTex = MC.env.cloud;
      cloudTex.repeat.set(5, 5);
      const cloudMat = new THREE.MeshBasicMaterial({
        map: cloudTex, transparent: true, opacity: 0.55,
        depthWrite: false, fog: false, side: THREE.DoubleSide
      });
      this.cloudMat = cloudMat;
      this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), cloudMat);
      this.clouds.rotation.x = -Math.PI / 2;
      this.clouds.position.y = 96;
      scene.add(this.clouds);
    }

    setupLights() {
      const scene = this.game.scene;
      this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6b46, 0.75);
      scene.add(this.hemi);
      this.sunLight = new THREE.DirectionalLight(0xfff0c8, 1.0);
      this.sunLight.position.set(60, 100, 30);
      scene.add(this.sunLight);
      this.moonLight = new THREE.DirectionalLight(0x9fb8ff, 0.18);
      this.moonLight.position.set(-60, 80, -30);
      scene.add(this.moonLight);
    }

    // ---------------- 雨 ----------------
    buildRain() {
      this.rainCount = 1100;
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(this.rainCount * 6);
      for (let i = 0; i < this.rainCount; i++) {
        const x = (Math.random() - 0.5) * 46;
        const y = Math.random() * 26;
        const z = (Math.random() - 0.5) * 46;
        const len = 0.55 + Math.random() * 0.6;
        arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x + 0.04; arr[i * 6 + 4] = y + len; arr[i * 6 + 5] = z;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      this.rainMat = new THREE.LineBasicMaterial({
        color: 0x9fc4ee, transparent: true, opacity: 0, depthWrite: false, fog: false
      });
      this.rain = new THREE.LineSegments(geo, this.rainMat);
      this.rain.frustumCulled = false;
      this.game.scene.add(this.rain);
      this.rainGeo = geo;
    }

    // ---------------- 火把点光源池 ----------------
    setupTorchLights() {
      for (let i = 0; i < 5; i++) {
        const l = new THREE.PointLight(0xffb45a, 0, 12, 2);
        this.game.scene.add(l);
        this.torchLights.push(l);
      }
    }

    // ---------------- 时间 ----------------
    get hour() { return ((this.time * 24 + 6) % 24); }
    isDaytime() { return this.hour >= 6 && this.hour < 18; }
    isNight() { return this.hour >= 18 || this.hour < 6; }
    get clockText() {
      const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
      return '第 ' + this.day + ' 天 ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    get weatherLabel() {
      return this.weather === 'clear' ? '晴朗' : this.weather === 'rain' ? '下雨' : '雷雨';
    }

    update(dt) {
      // 时间推进（日出时换天）
      const before = this.time;
      this.time = (this.time + dt / DAY_LENGTH) % 1;
      if (this.time < before) {
        this.day += 1;
        this.onNewDay();
      }

      // 天气变化
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        this.weatherTimer = 140 + Math.random() * 180;
        const r = Math.random();
        if (this.weather === 'clear') this.weather = r < 0.55 ? 'rain' : r < 0.8 ? 'storm' : 'clear';
        else if (this.weather === 'rain') this.weather = r < 0.5 ? 'storm' : 'clear';
        else this.weather = r < 0.6 ? 'rain' : 'clear';
        this.game.audio.setRain(this.weather !== 'clear');
        this.game.ui.setWeather(this.weatherLabel);
        if (this.weather === 'storm') this.game.ui.toast('雷雨来了，小心被雷劈中的树。', 'warn');
        else if (this.weather === 'rain') this.game.ui.toast('下雨了。', 'good');
      }
      const targetWet = this.weather === 'clear' ? 0 : this.weather === 'rain' ? 0.55 : 1;
      this.weatherBlend += (targetWet - this.weatherBlend) * Math.min(1, dt * 0.25);

      // 闪电
      if (this.weather === 'storm') {
        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0) {
          this.lightningTimer = 5 + Math.random() * 14;
          this.strikeLightning();
        }
      }
      this.flash = Math.max(0, this.flash - dt * 2.2);

      this.applySky(dt);
      this.updateRain(dt);
      this.updateClouds(dt);
      this.updateTorchLights(dt);
      this.randomTicks(dt);
      this.spawnCreatures(dt);
      this.updateFire(dt);
      this.game.ui.setClock(this.clockText, this.isDaytime());
    }

    onNewDay() {
      this.game.ui.toast('第 ' + this.day + ' 天开始了。', 'good');
      this.game.ui.setWeather(this.weatherLabel);
      // 重置火焰计时
      this.fireTimers.clear();
    }

    // ---------------- 天空颜色 ----------------
    applySky(dt) {
      const elev = Math.sin(this.time * Math.PI * 2);
      this.sky.sunElev = elev;
      const wet = this.weatherBlend;
      const scene = this.game.scene;

      // 基色
      let dayColor, nightColor;
      if (elev > 0.2) {
        dayColor = new THREE.Color(0x7fb6e8);
        nightColor = new THREE.Color(0x0a1020);
      } else if (elev > 0) {
        dayColor = new THREE.Color(0x9fc6e8);
        nightColor = new THREE.Color(0x1a2740);
      } else {
        dayColor = new THREE.Color(0x7fb6e8);
        nightColor = new THREE.Color(0x0b1424);
      }
      const dayBlend = clamp((elev + 0.25) / 0.55, 0, 1);
      const sky = nightColor.clone().lerp(dayColor, dayBlend);
      // 日出日落暖色
      const sunsetAmt = clamp(1 - Math.abs(elev) / 0.25, 0, 1) * (elev > -0.35 ? 1 : 0);
      sky.lerp(new THREE.Color(0xe8975e), sunsetAmt * 0.55);
      // 雨天灰暗
      sky.lerp(new THREE.Color(0x4a5560), wet * 0.6);
      // 闪电
      if (this.flash > 0) sky.lerp(new THREE.Color(0xdfe8ff), this.flash * 0.7);

      scene.background.copy(sky);
      if (scene.fog) {
        scene.fog.color.copy(sky);
        const baseFar = this.game.world.renderDist * 16 + 10;
        scene.fog.far = baseFar - wet * 22;
        scene.fog.near = Math.max(18, baseFar * 0.55 - wet * 10);
      }

      // 光照强度
      const dayLight = clamp(elev * 1.7 + 0.18, 0.06, 1.05);
      const sunI = dayLight * (1 - wet * 0.72) + this.flash * 0.6;
      this.sunLight.intensity = sunI;
      this.sunLight.color.setHex(elev > 0.3 ? 0xfff4d6 : 0xffbe82);
      this.moonLight.intensity = clamp(-elev * 0.6, 0, 0.28) * (1 - wet * 0.7);
      this.hemi.intensity = 0.18 + dayLight * 0.62 * (1 - wet * 0.35);
      this.hemi.color.setHex(elev > 0 ? 0xcfe8ff : 0x2a3a5a);

      // 太阳/月亮位置（相对相机）
      const cam = this.game.camera.position;
      const sunDir = new THREE.Vector3(Math.cos(this.time * Math.PI * 2), Math.sin(this.time * Math.PI * 2), 0.35).normalize();
      this.sun.position.set(cam.x + sunDir.x * 260, cam.y + sunDir.y * 260, cam.z + sunDir.z * 260);
      this.sun.material.opacity = clamp(elev * 2 + 0.4, 0, 1) * (1 - wet * 0.9);
      this.moon.position.set(cam.x - sunDir.x * 260, cam.y - sunDir.y * 260, cam.z - sunDir.z * 260);
      this.moon.material.opacity = clamp(-elev * 2 + 0.2, 0, 1) * (1 - wet * 0.95);

      // 星星
      this.starMat.opacity = clamp(-elev * 2.2, 0, 1) * (1 - wet) * 0.95;
      this.stars.position.set(cam.x, cam.y, cam.z);

      // 云
      this.cloudMat.opacity = 0.42 + wet * 0.4;
      this.cloudMat.color.setHex(0xffffff).lerp(new THREE.Color(0x5d6873), wet * 0.85);
      this.clouds.position.x = Math.round(cam.x / 8) * 8;
      this.clouds.position.z = Math.round(cam.z / 8) * 8;
    }

    updateClouds(dt) {
      MC.env.cloud.offset.x += dt * 0.0016;
      MC.env.cloud.offset.y += dt * 0.0006;
    }

    updateRain(dt) {
      const visible = this.weatherBlend > 0.02;
      this.rain.visible = visible;
      this.rainMat.opacity = this.weatherBlend * 0.75;
      if (!visible) return;
      const cam = this.game.camera.position;
      this.rain.position.set(Math.round(cam.x), Math.round(cam.y), Math.round(cam.z));
      const pos = this.rainGeo.attributes.position.array;
      const speed = (this.weather === 'storm' ? 42 : 30) * dt;
      for (let i = 0; i < this.rainCount; i++) {
        const base = i * 6;
        pos[base + 1] -= speed;
        pos[base + 4] -= speed;
        if (pos[base + 1] < -14) {
          const nx = (Math.random() - 0.5) * 46;
          const nz = (Math.random() - 0.5) * 46;
          const len = 0.5 + Math.random() * 0.7;
          pos[base] = nx; pos[base + 1] = 14 + Math.random() * 10; pos[base + 2] = nz;
          pos[base + 3] = nx + 0.04; pos[base + 4] = pos[base + 1] + len; pos[base + 5] = nz;
        }
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }

    strikeLightning() {
      const cam = this.game.camera.position;
      const ang = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 26;
      const x = Math.floor(cam.x + Math.cos(ang) * dist);
      const z = Math.floor(cam.z + Math.sin(ang) * dist);
      const y = this.game.world.surfaceY(x, z);
      const above = this.game.world.getBlock(x, y + 1, z);
      const ground = this.game.world.getBlock(x, y, z);
      this.flash = 1;
      this.game.audio.play('thunder', { volume: 0.7 });
      if (above === B.AIR && (ground === B.GRASS || ground === B.DIRT || ground === B.SAND || ground === B.STONE)) {
        if (Math.random() < 0.55) {
          this.game.world.setBlock(x, y + 1, z, B.FIRE);
          this.fireTimers.set(x + ',' + (y + 1) + ',' + z, 10 + Math.random() * 10);
          this.game.effects.flashBolt(x, y + 1, z);
        }
      } else if (MC.isPlant(above)) {
        this.game.world.setBlock(x, y, z, B.AIR);
        this.game.world.setBlock(x, y + 1, z, B.FIRE);
        this.fireTimers.set(x + ',' + (y + 1) + ',' + z, 8);
      }
      this.game.effects.flashBolt(x, y + 1, z);
    }

    // ---------------- 火把光照 ----------------
    updateTorchLights(dt) {
      this.torchTimer -= dt;
      if (this.torchTimer > 0) return;
      this.torchTimer = 0.35;
      const player = this.game.player.pos;
      const near = [];
      for (const key of this.game.world.torches) {
        const parts = key.split(',');
        const x = +parts[0], y = +parts[1], z = +parts[2];
        const d = (x - player.x) ** 2 + (y - player.y) ** 2 + (z - player.z) ** 2;
        if (d < 26 * 26) near.push({ x, y, z, d });
      }
      near.sort((a, b) => a.d - b.d);
      for (let i = 0; i < this.torchLights.length; i++) {
        const l = this.torchLights[i];
        const t = near[i];
        if (t) {
          l.position.set(t.x + 0.5, t.y + 0.6, t.z + 0.5);
          l.intensity = 5.5;
        } else l.intensity = 0;
      }
    }

    // ---------------- 随机方块刻 ----------------
    randomTicks(dt) {
      this.tickTimer -= dt;
      if (this.tickTimer > 0) return;
      this.tickTimer = 0.35;
      const world = this.game.world;
      const p = this.game.player.pos;
      const radius = 26;
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(p.x + (Math.random() - 0.5) * radius * 2);
        const z = Math.floor(p.z + (Math.random() - 0.5) * radius * 2);
        const c = world.getChunk(x >> 4, z >> 4);
        if (!c || !c.generated) continue;
        // 在相机附近取高度附近的方块
        const y = Math.floor(p.y + (Math.random() - 0.5) * 14);
        if (y < 2 || y >= MC.WORLD_CONST.HEIGHT) continue;
        const id = world.getBlock(x, y, z);
        this.tickBlock(world, x, y, z, id);
        // 地表附近也检查一次
        if (Math.random() < 0.35) {
          const sy = world.surfaceY(x, z);
          for (let dy = 0; dy <= 1; dy++) {
            this.tickBlock(world, x, sy + dy, z, world.getBlock(x, sy + dy, z));
          }
        }
      }
    }

    tickBlock(world, x, y, z, id) {
      if (MC.isCrop(id)) {
        if (id < B.WHEAT3) {
          const below = world.getBlock(x, y - 1, z);
          const wet = below === B.FARMLAND_WET || below === B.FARMLAND;
          if (!wet) { world.setBlock(x, y, z, B.AIR); return; }
          const bonus = below === B.FARMLAND_WET ? 2.2 : 1;
          const light = this.isDaytime() || this.nearTorch(x, y, z);
          if (light && Math.random() < 0.10 * bonus * (1 + this.weatherBlend * 0.7)) {
            world.setBlock(x, y, z, id + 1, false);
            if (Math.random() < 0.25) this.game.effects.growSparkle(x, y, z);
          }
        }
        return;
      }
      if (id === B.SAPLING) {
        if (Math.random() < 0.055 && this.spaceForTree(world, x, y, z)) {
          this.growTree(world, x, y, z);
        }
        return;
      }
      if (id === B.GRASS) {
        // 草地蔓延 / 退化
        const above = world.getBlock(x, y + 1, z);
        if (MC.isSolid(above)) { world.setBlock(x, y, z, B.DIRT); return; }
        if (Math.random() < 0.12) {
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          const d = dirs[(Math.random() * 4) | 0];
          const nx = x + d[0], nz = z + d[1];
          if (world.getBlock(nx, y, nz) === B.DIRT && world.getBlock(nx, y + 1, nz) === B.AIR) {
            world.setBlock(nx, y, nz, B.GRASS, false);
          }
        }
        return;
      }
      if (id === B.DIRT) {
        const above = world.getBlock(x, y + 1, z);
        if (above === B.AIR && this.isDaytime() && Math.random() < 0.015) {
          // 靠近草才蔓延
          let nearGrass = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (world.getBlock(x + dx, y, z + dz) === B.GRASS) { nearGrass = true; break; }
          }
          if (nearGrass) world.setBlock(x, y, z, B.GRASS, false);
        }
        return;
      }
      if (id === B.FARMLAND || id === B.FARMLAND_WET) {
        let water = false;
        for (let dx = -4; dx <= 4 && !water; dx++) {
          for (let dz = -4; dz <= 4 && !water; dz++) {
            for (let dy = 0; dy <= 1; dy++) {
              if (world.getBlock(x + dx, y + dy, z + dz) === B.WATER) { water = true; break; }
            }
          }
        }
        if (water && id === B.FARMLAND) world.setBlock(x, y, z, B.FARMLAND_WET, false);
        else if (!water && id === B.FARMLAND_WET && Math.random() < 0.3) world.setBlock(x, y, z, B.FARMLAND, false);
        return;
      }
      if (id === B.TALL_GRASS) {
        const below = world.getBlock(x, y - 1, z);
        if (below !== B.GRASS && below !== B.DIRT) { world.setBlock(x, y, z, B.AIR); return; }
        if (Math.random() < 0.02) {
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          const d = dirs[(Math.random() * 4) | 0];
          if (world.getBlock(x + d[0], y, z + d[1]) === B.AIR && world.getBlock(x + d[0], y - 1, z + d[1]) === B.GRASS) {
            world.setBlock(x + d[0], y, z + d[1], B.TALL_GRASS, false);
          }
        }
        return;
      }
    }

    nearTorch(x, y, z) {
      const world = this.game.world;
      for (let dx = -4; dx <= 4; dx += 2) for (let dy = -2; dy <= 3; dy += 2) for (let dz = -4; dz <= 4; dz += 2) {
        if (world.getBlock(x + dx, y + dy, z + dz) === B.TORCH) return true;
      }
      return false;
    }

    spaceForTree(world, x, y, z) {
      for (let dy = 1; dy <= 6; dy++) {
        if (world.getBlock(x, y + dy, z) !== B.AIR) return false;
      }
      return true;
    }

    growTree(world, x, y, z) {
      const h = 4 + ((Math.random() * 3) | 0);
      world.setBlock(x, y, z, B.AIR);
      for (let dy = 1; dy <= h; dy++) world.setBlock(x, y + dy, z, B.LOG);
      for (let dy = h - 3; dy <= h; dy++) {
        const radius = dy >= h - 1 ? 2 : 1;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (Math.abs(dx) === radius && Math.abs(dz) === radius && Math.random() < 0.5) continue;
            if (dy === h && Math.abs(dx) + Math.abs(dz) > 2) continue;
            const bx = x + dx, by = y + dy, bz = z + dz;
            if (world.getBlock(bx, by, bz) === B.AIR) world.setBlock(bx, by, bz, B.LEAVES);
          }
        }
      }
      this.game.audio.play('break_leaves', { volume: 0.3 });
    }

    // ---------------- 火 ----------------
    updateFire(dt) {
      if (this.fireTimers.size === 0) return;
      const world = this.game.world;
      for (const [key, t] of Array.from(this.fireTimers.entries())) {
        const next = t - dt;
        const [x, y, z] = key.split(',').map(Number);
        if (world.getBlock(x, y, z) !== B.FIRE) { this.fireTimers.delete(key); continue; }
        if (next <= 0) {
          world.setBlock(x, y, z, B.AIR, false);
          this.fireTimers.delete(key);
          continue;
        }
        this.fireTimers.set(key, next);
        // 被水浇灭
        let wet = false;
        for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
          if (world.getBlock(x + dx, y + dy, z + dz) === B.WATER) { wet = true; break; }
        }
        if (wet) { world.setBlock(x, y, z, B.AIR, false); this.fireTimers.delete(key); continue; }
        // 雨水浇灭暴露在天空下的火
        if (this.weatherBlend > 0.35) {
          let exposed = true;
          for (let yy = y + 1; yy < MC.WORLD_CONST.HEIGHT; yy++) {
            if (MC.isOpaque(world.getBlock(x, yy, z))) { exposed = false; break; }
          }
          if (exposed && Math.random() < dt * 0.8) {
            world.setBlock(x, y, z, B.AIR, false);
            this.fireTimers.delete(key);
            this.game.effects.smoke(new THREE.Vector3(x + 0.5, y + 0.7, z + 0.5));
            continue;
          }
        }
        // 蔓延：向六个方向的可燃方块引火
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]]) {
          const bx = x + dx, by = y + dy, bz = z + dz;
          if (by < 1 || by >= MC.WORLD_CONST.HEIGHT) continue;
          const target = world.getBlock(bx, by, bz);
          const def = MC.BLOCKS[target];
          if (!def || !def.flammable) continue;
          if (Math.random() > dt * 0.9) continue;
          world.setBlock(bx, by, bz, B.FIRE, false);
          this.fireTimers.set(bx + ',' + by + ',' + bz, 6 + Math.random() * 8);
          if (Math.random() < 0.6) this.game.effects.spawn(bx + 0.5, by + 0.6, bz + 0.5, new THREE.Color(0xffb050), 2, 1.5, 0.1, -1.2, 0.8);
        }
      }
    }

    // ---------------- 水流 ----------------
    onBlockBroken(x, y, z) {
      const world = this.game.world;
      // 检查四周是否有水，向下流
      const dirs = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
      let hasWater = false;
      for (const [dx, dy, dz] of dirs) {
        if (world.getBlock(x + dx, y + dy, z + dz) === B.WATER) { hasWater = true; break; }
      }
      if (!hasWater) return;
      let steps = 0;
      const flow = (fx, fy, fz, depth) => {
        if (steps++ > 40 || depth > 5) return;
        const below = world.getBlock(fx, fy - 1, fz);
        if (below === B.AIR) {
          world.setBlock(fx, fy - 1, fz, B.WATER, false);
          this.game.effects.splash(fx, fy - 1, fz);
          flow(fx, fy - 1, fz, depth + 1);
          return;
        }
        if (below === B.WATER) return;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = fx + dx, nz = fz + dz;
          if (world.getBlock(nx, fy, nz) === B.AIR && world.getBlock(nx, fy - 1, nz) !== B.AIR) {
            world.setBlock(nx, fy, nz, B.WATER, false);
            flow(nx, fy, nz, depth + 1);
          }
        }
      };
      // 从破口上方/旁边开始
      for (const [dx, dy, dz] of dirs) {
        if (world.getBlock(x + dx, y + dy, z + dz) === B.WATER) {
          const below = world.getBlock(x, y - 1, z);
          if (below === B.AIR) {
            world.setBlock(x, y, z, B.WATER, false);
            flow(x, y, z, 0);
          }
          break;
        }
      }
    }

    // ---------------- 生物刷新 ----------------
    spawnCreatures(dt) {
      this.animalTimer -= dt;
      if (this.animalTimer <= 0) {
        this.animalTimer = 5;
        this.trySpawnAnimals();
      }
      this.zombieTimer -= dt;
      if (this.zombieTimer <= 0) {
        this.zombieTimer = 6;
        this.trySpawnZombies();
      }
    }

    findSpawnSpot(minDist, maxDist, needGrass) {
      const world = this.game.world;
      const p = this.game.player.pos;
      for (let attempt = 0; attempt < 24; attempt++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = minDist + Math.random() * (maxDist - minDist);
        const x = Math.floor(p.x + Math.cos(ang) * dist);
        const z = Math.floor(p.z + Math.sin(ang) * dist);
        if (this.game.world.inVillage(x, z, 0) && needGrass !== 'zombie') continue;
        if (this.game.world.inVillage(x, z, 0) && needGrass === 'zombie') continue;
        const c = world.getChunk(x >> 4, z >> 4);
        if (!c || !c.generated) continue;
        const y = world.surfaceY(x, z);
        const ground = world.getBlock(x, y, z);
        const above = world.getBlock(x, y + 1, z);
        const above2 = world.getBlock(x, y + 2, z);
        if (above !== B.AIR || above2 !== B.AIR) continue;
        if (needGrass === true && ground !== B.GRASS) continue;
        if (needGrass === 'zombie' && ground === B.WATER) continue;
        if (MC.isLiquid(ground)) continue;
        return { x: x + 0.5, y: y + 1.02, z: z + 0.5 };
      }
      return null;
    }

    trySpawnAnimals() {
      const kinds = [
        { kind: 'sheep', max: 7 },
        { kind: 'cow', max: 5 },
        { kind: 'pig', max: 5 },
        { kind: 'chicken', max: 7 }
      ];
      const total = this.game.entities.list.filter(e => ['sheep', 'cow', 'pig', 'chicken'].includes(e.kind)).length;
      if (total >= 20) return;
      for (const k of kinds) {
        if (this.game.entities.countKind(k.kind) >= k.max) continue;
        if (Math.random() > 0.35) continue;
        const spot = this.findSpawnSpot(16, 46, true);
        if (spot) {
          this.game.entities.spawnAnimal(k.kind, spot.x, spot.y, spot.z);
          return;
        }
      }
    }

    trySpawnZombies() {
      if (!this.isNight()) return;
      const count = this.game.entities.list.filter(e => e.kind === 'zombie').length;
      if (count >= 6) return;
      if (Math.random() > 0.55) return;
      const spot = this.findSpawnSpot(24, 48, 'zombie');
      if (spot) {
        this.game.entities.spawnZombie(spot.x, spot.y, spot.z);
      }
    }
  }

  MC.Nature = Nature;
  MC.DAY_LENGTH = DAY_LENGTH;
})();