/* =========================================================
 *  entities.js — 实体基类、动物与僵尸、实体管理
 * =======================================================*/
(function () {
  'use strict';
  const B = MC.B, I = MC.I;
  const EPS = 1e-4;

  const MATERIAL_CACHE = new Map();
  function mat(color, opts) {
    const key = color + ':' + JSON.stringify(opts || {});
    if (MATERIAL_CACHE.has(key)) return MATERIAL_CACHE.get(key);
    const m = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    MATERIAL_CACHE.set(key, m);
    return m;
  }
  function box(w, h, d, color, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, mat(color));
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  // ---------------- 模型 ----------------
  function buildAnimalMesh(kind) {
    const g = new THREE.Group();
    const parts = {};
    const add = (name, mesh, parent) => { (parent || g).add(mesh); parts[name] = mesh; return mesh; };

    if (kind === 'sheep') {
      add('body', box(0.85, 0.8, 1.25, 0xEFEFE8, 0, 0.95, 0));
      add('wool', box(0.95, 0.5, 1.2, 0xF7F7F2, 0, 1.35, 0));
      add('head', box(0.5, 0.5, 0.55, 0xEFEFE8, 0, 1.2, -0.78));
      add('face', box(0.34, 0.3, 0.12, 0xE8C7B0, 0, 1.12, -1.06));
      add('eyeL', box(0.08, 0.1, 0.06, 0x222222, -0.13, 1.27, -1.02));
      add('eyeR', box(0.08, 0.1, 0.06, 0x222222, 0.13, 1.27, -1.02));
      add('earL', box(0.16, 0.1, 0.22, 0xE0E0DA, -0.3, 1.36, -0.72));
      add('earR', box(0.16, 0.1, 0.22, 0xE0E0DA, 0.3, 1.36, -0.72));
      const legY = 0.55;
      ['legFL', 'legFR', 'legBL', 'legBR'].forEach((n, i) => {
        const p = new THREE.Group();
        p.position.set(i % 2 ? 0.28 : -0.28, legY, i < 2 ? -0.42 : 0.42);
        const leg = box(0.24, 0.55, 0.24, 0xE3E3DC, 0, -0.275, 0);
        p.add(leg);
        g.add(p);
        parts[n] = p;
      });
    } else if (kind === 'cow') {
      add('body', box(0.95, 0.85, 1.4, 0x4a3b2c, 0, 1.1, 0));
      add('patch1', box(0.4, 0.5, 0.3, 0xf2efe6, -0.28, 1.2, -0.3));
      add('patch2', box(0.3, 0.4, 0.4, 0xf2efe6, 0.3, 1.05, 0.3));
      add('head', box(0.55, 0.55, 0.6, 0x4a3b2c, 0, 1.4, -0.92));
      add('snout', box(0.4, 0.25, 0.18, 0xd8b7a0, 0, 1.28, -1.22));
      add('hornL', box(0.1, 0.1, 0.2, 0xd8d2c0, -0.24, 1.68, -0.9));
      add('hornR', box(0.1, 0.1, 0.2, 0xd8d2c0, 0.24, 1.68, -0.9));
      add('eyeL', box(0.08, 0.1, 0.06, 0x1a1a1a, -0.16, 1.46, -1.2));
      add('eyeR', box(0.08, 0.1, 0.06, 0x1a1a1a, 0.16, 1.46, -1.2));
      ['legFL', 'legFR', 'legBL', 'legBR'].forEach((n, i) => {
        const p = new THREE.Group();
        p.position.set(i % 2 ? 0.3 : -0.3, 0.68, i < 2 ? -0.48 : 0.48);
        p.add(box(0.26, 0.68, 0.26, 0x3e3124, 0, -0.34, 0));
        g.add(p);
        parts[n] = p;
      });
    } else if (kind === 'pig') {
      add('body', box(0.8, 0.7, 1.1, 0xe89aa0, 0, 0.78, 0));
      add('head', box(0.55, 0.5, 0.5, 0xe89aa0, 0, 0.92, -0.68));
      add('snout', box(0.3, 0.22, 0.18, 0xd8797f, 0, 0.84, -0.98));
      add('nostrilL', box(0.06, 0.06, 0.04, 0x9c4f55, -0.08, 0.85, -1.05));
      add('nostrilR', box(0.06, 0.06, 0.04, 0x9c4f55, 0.08, 0.85, -1.05));
      add('eyeL', box(0.07, 0.09, 0.05, 0x1a1a1a, -0.15, 1.02, -0.94));
      add('eyeR', box(0.07, 0.09, 0.05, 0x1a1a1a, 0.15, 1.02, -0.94));
      add('earL', box(0.1, 0.16, 0.1, 0xd8797f, -0.22, 1.16, -0.72));
      add('earR', box(0.1, 0.16, 0.1, 0xd8797f, 0.22, 1.16, -0.72));
      ['legFL', 'legFR', 'legBL', 'legBR'].forEach((n, i) => {
        const p = new THREE.Group();
        p.position.set(i % 2 ? 0.25 : -0.25, 0.42, i < 2 ? -0.36 : 0.36);
        p.add(box(0.22, 0.42, 0.22, 0xd8797f, 0, -0.21, 0));
        g.add(p);
        parts[n] = p;
      });
    } else if (kind === 'chicken') {
      add('body', box(0.42, 0.42, 0.5, 0xf7f7f2, 0, 0.5, 0));
      add('head', box(0.3, 0.3, 0.3, 0xf7f7f2, 0, 0.82, -0.2));
      add('beak', box(0.12, 0.1, 0.16, 0xe8b23f, 0, 0.79, -0.4));
      add('comb', box(0.1, 0.14, 0.14, 0xd94a3f, 0, 0.99, -0.2));
      add('eyeL', box(0.05, 0.06, 0.04, 0x1a1a1a, -0.09, 0.86, -0.34));
      add('eyeR', box(0.05, 0.06, 0.04, 0x1a1a1a, 0.09, 0.86, -0.34));
      add('wingL', box(0.06, 0.3, 0.4, 0xe8e8e0, -0.23, 0.5, 0));
      add('wingR', box(0.06, 0.3, 0.4, 0xe8e8e0, 0.23, 0.5, 0));
      const p1 = new THREE.Group(); p1.position.set(-0.1, 0.28, 0); p1.add(box(0.06, 0.28, 0.06, 0xe8b23f, 0, -0.14, 0)); g.add(p1); parts.legL = p1;
      const p2 = new THREE.Group(); p2.position.set(0.1, 0.28, 0); p2.add(box(0.06, 0.28, 0.06, 0xe8b23f, 0, -0.14, 0)); g.add(p2); parts.legR = p2;
    } else if (kind === 'zombie') {
      add('body', box(0.5, 0.7, 0.3, 0x2f6b8f, 0, 1.05, 0));
      add('head', box(0.5, 0.5, 0.5, 0x5f8f4a, 0, 1.65, 0));
      add('eyeL', box(0.1, 0.08, 0.05, 0x1a3a12, -0.11, 1.7, -0.26));
      add('eyeR', box(0.1, 0.08, 0.05, 0x1a3a12, 0.11, 1.7, -0.26));
      add('mouth', box(0.18, 0.05, 0.04, 0x2c4a1e, 0, 1.56, -0.26));
      const armL = new THREE.Group(); armL.position.set(-0.34, 1.35, 0); armL.add(box(0.2, 0.6, 0.2, 0x5f8f4a, 0, -0.3, 0)); armL.rotation.x = Math.PI / 2; g.add(armL); parts.armL = armL;
      const armR = new THREE.Group(); armR.position.set(0.34, 1.35, 0); armR.add(box(0.2, 0.6, 0.2, 0x5f8f4a, 0, -0.3, 0)); armR.rotation.x = Math.PI / 2; g.add(armR); parts.armR = armR;
      ['legFL', 'legFR'].forEach((n, i) => {
        const p = new THREE.Group();
        p.position.set(i % 2 ? 0.13 : -0.13, 0.72, 0);
        p.add(box(0.22, 0.72, 0.22, 0x2b3a5a, 0, -0.36, 0));
        g.add(p);
        parts[n] = p;
      });
    } else if (kind === 'villager') {
      add('body', box(0.5, 0.75, 0.35, 0x6b4a2f, 0, 1.0, 0));
      add('robe', box(0.56, 0.35, 0.4, 0x7d5636, 0, 0.62, 0));
      add('head', box(0.5, 0.55, 0.45, 0xc98f6b, 0, 1.68, 0));
      add('nose', box(0.14, 0.28, 0.18, 0xb87a55, 0, 1.6, -0.3));
      add('eyeL', box(0.08, 0.08, 0.04, 0x2a2a2a, -0.13, 1.78, -0.235));
      add('eyeR', box(0.08, 0.08, 0.04, 0x2a2a2a, 0.13, 1.78, -0.235));
      add('browL', box(0.16, 0.05, 0.04, 0x5a3f2a, -0.13, 1.87, -0.235));
      add('browR', box(0.16, 0.05, 0.04, 0x5a3f2a, 0.13, 1.87, -0.235));
      const armL = new THREE.Group(); armL.position.set(-0.32, 1.32, 0); armL.add(box(0.18, 0.55, 0.18, 0x7d5636, 0, -0.27, 0)); g.add(armL); parts.armL = armL;
      const armR = new THREE.Group(); armR.position.set(0.32, 1.32, 0); armR.add(box(0.18, 0.55, 0.18, 0x7d5636, 0, -0.27, 0)); g.add(armR); parts.armR = armR;
      ['legFL', 'legFR'].forEach((n, i) => {
        const p = new THREE.Group();
        p.position.set(i % 2 ? 0.13 : -0.13, 0.6, 0);
        p.add(box(0.2, 0.6, 0.2, 0x4a3b2c, 0, -0.3, 0));
        g.add(p);
        parts[n] = p;
      });
      add('profession', box(0.08, 0.18, 0.06, 0xf2d24a, -0.2, 1.45, -0.19));
    }
    return { group: g, parts };
  }

  let SHADOW_TEX = null;
  function shadowTexture() {
    if (SHADOW_TEX) return SHADOW_TEX;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.60)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    SHADOW_TEX = new THREE.CanvasTexture(cv);
    return SHADOW_TEX;
  }

  const ANIMAL_INFO = {
    sheep: { width: 0.85, height: 1.35, health: 8, speed: 1.5, sounds: ['sheep'] },
    cow: { width: 0.95, height: 1.5, health: 10, speed: 1.6, sounds: ['cow'] },
    pig: { width: 0.8, height: 1.0, health: 8, speed: 1.7, sounds: ['pig'] },
    chicken: { width: 0.45, height: 0.8, health: 4, speed: 1.9, sounds: ['chicken'] },
    zombie: { width: 0.6, height: 1.9, health: 14, speed: 2.5, sounds: ['zombie'] },
    villager: { width: 0.6, height: 1.95, health: 20, speed: 2.1, sounds: ['villager_hmm'] }
  };

  // =======================================================
  class Entity {
    constructor(manager, kind, x, y, z) {
      this.manager = manager;
      this.game = manager.game;
      this.kind = kind;
      const info = ANIMAL_INFO[kind] || ANIMAL_INFO.sheep;
      this.width = info.width;
      this.height = info.height;
      this.maxHealth = info.health;
      this.health = info.health;
      this.baseSpeed = info.speed;
      this.sounds = info.sounds || [];
      this.pos = new THREE.Vector3(x, y, z);
      this.vel = new THREE.Vector3();
      this.yaw = Math.random() * Math.PI * 2;
      this.onGround = false;
      this.inWater = false;
      this.dead = false;
      this.age = 0;
      this.hurtTimer = 0;
      this.walkPhase = 0;
      this.ai = { state: 'idle', timer: Math.random() * 2, targetYaw: this.yaw, soundTimer: 4 + Math.random() * 8 };
      this.attackTimer = 0;
      this.fleeTimer = 0;
      this.burnTimer = 0;
      this.tags = {};
      const built = buildAnimalMesh(kind);
      this.mesh = built.group;
      this.parts = built.parts;
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.yaw;
      this.mesh.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); } });
      manager.group.add(this.mesh);
      this.baseScale = 1;
      this.shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.45 })
      );
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.renderOrder = 1;
      this.shadow.visible = !!(manager.game.settings && manager.game.settings.shadows);
      manager.group.add(this.shadow);
    }

    get eyeY() { return this.pos.y + this.height * 0.85; }

    update(dt, game) {
      this.age += dt;
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.behave(dt, game);
      this.physics(dt, game);
      this.animate(dt);
      this.syncMesh();
      this.updateShadow(game);
      // 受伤闪红
      const flash = this.hurtTimer > 0;
      this.mesh.traverse(o => {
        if (o.isMesh) {
          if (flash) { o.material.emissive = new THREE.Color(0xaa2222); }
          else { o.material.emissive = new THREE.Color(0x000000); }
        }
      });
      // 随机叫声
      if (this.sounds.length) {
        this.ai.soundTimer -= dt;
        if (this.ai.soundTimer <= 0) {
          this.ai.soundTimer = 8 + Math.random() * 14;
          if (this.game.distanceToPlayer(this.pos) < 28) {
            game.playAt(this.sounds[0], this.pos);
          }
        }
      }
    }

    behave(dt, game) {
      const ai = this.ai;
      ai.timer -= dt;
      if (this.fleeTimer > 0) {
        this.fleeTimer -= dt;
        ai.state = 'flee';
        this.walkSpeed = this.baseSpeed * 1.9;
      } else if (ai.timer <= 0) {
        ai.timer = 2 + Math.random() * 4;
        if (Math.random() < 0.45) {
          ai.state = 'idle';
        } else {
          ai.state = 'wander';
          ai.targetYaw = Math.random() * Math.PI * 2;
          this.yaw = ai.targetYaw;
        }
      }
      if (ai.state === 'wander') {
        this.walkSpeed = this.baseSpeed;
        this.yaw += Math.sin(this.age * 0.7 + this.pos.x) * 0.02;
        this.moveForward(dt, this.walkSpeed);
      } else if (ai.state === 'idle') {
        this.vel.x *= 0.8; this.vel.z *= 0.8;
      } else if (ai.state === 'flee') {
        this.moveForward(dt, this.walkSpeed || this.baseSpeed * 1.9);
      }
      // 避免走进深水
      if (!this.inWater && this.onGround) {
        const ax = Math.floor(this.pos.x - Math.sin(this.yaw) * 0.9);
        const az = Math.floor(this.pos.z - Math.cos(this.yaw) * 0.9);
        if (this.game.world.getBlock(ax, Math.floor(this.pos.y), az) === B.WATER) {
          this.yaw += Math.PI * (0.6 + Math.random() * 0.8);
          ai.timer = 1.5;
        }
      }
    }

    moveForward(dt, speed) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.vel.x += (-sin * speed - this.vel.x) * Math.min(1, 8 * dt);
      this.vel.z += (-cos * speed - this.vel.z) * Math.min(1, 8 * dt);
    }

    physics(dt, game) {
      const world = game.world;
      const feet = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
      this.inWater = feet === B.WATER;
      if (this.inWater) {
        this.vel.y -= 4 * dt;
        this.vel.y = Math.max(-2.5, this.vel.y);
        if (this.vel.y < 0.5) this.vel.y += 2.2 * dt;
      } else {
        this.vel.y -= 26 * dt;
      }
      this.onGround = false;
      this._move('x', this.vel.x * dt, world);
      this._move('z', this.vel.z * dt, world);
      this._move('y', this.vel.y * dt, world);
      // 卡住时跳跃（自动上台阶）
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > 0.2 && this.onGround) {
        const aheadX = Math.floor(this.pos.x - Math.sin(this.yaw) * 0.6);
        const aheadZ = Math.floor(this.pos.z - Math.cos(this.yaw) * 0.6);
        const footY = Math.floor(this.pos.y + 0.2);
        for (let yy = footY; yy <= footY + 1; yy++) {
          if (MC.isSolid(world.getBlock(aheadX, yy, aheadZ))) {
            if (!MC.isSolid(world.getBlock(aheadX, footY + 2, aheadZ))) {
              this.vel.y = 7.2;
              break;
            }
          }
        }
      }
      // 掉进虚空
      if (this.pos.y < -10) this.remove();
      // 远离玩家太远则清理（动物）
      if (this.age > 5 && this.kind !== 'villager' && game.distanceToPlayer(this.pos) > 96) {
        this.remove();
      }
    }

    _move(axis, amount, world) {
      if (!amount) return;
      this.pos[axis] += amount;
      const half = this.width / 2;
      const minX = Math.floor(this.pos.x - half + EPS), maxX = Math.floor(this.pos.x + half - EPS);
      const minY = Math.floor(this.pos.y + EPS), maxY = Math.floor(this.pos.y + this.height - EPS);
      const minZ = Math.floor(this.pos.z - half + EPS), maxZ = Math.floor(this.pos.z + half - EPS);
      let hit = false;
      for (let bx = minX; bx <= maxX && !hit; bx++) {
        for (let by = minY; by <= maxY && !hit; by++) {
          for (let bz = minZ; bz <= maxZ && !hit; bz++) {
            if (!MC.isSolid(world.getBlock(bx, by, bz))) continue;
            hit = true;
            if (axis === 'x') { this.pos.x = amount > 0 ? bx - half - EPS : bx + 1 + half + EPS; this.vel.x = 0; }
            else if (axis === 'z') { this.pos.z = amount > 0 ? bz - half - EPS : bz + 1 + half + EPS; this.vel.z = 0; }
            else {
              this.pos.y = amount > 0 ? by - this.height - EPS : by + 1 + EPS;
              if (amount < 0) this.onGround = true;
              this.vel.y = 0;
            }
            break;
          }
        }
      }
    }

    animate(dt) {
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > 0.1) this.walkPhase += dt * speed * 5.5;
      const swing = Math.sin(this.walkPhase) * 0.6;
      const p = this.parts;
      if (p.legFL) p.legFL.rotation.x = swing;
      if (p.legFR) p.legFR.rotation.x = -swing;
      if (p.legBL) p.legBL.rotation.x = -swing;
      if (p.legBR) p.legBR.rotation.x = swing;
      if (p.legL) p.legL.rotation.x = swing;
      if (p.legR) p.legR.rotation.x = -swing;
      if (p.armL) p.armL.rotation.x = -swing * 0.7;
      if (p.armR) p.armR.rotation.x = swing * 0.7;
      if (p.head) p.head.position.y = (p.head.userData.baseY || p.head.position.y) + Math.sin(this.age * 2) * 0.01;
      if (p.body) p.body.position.y = (p.body.userData.baseY || p.body.position.y) + Math.abs(Math.sin(this.walkPhase)) * 0.03;
      // 僵尸待机手臂摆动
      if (p.armR && this.kind === 'zombie') {
        p.armR.rotation.x = Math.PI / 2 + Math.sin(this.age * 3) * 0.08;
        p.armL.rotation.x = Math.PI / 2 - Math.sin(this.age * 3) * 0.08;
      }
    }

    syncMesh() {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.yaw;
    }

    updateShadow(game) {
      const sh = this.shadow;
      if (!sh) return;
      if (!game.settings || !game.settings.shadows) { sh.visible = false; return; }
      const w = game.world;
      if (!w) { sh.visible = false; return; }
      const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
      const y0 = Math.floor(this.pos.y + 0.05);
      let gy = null;
      for (let y = y0; y >= y0 - 18; y--) {
        const b = w.getBlockFast(bx, y, bz);
        if (b === 0) continue;
        if (b === MC.B.WATER) { gy = y + 0.86; break; }
        if (MC.isSolid(b)) { gy = y + 1; break; }
      }
      if (gy === null) { sh.visible = false; return; }
      const gap = Math.max(0, this.pos.y - gy);
      sh.visible = true;
      sh.position.set(this.pos.x, gy + 0.02, this.pos.z);
      const sc = this.width * 2.0 + gap * 0.18;
      sh.scale.set(sc, sc, 1);
      sh.material.opacity = Math.max(0.06, 0.42 - gap * 0.05);
    }

    hurt(dmg, source, game) {
      if (this.dead) return;
      this.health -= dmg;
      this.hurtTimer = 0.22;
      this.fleeTimer = 5;
      this.ai.timer = 4;
      if (this.health <= 0) {
        this.die(source, game);
      } else {
        game.audio.play('hurt', { volume: 0.3, pitch: 1.1 });
      }
    }

    die(source, game) {
      if (this.dead) return;
      this.dead = true;
      game.effects.poof(this.pos, this.kind === 'zombie' ? 0x5f8f4a : 0xdddddd);
      const drops = this.isBaby ? [] : this.kind === 'sheep' ? [{ id: I.WOOL, count: 2 }, { id: I.MEAT, count: 1 }]
        : this.kind === 'cow' ? [{ id: I.MEAT, count: 2 }]
          : this.kind === 'pig' ? [{ id: I.MEAT, count: 2 }]
            : this.kind === 'chicken' ? [{ id: I.MEAT, count: 1 }]
              : [];
      if (source === game.player) {
        for (const d of drops) {
          game.player.addItem(d.id, d.count);
          game.ui.toast('+ ' + MC.labelOf(d.id) + ' ×' + d.count, 'good');
        }
      }
      if (this.kind === 'zombie' && game.stats) game.stats.zombieKills++;
      game.audio.play(this.kind === 'zombie' ? 'zombie' : 'hurt', { volume: 0.35, pitch: 0.8 });
      this.remove();
    }

    remove() {
      if (this.removed) return;
      this.removed = true;
      this.manager.group.remove(this.mesh);
      this.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      if (this.shadow) {
        this.manager.group.remove(this.shadow);
        this.shadow.geometry.dispose();
        this.shadow.material.dispose();
        this.shadow = null;
      }
      this.manager.remove(this);
    }
  }

  // ---------------- 僵尸 ----------------
  class Zombie extends Entity {
    constructor(manager, x, y, z) {
      super(manager, 'zombie', x, y, z);
      this.attackCooldown = 0;
      this.path = null;
      this.pathIdx = 0;
      this.pathTimer = 0;
      this.pathGoal = null;
      this.blockTimer = 0;
    }
    planChase(dt, game, player) {
      this.pathTimer -= dt;
      const moved = !this.pathGoal || Math.hypot(this.pathGoal.x - player.pos.x, this.pathGoal.z - player.pos.z) > 2.2;
      if (this.pathTimer <= 0 && (!this.path || moved)) {
        this.pathTimer = 1.0;
        this.pathGoal = { x: player.pos.x, z: player.pos.z };
        const start = MC.Pathfinder.fromPos(this.pos);
        this.path = MC.Pathfinder.find(game.world, start, MC.Pathfinder.fromPos(player.pos), { maxNodes: 700 });
        this.pathIdx = 0;
      }
      if (!this.path || !this.path.length) return { x: player.pos.x, z: player.pos.z };
      while (this.pathIdx < this.path.length - 1 &&
        Math.hypot(this.path[this.pathIdx].x + 0.5 - this.pos.x, this.path[this.pathIdx].z + 0.5 - this.pos.z) < 0.6) this.pathIdx++;
      const wp = this.path[this.pathIdx];
      return { x: wp.x + 0.5, z: wp.z + 0.5 };
    }
    behave(dt, game) {
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      const player = game.player;
      const dx = player.pos.x - this.pos.x;
      const dz = player.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const night = game.nature.isNight();
      // 白天燃烧
      if (!night && game.nature.isDaytime()) {
        this.burnTimer += dt;
        if (this.burnTimer > 0.5) {
          this.burnTimer = 0;
          this.health -= 1;
          this.hurtTimer = 0.1;
          game.effects.smoke(this.pos);
          if (this.health <= 0) { this.die(null, game); return; }
        }
      }
      if (dist < 22 && !player.dead) {
        const target = dist > 2.2 ? this.planChase(dt, game, player) : { x: player.pos.x, z: player.pos.z };
        const tdx = target.x - this.pos.x, tdz = target.z - this.pos.z;
        this.yaw = Math.atan2(-tdx, -tdz);
        this.walkSpeed = this.baseSpeed;
        this.moveForward(dt, this.walkSpeed);
        // 被墙挡住时跳一下并重算路线
        if (this.onGround && Math.hypot(this.vel.x, this.vel.z) < 0.45) {
          this.blockTimer += dt;
          if (this.blockTimer > 0.4) {
            this.blockTimer = 0;
            this.vel.y = 8.5;
            this.pathTimer = 0;
          }
        } else this.blockTimer = 0;
        if (dist < 1.6 && this.attackCooldown <= 0) {
          this.attackCooldown = 1.2;
          player.damage(2, '僵尸');
          game.playAt('zombie', this.pos);
        }
        // 避免卡住
        this.ai.timer = 2;
      } else {
        super.behave(dt, game);
      }
    }
  }

  // ---------------- 动物 ----------------
  class Animal extends Entity {
    constructor(manager, kind, x, y, z) {
      super(manager, kind, x, y, z);
      this.isAnimal = true;
      this.love = 0;
      this.breedCd = 0;
      this.loveBred = false;
      this.isBaby = false;
      this.bornDay = 0;
    }

    makeBaby(game) {
      this.isBaby = true;
      this.bornDay = game.nature.day;
      this.baseScale = 0.6;
      this.scale = 0.6;
      this.mesh.scale.setScalar(0.6);
      this.height = this.height * 0.6;
      this.width = this.width * 0.6;
      this.health = Math.max(2, Math.round(this.health * 0.5));
      this.maxHealth = this.health;
    }

    growUp() {
      if (!this.isBaby) return;
      this.isBaby = false;
      this.baseScale = 1;
      this.mesh.scale.setScalar(1);
      this.height = this.height / 0.6;
      this.width = this.width / 0.6;
    }

    behave(dt, game) {
      super.behave(dt, game);
      this.love = Math.max(0, this.love - dt);
      this.breedCd = Math.max(0, this.breedCd - dt);
      if (this.isBaby && game.nature.day - this.bornDay >= 2) this.growUp();
      // 心形粒子 + 寻找伴侣
      if (this.love > 0 && !this.isBaby) {
        if (Math.random() < dt * 2) {
          game.effects.spawn(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + this.height * 0.9,
            this.pos.z + (Math.random() - 0.5) * 0.6, new THREE.Color(0xff7aa8), 1, 0.5, 0.35, 0.35, 0.7);
        }
        if (!this.loveBred) {
          const mate = game.entities.list.find(o => o !== this && o.isAnimal && o.kind === this.kind && !o.isBaby && o.love > 0 && !o.loveBred && o.pos.distanceTo(this.pos) < 4.5);
          if (mate) {
            this.loveBred = true;
            mate.loveBred = true;
            game.entities.breed(this, mate);
          }
        }
      }
      // 被小麦/种子吸引
      const held = game.player.selectedItem();
      const food = this.kind === 'chicken' ? MC.I.SEEDS : MC.I.WHEAT;
      if (held === food && !this.isBaby) {
        const dx = game.player.pos.x - this.pos.x, dz = game.player.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.7 && d < 10) {
          let diff = Math.atan2(-dx, -dz) - this.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.yaw += diff * Math.min(1, 6 * dt);
          const sp = this.baseSpeed * 1.15;
          this.vel.x += (-Math.sin(this.yaw) * sp - this.vel.x) * Math.min(1, 6 * dt);
          this.vel.z += (-Math.cos(this.yaw) * sp - this.vel.z) * Math.min(1, 6 * dt);
        }
      }
      // 羊吃草
      if (this.kind === 'sheep' && this.onGround && Math.random() < dt * 0.05) {
        const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
        const by = Math.floor(this.pos.y) - 1;
        const below = game.world.getBlock(bx, by, bz);
        if (below === B.GRASS) {
          game.world.setBlock(bx, by, bz, B.DIRT);
          game.audio.play('break_leaves', { volume: 0.25 });
        }
      }
    }
  }

  // ---------------- 实体管理 ----------------
  class EntityManager {
    constructor(game) {
      this.game = game;
      this.list = [];
      this.group = new THREE.Group();
      this.group.name = 'entities';
      game.scene.add(this.group);
      this.tmp = new THREE.Vector3();
    }

    add(e) { this.list.push(e); return e; }
    remove(e) {
      const i = this.list.indexOf(e);
      if (i >= 0) this.list.splice(i, 1);
    }

    spawnAnimal(kind, x, y, z) {
      return this.add(new Animal(this, kind, x, y, z));
    }
    spawnZombie(x, y, z) {
      return this.add(new Zombie(this, x, y, z));
    }

    breed(a, b) {
      const game = this.game;
      const kind = a.kind;
      const total = this.list.filter(e => e.isAnimal && e.kind === kind && !e.isBaby).length;
      if (total >= 12) return null;
      const x = (a.pos.x + b.pos.x) / 2, z = (a.pos.z + b.pos.z) / 2;
      const y = Math.max(a.pos.y, b.pos.y);
      const baby = this.spawnAnimal(kind, x + 0.6, y, z);
      baby.makeBaby(game);
      a.love = 0; b.love = 0;
      a.breedCd = 90; b.breedCd = 90;
      game.effects.poof(baby.pos, 0xffb3c6);
      game.audio.play('gift', { volume: 0.4, pitch: 1.3 });
      const names = { sheep: '小羊', cow: '小牛', pig: '小猪', chicken: '小鸡' };
      game.ui.toast('出生了一只' + (names[kind] || '小动物'), 'good');
      return baby;
    }

    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (e.removed) continue;
        e.update(dt, this.game);
      }
    }

    countKind(kind) { return this.list.filter(e => e.kind === kind).length; }

    nearest(pos, maxDist, filter) {
      let best = null, bestD = maxDist * maxDist;
      for (const e of this.list) {
        if (e.dead || e.removed) continue;
        if (filter && !filter(e)) continue;
        const d = e.pos.distanceToSquared(pos);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }

    // 命中检测：沿视线采样，判断是否击中实体
    pick(origin, dir, maxDist, filter) {
      let best = null, bestT = maxDist;
      for (const e of this.list) {
        if (e.dead || e.removed) continue;
        if (filter && !filter(e)) continue;
        const half = e.width / 2;
        const min = new THREE.Vector3(e.pos.x - half, e.pos.y, e.pos.z - half);
        const max = new THREE.Vector3(e.pos.x + half, e.pos.y + e.height, e.pos.z + half);
        // slab 相交
        let tmin = 0, tmax = bestT;
        let ok = true;
        for (const axis of ['x', 'y', 'z']) {
          const o = origin[axis], d = dir[axis];
          if (Math.abs(d) < 1e-8) {
            if (o < min[axis] || o > max[axis]) { ok = false; break; }
          } else {
            let t1 = (min[axis] - o) / d, t2 = (max[axis] - o) / d;
            if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) { ok = false; break; }
          }
        }
        if (ok && tmin < bestT) { bestT = tmin; best = e; }
      }
      return best;
    }

    clearAll() {
      for (const e of this.list.slice()) e.remove();
      this.list = [];
    }
  }

  MC.Entity = Entity;
  MC.Animal = Animal;
  MC.Zombie = Zombie;
  MC.EntityManager = EntityManager;
  MC.buildAnimalMesh = buildAnimalMesh;
  MC.ENTITY_INFO = ANIMAL_INFO;
})();