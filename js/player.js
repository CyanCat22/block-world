/* =========================================================
 *  player.js — 玩家：第一人称移动、碰撞、挖掘、放置、背包、生命
 * =======================================================*/
(function () {
  'use strict';
  const B = MC.B, I = MC.I;
  const EPS = 1e-4;
  const HALF = 0.3, HEIGHT = 1.8, EYE = 1.62;

  class Player {
    constructor(game) {
      this.game = game;
      this.pos = new THREE.Vector3(0, 40, 0);
      this.vel = new THREE.Vector3();
      this.yaw = 0; this.pitch = 0;
      this.onGround = false; this.inWater = false; this.headInWater = false;
      this.health = 20; this.maxHealth = 20;
      this.hunger = 20; this.maxHunger = 20;
      this.exhaustion = 0;
      this.air = 15; this.maxAir = 15;
      this.items = new Map();
      this.hotbar = new Array(9).fill(0);
      this.selected = 0;
      this.mining = null;
      this.attackCooldown = 0;
      this.eatCooldown = 0;
      this.hurtTimer = 0;
      this.regenTimer = 0;
      this.starveTimer = 0;
      this.airDamageTimer = 0;
      this.fallDistance = 0;
      this.stepTimer = 0;
      this.bobPhase = 0;
      this.dead = false;
      this.flyMode = false;
      this.spawnPoint = null;
      this._targetBlock = null;
      this._targetEntity = null;
      this.reach = 5.2;
    }

    // ---------------- 初始化 ----------------
    resetForSpawn(spawn) {
      this.pos.set(spawn.x, spawn.y, spawn.z);
      this.vel.set(0, 0, 0);
      this.health = this.maxHealth;
      this.hunger = this.maxHunger;
      this.air = this.maxAir;
      this.exhaustion = 0;
      this.dead = false;
      this.fallDistance = 0;
      this.yaw = 0;
      this.pitch = -0.05;
      this.mining = null;
      this.spawnPoint = { x: spawn.x, y: spawn.y, z: spawn.z };
      if (this.items.size === 0) this.giveStartingItems();
    }

    giveStartingItems() {
      this.addItem(I.WOOD_PICK, 1);
      this.addItem(I.BREAD, 6);
      this.addItem(I.EMERALD, 12);
    }

    // ---------------- 背包 ----------------
    countOf(id) { return this.items.get(id) || 0; }
    hasItems(cost) {
      return cost.every(c => this.countOf(c.id) >= c.count);
    }
    addItem(id, count) {
      if (!id) return 0;
      const cur = this.countOf(id);
      const maxStack = MC.ITEMS[id] && MC.ITEMS[id].tool ? 1 : 64;
      const next = Math.min(maxStack * 9, cur + count);
      this.items.set(id, next);
      // 自动放进第一个空的快捷栏位
      if (!this.hotbar.includes(id)) {
        const idx = this.hotbar.indexOf(0);
        if (idx >= 0) this.hotbar[idx] = id;
      }
      this.game.ui && this.game.ui.onInventoryChanged();
      return next - cur;
    }
    removeItem(id, count) {
      const cur = this.countOf(id);
      if (cur < count) return false;
      const next = cur - count;
      if (next <= 0) {
        this.items.delete(id);
        for (let i = 0; i < this.hotbar.length; i++) if (this.hotbar[i] === id) this.hotbar[i] = 0;
      } else this.items.set(id, next);
      this.game.ui && this.game.ui.onInventoryChanged();
      return true;
    }
    consume(cost) {
      for (const c of cost) if (!this.removeItem(c.id, c.count)) return false;
      return true;
    }
    selectedItem() { return this.hotbar[this.selected] || 0; }
    selectSlot(i) {
      this.selected = ((i % 9) + 9) % 9;
      this.game.ui && this.game.ui.onSelectionChanged();
    }
    cycleSlot(dir) {
      this.selectSlot(this.selected + dir);
    }
    swapHotbarWithItem(id) {
      const cur = this.hotbar[this.selected];
      this.hotbar[this.selected] = id;
      // 如果该物品原本在别的槽位，清掉它，避免重复
      for (let i = 0; i < 9; i++) {
        if (i !== this.selected && this.hotbar[i] === id) this.hotbar[i] = cur;
      }
      this.game.ui && this.game.ui.onSelectionChanged();
    }

    craft(recipe) {
      if (!this.hasItems(recipe.cost)) return false;
      for (const c of recipe.cost) {
        if (!this.removeItem(c.id, c.count)) return false;
      }
      this.addItem(recipe.out.id, recipe.out.count);
      this.game.stats.crafted++;
      this.game.audio.play('craft', { volume: 0.5 });
      this.game.ui.toast('合成了 ' + MC.labelOf(recipe.out.id) + ' ×' + recipe.out.count, 'good');
      return true;
    }

    // ---------------- 视线 ----------------
    getEyePos() {
      return new THREE.Vector3(this.pos.x, this.pos.y + EYE + this.game.cameraBob, this.pos.z);
    }
    getLookDir() {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      return new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    }
    getTargetBlock() {
      const world = this.game.world;
      const eye = this.getEyePos();
      return world.raycast(eye, this.getLookDir(), this.reach);
    }

    // ---------------- 更新 ----------------
    update(dt, input) {
      if (this.dead) return;
      const world = this.game.world;
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      this.eatCooldown = Math.max(0, this.eatCooldown - dt);
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);

      // 视角
      const sens = this.game.settings.sensitivity;
      this.yaw -= input.dx * sens;
      this.pitch -= input.dy * sens;
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      // 水
      const feetBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
      const headBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
      const wasInWater = this.inWater;
      this.inWater = feetBlock === B.WATER;
      this.headInWater = headBlock === B.WATER;
      if (this.inWater && !wasInWater) {
        this.game.audio.play('splash', { volume: 0.5 });
        this.fallDistance = 0;
      }

      // 移动输入
      const keys = input.keys;
      let f = 0, s = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
      const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && f > 0 && this.hunger > 6;
      this.sprinting = sprinting;

      const yaw = this.yaw;
      let dx = 0, dz = 0;
      if (f !== 0 || s !== 0) {
        const sin = Math.sin(yaw), cos = Math.cos(yaw);
        // forward = (-sin, -cos), right = (cos, -sin)
        dx = f * -sin + s * cos;
        dz = f * -cos + s * -sin;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;
      }

      let speed = sprinting ? 6.4 : 4.4;
      if (this.inWater) speed *= 0.55;
      if (this.flyMode) speed *= 1.8;

      const accel = this.onGround ? 14 : 5;
      const targetVX = dx * speed, targetVZ = dz * speed;
      this.vel.x += (targetVX - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (targetVZ - this.vel.z) * Math.min(1, accel * dt);

      // 跳跃 / 游泳
      const jumpHeld = keys.has('Space');
      if (this.flyMode) {
        this.vel.y = 0;
        if (jumpHeld) this.vel.y = 7.5;
        if (keys.has('ShiftLeft')) this.vel.y = -7.5;
      } else if (this.inWater) {
        this.vel.y -= 9 * dt;
        if (jumpHeld) this.vel.y = Math.min(4.2, this.vel.y + 22 * dt);
        this.vel.y *= 0.94;
        this.vel.y = Math.max(-6, this.vel.y);
      } else {
        this.vel.y -= 28 * dt;
        if (jumpHeld && this.onGround) {
          this.vel.y = 8.7;
          this.onGround = false;
          this.addExhaustion(0.12);
          this.game.audio.play('jump', { volume: 0.25 });
        }
        this.vel.y = Math.max(-55, this.vel.y);
      }

      // 碰撞移动
      this.onGround = false;
      this._moveAxis('x', this.vel.x * dt, world);
      this._moveAxis('z', this.vel.z * dt, world);
      this._moveAxis('y', this.vel.y * dt, world);

      // 落地 / 摔落
      if (this.inWater) this.fallDistance = 0;
      if (this.onGround && this.fallDistance > 0) {
        const dmg = Math.floor(this.fallDistance - 3.2);
        if (dmg > 0) this.damage(dmg, '摔落');
        this.fallDistance = 0;
      }
      if (!this.onGround && this.vel.y < 0) this.fallDistance += -this.vel.y * dt;

      // 步伐 & 体力消耗
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (this.onGround && hs > 0.8) {
        this.stepTimer -= dt * (sprinting ? 1.35 : 1);
        if (this.stepTimer <= 0) {
          this.stepTimer = 0.42;
          const below = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y) - 1, Math.floor(this.pos.z));
          this.game.audio.play(this._stepSound(below), { volume: 0.2, pitch: 0.92 + Math.random() * 0.16 });
        }
        this.bobPhase += dt * (sprinting ? 13 : 9);
        this.game.cameraBob = Math.sin(this.bobPhase) * 0.035;
      } else {
        this.game.cameraBob *= 0.85;
      }

      this.addExhaustion(hs * dt * 0.014 + (sprinting ? dt * 0.02 : 0));

      // 生命 / 饥饿 / 氧气
      this.updateStats(dt);

      // 掉出世界
      if (this.pos.y < -4) this.damage(100, '虚空');
    }

    _stepSound(blockId) {
      const d = MC.BLOCKS[blockId];
      if (!d) return 'step_grass';
      if (d.key === 'gravel') return 'step_gravel';
      if (d.key === 'stone' || d.key === 'cobble' || d.key === 'bedrock' || d.key === 'furnace' ||
        d.key === 'furnace_lit' || d.key.includes('ore')) return 'step_stone';
      if (d.key === 'sand') return 'step_sand';
      if (d.key === 'log' || d.key === 'planks' || d.key === 'crafting' || d.key === 'bookshelf' ||
        d.key === 'bed' || d.key === 'chest') return 'step_wood';
      if (d.key === 'water') return 'step_water';
      if (d.key === 'grass' || d.key === 'leaves') return 'step_grass';
      if (d.key === 'farmland' || d.key === 'farmland_wet' || d.key === 'dirt') return 'step_dirt';
      return 'step_dirt';
    }

    _collides(x, y, z, world) {
      const minX = Math.floor(x - HALF + EPS), maxX = Math.floor(x + HALF - EPS);
      const minY = Math.floor(y + EPS), maxY = Math.floor(y + HEIGHT - EPS);
      const minZ = Math.floor(z - HALF + EPS), maxZ = Math.floor(z + HALF - EPS);
      for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            if (MC.isSolid(world.getBlock(bx, by, bz))) return true;
          }
        }
      }
      return false;
    }

    _moveAxis(axis, amount, world) {
      if (amount === 0) return;
      const old = this.pos[axis];
      this.pos[axis] = old + amount;
      if (amount > 0) {
        const bx = Math.floor(this.pos.x + HALF - EPS);
        const by = Math.floor(this.pos.y + HEIGHT - EPS);
        const bz = Math.floor(this.pos.z + HALF - EPS);
        void bx; void by; void bz;
      }
      // 检查并逐个推出
      const minX = Math.floor(this.pos.x - HALF + EPS), maxX = Math.floor(this.pos.x + HALF - EPS);
      const minY = Math.floor(this.pos.y + EPS), maxY = Math.floor(this.pos.y + HEIGHT - EPS);
      const minZ = Math.floor(this.pos.z - HALF + EPS), maxZ = Math.floor(this.pos.z + HALF - EPS);
      let hit = false;
      for (let bx = minX; bx <= maxX && !hit; bx++) {
        for (let by = minY; by <= maxY && !hit; by++) {
          for (let bz = minZ; bz <= maxZ && !hit; bz++) {
            if (!MC.isSolid(world.getBlock(bx, by, bz))) continue;
            hit = true;
            if (axis === 'x') {
              this.pos.x = amount > 0 ? bx - HALF - EPS : bx + 1 + HALF + EPS;
              this.vel.x = 0;
            } else if (axis === 'z') {
              this.pos.z = amount > 0 ? bz - HALF - EPS : bz + 1 + HALF + EPS;
              this.vel.z = 0;
            } else {
              this.pos.y = amount > 0 ? by - HEIGHT - EPS : by + 1 + EPS;
              if (amount < 0) this.onGround = true;
              this.vel.y = 0;
            }
            break;
          }
        }
      }
    }

    updateStats(dt) {
      // 体力消耗 → 饥饿
      while (this.exhaustion >= 4) {
        this.exhaustion -= 4;
        this.hunger = Math.max(0, this.hunger - 1);
      }
      // 回血
      if (this.hunger >= 16 && this.health < this.maxHealth) {
        this.regenTimer += dt;
        if (this.regenTimer >= 3.5) {
          this.regenTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 1);
          this.addExhaustion(1.2);
        }
      } else this.regenTimer = 0;
      // 饥饿伤害
      if (this.hunger <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer >= 4) { this.starveTimer = 0; this.damage(1, '饥饿'); }
      } else this.starveTimer = 0;
      // 氧气
      if (this.headInWater) {
        this.air = Math.max(0, this.air - dt);
        if (this.air <= 0) {
          this.airDamageTimer += dt;
          if (this.airDamageTimer >= 1) { this.airDamageTimer = 0; this.damage(2, '溺水'); }
        }
      } else {
        this.air = Math.min(this.maxAir, this.air + dt * 3);
        this.airDamageTimer = 0;
      }
      // 低血量闪烁
      this.game.ui.setHealth(this.health, this.maxHealth);
      this.game.ui.setHunger(this.hunger, this.maxHunger);
      this.game.ui.setAir(this.headInWater ? this.air / this.maxAir : -1);
      this.game.ui.setDamageFlash(this.hurtTimer > 0);
    }

    addExhaustion(v) { this.exhaustion = Math.min(40, this.exhaustion + v); }

    damage(amount, reason) {
      if (this.dead || this.game.godMode) return;
      this.health -= amount;
      this.hurtTimer = 0.35;
      this.game.audio.play('hurt', { volume: 0.5 });
      this.game.ui.shake(0.25);
      if (this.health <= 0) {
        this.health = 0;
        this.dead = true;
        this.game.onPlayerDeath(reason || '未知原因');
      }
    }

    heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }

    eat(itemId) {
      const item = MC.ITEMS[itemId];
      if (!item || !item.food) return false;
      if (this.hunger >= this.maxHunger) {
        this.game.ui.toast('你还不饿', 'warn');
        return false;
      }
      if (!this.removeItem(itemId, 1)) return false;
      this.hunger = Math.min(this.maxHunger, this.hunger + item.food);
      this.game.audio.play('eat', { volume: 0.5 });
      this.game.ui.toast('吃掉了 ' + item.label + '，饥饿 +' + item.food, 'good');
      return true;
    }

    // ---------------- 挖掘 ----------------
    updateMining(dt, input) {
      const world = this.game.world;
      const target = this.getTargetBlock();
      this._targetBlock = target;
      this.game.ui.setSelectionBox(target);

      if (!input.mouseLeft || !target) {
        this.mining = null;
        this.game.ui.setMiningProgress(0);
        return;
      }
      const def = MC.BLOCKS[target.id];
      if (!def || !isFinite(def.hardness)) {
        this.mining = null;
        this.game.ui.setMiningProgress(0);
        return;
      }
      if (!this.mining || this.mining.x !== target.x || this.mining.y !== target.y || this.mining.z !== target.z) {
        this.mining = { x: target.x, y: target.y, z: target.z, progress: 0, total: MC.breakTime(target.id, this.selectedItem()) };
      }
      const bt = MC.breakTime(target.id, this.selectedItem());
      this.mining.total = bt;
      this.mining.progress += dt * (this.hunger > 0 ? 1 : 0.6);
      this.addExhaustion(dt * 0.03);
      this.game.ui.setMiningProgress(Math.min(1, this.mining.progress / bt));
      if (this.mining.progress >= bt) {
        this.breakBlock(target);
        this.mining = null;
        this.game.ui.setMiningProgress(0);
      }
    }

    breakBlock(t) {
      const world = this.game.world;
      const id = t.id;
      const def = MC.BLOCKS[id];
      if (!def || !isFinite(def.hardness)) return;
      if (this.game.stats) this.game.stats.mined[id] = (this.game.stats.mined[id] || 0) + 1;
      // 箱子和熔炉里的东西先倒出来
      if (id === B.CHEST) this.game.spillChest(t);
      if (id === B.FURNACE || id === B.FURNACE_LIT) this.game.spillFurnace(t);
      const drops = MC.dropsFor(id, Math.random);
      world.setBlock(t.x, t.y, t.z, B.AIR);
      // 掉落直接进背包
      for (const d of drops) {
        this.addItem(d.id, d.count);
      }
      this.game.effects.blockBreak(t.x, t.y, t.z, id);
      this.game.audio.play(this._stepSound(id), { volume: 0.5 });
      this.addExhaustion(def.key === 'stone' ? 0.06 : 0.03);
      // 上方植物一起掉落
      const above = world.getBlock(t.x, t.y + 1, t.z);
      if (MC.isPlant(above) || above === B.TORCH || above === B.FIRE) {
        world.setBlock(t.x, t.y + 1, t.z, B.AIR);
        for (const d of MC.dropsFor(above, Math.random)) this.addItem(d.id, d.count);
        this.game.effects.blockBreak(t.x, t.y + 1, t.z, above);
      }
      // 水会向下流（自然规则）
      this.game.nature.onBlockBroken(t.x, t.y, t.z);
    }

    // ---------------- 放置 / 使用 ----------------
    useHeld(input) {
      const world = this.game.world;
      const held = this.selectedItem();
      const target = this.getTargetBlock();
      // 右键床 → 睡觉
      if (target && target.id === B.BED) { this.game.trySleep(); return true; }
      // 右键箱子 / 熔炉
      if (target && target.id === B.CHEST) { this.game.openChest(target); return true; }
      if (target && (target.id === B.FURNACE || target.id === B.FURNACE_LIT)) { this.game.openFurnace(target); return true; }
      if (!held) return false;
      const item = MC.ITEMS[held];

      // 锄头：把草/泥土变成耕地
      if (item && item.tool === 'hoe') {
        if (!target) return false;
        if (target.id === B.GRASS || target.id === B.DIRT) {
          if (world.getBlock(target.x, target.y + 1, target.z) !== B.AIR) { this.game.ui.toast('上方要留出空位', 'warn'); return false; }
          world.setBlock(target.x, target.y, target.z, B.FARMLAND);
          this.game.audio.play('hoe', { volume: 0.5 });
          this.game.effects.blockBreak(target.x, target.y, target.z, B.DIRT);
          this.addExhaustion(0.02);
          return true;
        }
        this.game.ui.toast('只能锄草地或泥土', 'warn');
        return false;
      }

      // 吃东西
      if (item && item.food && input.mouseRight) {
        if (this.eatCooldown > 0) return true;
        this.eatCooldown = 0.8;
        return this.eat(held);
      }
      // 种子
      if (item && item.plant) {
        if (!target) return false;
        const below = world.getBlock(target.x, target.y, target.z);
        const aboveTarget = world.getBlock(target.x, target.y + 1, target.z);
        let px = target.x, py = target.y, pz = target.z;
        if (below === B.FARMLAND || below === B.FARMLAND_WET) {
          py = target.y + 1;
          if (aboveTarget !== B.AIR) return false;
        } else if (aboveTarget === B.AIR && (world.getBlock(px, py - 1, pz) === B.FARMLAND || world.getBlock(px, py - 1, pz) === B.FARMLAND_WET)) {
          // 对着耕地上方空气
        } else {
          this.game.ui.toast('种子只能种在耕地上', 'warn');
          return false;
        }
        world.setBlock(px, py, pz, item.plant);
        this.removeItem(held, 1);
        this.game.audio.play('place', { volume: 0.35 });
        return true;
      }
      // 放置方块
      if (MC.isPlaceable(held)) {
        if (!target) return false;
        const tdef = MC.BLOCKS[target.id];
        let px, py, pz;
        if (tdef && tdef.replaceable) { px = target.x; py = target.y; pz = target.z; }
        else { px = target.x + target.nx; py = target.y + target.ny; pz = target.z + target.nz; }
        const existing = world.getBlock(px, py, pz);
        const edef = MC.BLOCKS[existing];
        if (!(existing === B.AIR || (edef && edef.replaceable) || existing === B.WATER)) return false;
        if (this._blockIntersectsPlayer(px, py, pz)) return false;
        if (!this._canPlaceAt(held, px, py, pz)) return false;
        world.setBlock(px, py, pz, held);
        this.removeItem(held, 1);
        this.game.onBlockPlaced(held, px, py, pz);
        this.game.audio.play('place', { volume: 0.4 });
        this.addExhaustion(0.01);
        return true;
      }
      return false;
    }

    feedAnimal(entity) {
      const held = this.selectedItem();
      const want = entity.kind === 'chicken' ? MC.I.SEEDS : MC.I.WHEAT;
      if (held !== want) {
        this.game.ui.toast(entity.kind === 'chicken' ? '手持小麦种子才能喂鸡' : '手持小麦才能喂它', 'warn');
        return false;
      }
      if (entity.isBaby) { this.game.ui.toast('它还没长大呢', 'warn'); return false; }
      if (entity.love > 0) { this.game.ui.toast('它正在期待小伙伴', 'good'); return true; }
      if (entity.breedCd > 0) { this.game.ui.toast('它需要休息一会儿', 'warn'); return false; }
      this.removeItem(held, 1);
      entity.love = 20;
      entity.loveBred = false;
      this.game.effects.poof(entity.pos, 0xff9ec0);
      this.game.audio.play('gift', { volume: 0.45 });
      this.game.ui.toast('它开心地蹭了蹭你', 'good');
      return true;
    }

    pickBlock() {
      const target = this.getTargetBlock();
      if (!target) return;
      const id = target.id;
      if (!id || id === B.AIR) return;
      const trySelect = (itemId) => {
        if (!itemId) return false;
        const idx = this.hotbar.indexOf(itemId);
        if (idx >= 0) { this.selectSlot(idx); return true; }
        if (this.countOf(itemId) > 0) { this.swapHotbarWithItem(itemId); return true; }
        return false;
      };
      if (trySelect(id)) return;
      const drops = MC.dropsFor(id, Math.random);
      for (const d of drops) { if (trySelect(d.id)) return; }
      this.game.ui.toast('背包里没有 ' + MC.labelOf(id), 'warn');
    }

    _blockIntersectsPlayer(x, y, z) {
      const pMinX = this.pos.x - HALF, pMaxX = this.pos.x + HALF;
      const pMinY = this.pos.y, pMaxY = this.pos.y + HEIGHT;
      const pMinZ = this.pos.z - HALF, pMaxZ = this.pos.z + HALF;
      return x < pMaxX && x + 1 > pMinX && y < pMaxY && y + 1 > pMinY && z < pMaxZ && z + 1 > pMinZ;
    }

    _canPlaceAt(id, x, y, z) {
      const world = this.game.world;
      const below = world.getBlock(x, y - 1, z);
      if (id === B.TORCH) {
        if (!MC.isSolid(below)) { this.game.ui.toast('火把需要放在方块上', 'warn'); return false; }
      }
      if (id === B.SAPLING || id === B.FLOWER_RED || id === B.FLOWER_YELLOW || id === B.TALL_GRASS) {
        if (below !== B.GRASS && below !== B.DIRT && below !== B.FARMLAND && below !== B.FARMLAND_WET) {
          this.game.ui.toast('植物需要种在泥土或草地上', 'warn');
          return false;
        }
      }
      return true;
    }

    // ---------------- 攻击 ----------------
    attack(entity, game) {
      if (this.attackCooldown > 0) return;
      this.attackCooldown = 0.55;
      const held = this.selectedItem();
      const item = MC.ITEMS[held];
      let dmg = 1;
      if (item) dmg = item.damage || 1;
      const dir = this.getLookDir();
      entity.hurt(dmg, this, game);
      this.addExhaustion(0.12);
      game.effects.hit(entity.pos);
      game.audio.play('hurt', { volume: 0.25, pitch: 1.2 });
      // 击退
      entity.vel.x += dir.x * 4;
      entity.vel.z += dir.z * 4;
      entity.vel.y = Math.max(entity.vel.y, 4);
    }

    // ---------------- 相机 ----------------
    updateCamera(camera) {
      const bob = this.game.cameraBob;
      camera.position.set(this.pos.x, this.pos.y + EYE + bob, this.pos.z);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      const baseFov = (this.game.settings && this.game.settings.fov) || 72;
      const targetFov = this.sprinting ? baseFov + 6 : baseFov;
      camera.fov += (targetFov - camera.fov) * 0.12;
      camera.updateProjectionMatrix();
    }

    // ---------------- 存档 ----------------
    serialize() {
      return {
        pos: [this.pos.x, this.pos.y, this.pos.z],
        yaw: this.yaw, pitch: this.pitch,
        health: this.health, hunger: this.hunger, air: this.air,
        items: Array.from(this.items.entries()),
        hotbar: this.hotbar.slice(),
        selected: this.selected,
        spawnPoint: this.spawnPoint
      };
    }
    deserialize(d) {
      if (!d) return;
      if (d.pos) this.pos.set(d.pos[0], d.pos[1], d.pos[2]);
      this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
      this.health = d.health !== undefined ? d.health : 20;
      this.hunger = d.hunger !== undefined ? d.hunger : 20;
      this.air = d.air !== undefined ? d.air : 15;
      this.items = new Map(d.items || []);
      this.hotbar = d.hotbar || new Array(9).fill(0);
      this.selected = d.selected || 0;
      this.spawnPoint = d.spawnPoint || null;
      this.dead = false;
    }
  }

  MC.Player = Player;
  MC.PLAYER_CONST = { HALF, HEIGHT, EYE };
})();