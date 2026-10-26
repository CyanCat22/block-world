/* =========================================================
 *  villagers.js — 村民 NPC：作息、工作、交易、繁衍、逃跑
 * =======================================================*/
(function () {
  'use strict';
  const B = MC.B, I = MC.I;
  const lerpAngle = (a, b, t) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, t);
  };

  const NAMES = ['阿禾', '小满', '文竹', '铁柱', '大壮', '阿远', '石头', '老周', '阿珍', '秋生', '麦芽', '青禾'];
  const PROFESSIONS = {
    farmer: { label: '农夫', color: 0x7ab54a },
    librarian: { label: '图书管理员', color: 0x5b8fd0 },
    blacksmith: { label: '铁匠', color: 0x9a8a7a },
    butcher: { label: '屠夫', color: 0xc06060 }
  };

  function tradeList(profession) {
    const t = [];
    if (profession === 'farmer') {
      t.push({ give: { id: I.WHEAT, count: 6 }, get: { id: I.EMERALD, count: 1 }, usesLeft: 4, max: 4 });
      t.push({ give: { id: I.EMERALD, count: 1 }, get: { id: I.BREAD, count: 4 }, usesLeft: 4, max: 4 });
    } else if (profession === 'librarian') {
      t.push({ give: { id: I.EMERALD, count: 1 }, get: { id: B.GLASS, count: 8 }, usesLeft: 4, max: 4 });
      t.push({ give: { id: I.EMERALD, count: 2 }, get: { id: B.BOOKSHELF, count: 1 }, usesLeft: 3, max: 3 });
    } else if (profession === 'blacksmith') {
      t.push({ give: { id: I.EMERALD, count: 2 }, get: { id: I.IRON_PICK, count: 1 }, usesLeft: 3, max: 3 });
      t.push({ give: { id: I.COAL, count: 6 }, get: { id: I.EMERALD, count: 1 }, usesLeft: 4, max: 4 });
    } else {
      t.push({ give: { id: I.EMERALD, count: 1 }, get: { id: I.MEAT, count: 3 }, usesLeft: 4, max: 4 });
      t.push({ give: { id: I.WOOL, count: 2 }, get: { id: I.EMERALD, count: 1 }, usesLeft: 4, max: 4 });
    }
    return t;
  }

  // =======================================================
  class Villager extends MC.Entity {
    constructor(manager, opts) {
      super(manager, 'villager', opts.x, opts.y, opts.z);
      this.isVillager = true;
      this.name = opts.name || NAMES[(Math.random() * NAMES.length) | 0];
      this.profession = opts.profession || 'farmer';
      this.home = opts.home || null;
      this.bedPos = opts.bedPos || null;
      this.workPos = opts.workPos || null;
      this.villageCenter = opts.villageCenter || { x: 0, z: 0 };
      this.trades = tradeList(this.profession);
      this.state = 'idle';
      this.activity = 'idle';
      this.angry = 0;
      this.sleeping = false;
      this.isChild = !!opts.isChild;
      this.ageDays = 0;
      this.bubbleCooldown = 4 + Math.random() * 8;
      this.stuckTimer = 0;
      this.lastCheck = { x: this.pos.x, z: this.pos.z, timer: 0 };
      this.sidestep = 0;
      this.workTimer = 0;
      this.faceYaw = null;
      this.fireCheck = 1 + Math.random() * 2;
      this.fireTarget = null;
      this.fireTimer = 0;
      this.tradeActive = false;
      this.spawnHome = opts.home || null;
      this.baseSpeed = 2.0;
      this.scale = this.isChild ? 0.62 : 1;
      this.mesh.scale.setScalar(this.scale);
      this.height = this.isChild ? 1.2 : 1.95;
      this.width = this.isChild ? 0.4 : 0.6;
      this.baseSpeed = this.isChild ? 1.4 : 2.0;
      this.greetCooldown = 0;
    }

    get professionLabel() { return this.isChild ? '小孩' : PROFESSIONS[this.profession].label; }

    update(dt, game) {
      this.angry = Math.max(0, this.angry - dt);
      this.greetCooldown = Math.max(0, this.greetCooldown - dt);
      this.bubbleCooldown -= dt;
      if (this.tradeActive) {
        // 交易时面向玩家
        const p = game.player.pos;
        this.yaw = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
        this.vel.x *= 0.7; this.vel.z *= 0.7;
        this.animate(dt);
        this.syncMesh();
        this.updateShadow(game);
        this.physics(dt, game);
        return;
      }
      if (this.handleFire(dt, game)) {
        this.physics(dt, game);
        this.animate(dt);
        this.syncMesh();
        this.updateShadow(game);
        this.hurtFlash();
        return;
      }
      this.updateSchedule(dt, game);
      this.physics(dt, game);
      this.animate(dt);
      this.syncMesh();
      this.updateShadow(game);
      this.hurtFlash();
      this.maybeBubble(game);
    }

    // 看到附近的火会跑去扑灭（小孩只会躲）
    handleFire(dt, game) {
      if (this.isChild) return false;
      this.fireCheck -= dt;
      if (this.fireCheck <= 0) {
        this.fireCheck = 2 + Math.random() * 2;
        if (!this.fireTarget) {
          let best = null, bd = 13 * 13;
          for (const key of game.nature.fireTimers.keys()) {
            const p = key.split(',');
            const fx = +p[0], fy = +p[1], fz = +p[2];
            const d = (fx + 0.5 - this.pos.x) ** 2 + (fz + 0.5 - this.pos.z) ** 2;
            if (d < bd) { bd = d; best = { x: fx, y: fy, z: fz, key: key }; }
          }
          if (best) {
            this.fireTarget = best;
            this.fireTimer = 7;
            game.ui.bubble(this, '着火了！', 2500);
            game.playAt('villager_hmm', this.pos);
          }
        }
      }
      if (!this.fireTarget) return false;
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 || this.stuckTimer > 2) { this.fireTarget = null; return false; }
      const ft = this.fireTarget;
      if (game.world.getBlock(ft.x, ft.y, ft.z) !== MC.B.FIRE) { this.fireTarget = null; return false; }
      const dist = Math.hypot(ft.x + 0.5 - this.pos.x, ft.z + 0.5 - this.pos.z);
      if (dist > 2.4) {
        this.goTo(ft.x + 0.5, ft.z + 0.5, this.baseSpeed * 1.7, dt, game);
      } else {
        game.world.setBlock(ft.x, ft.y, ft.z, MC.B.AIR, false);
        game.nature.fireTimers.delete(ft.key);
        game.effects.poof(new THREE.Vector3(ft.x + 0.5, ft.y + 0.5, ft.z + 0.5), 0xbbbbbb);
        game.audio.play('splash', { volume: 0.4 });
        game.ui.bubble(this, '呼——灭了。', 2000);
        this.fireTarget = null;
      }
      return true;
    }

    hurtFlash() {
      const flash = this.hurtTimer > 0;
      this.mesh.traverse(o => {
        if (o.isMesh) {
          if (flash) o.material.emissive = new THREE.Color(0xaa2222);
          else o.material.emissive = new THREE.Color(0x000000);
        }
      });
    }

    updateSchedule(dt, game) {
      const nature = game.nature;
      const hour = nature.hour;
      const player = game.player;
      const distPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      const zombie = game.entities.nearest(this.pos, 10, e => e.kind === 'zombie');

      // 逃跑优先级最高
      if (this.fleeTimer > 0 || (zombie && !this.isChild)) {
        this.state = 'flee';
        this.fleeTimer = Math.max(this.fleeTimer || 0, zombie ? 2 : 0);
        const threat = zombie || player;
        const dx = this.pos.x - threat.pos.x, dz = this.pos.z - threat.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        const tx = this.pos.x + (dx / len) * 8;
        const tz = this.pos.z + (dz / len) * 8;
        this.goTo(tx, tz, this.baseSpeed * 1.9, dt, game);
        return;
      }

      // 夜间睡觉
      if (hour >= 19 || hour < 6) {
        this.state = 'sleep';
        if (this.bedPos) {
          const d = Math.hypot(this.bedPos.x + 0.5 - this.pos.x, this.bedPos.z + 0.5 - this.pos.z);
          if (d > 1.2) {
            this.sleeping = false;
            this.goTo(this.bedPos.x + 0.5, this.bedPos.z + 0.5, this.baseSpeed, dt, game);
          } else {
            this.sleeping = true;
            this.vel.x *= 0.7; this.vel.z *= 0.7;
            this.yaw = lerpAngle(this.yaw, Math.atan2(-(this.bedPos.x + 0.5 - this.pos.x), -(this.bedPos.z + 0.5 - this.pos.z)), 3);
            if (this.bubbleCooldown <= 0) {
              this.bubbleCooldown = 16 + Math.random() * 10;
              game.ui.bubble(this, 'Zzz…', 2600);
            }
          }
        } else {
          this.vel.x *= 0.7; this.vel.z *= 0.7;
        }
        return;
      }

      // 白天：工作 / 闲聊
      this.sleeping = false;
      if (hour >= 8 && hour < 17) {
        this.state = 'work';
        if (this.workPos) {
          const d = Math.hypot(this.workPos.x - this.pos.x, this.workPos.z - this.pos.z);
          if (d > 2.2) this.goTo(this.workPos.x, this.workPos.z, this.baseSpeed, dt, game);
          else {
            this.vel.x *= 0.75; this.vel.z *= 0.75;
            this.workAction(dt, game);
          }
        } else {
          this.state = 'social';
          this.socialize(dt, game);
        }
      } else if (hour >= 17 && hour < 19) {
        this.state = 'social';
        this.socialize(dt, game);
      } else {
        this.state = 'idle';
        if (this.bedPos) {
          const d = Math.hypot(this.bedPos.x - this.pos.x, this.bedPos.z - this.pos.z);
          if (d > 4) this.goTo(this.bedPos.x + 0.5, this.bedPos.z + 0.5, this.baseSpeed * 0.8, dt, game);
          else this.wanderSmall(dt, game);
        }
      }

      // 玩家靠近时打招呼
      if (distPlayer < 3.2 && this.greetCooldown <= 0 && this.bubbleCooldown <= 0) {
        this.greetCooldown = 22;
        this.bubbleCooldown = 10;
        this.greet(game);
      }
    }

    socialize(dt, game) {
      const cx = this.villageCenter.x, cz = this.villageCenter.z;
      const idx = game.villagers.list.indexOf(this);
      const ang = (idx >= 0 ? idx : 0) * (Math.PI * 2 / Math.max(1, game.villagers.list.length));
      const tx = cx + Math.cos(ang) * 4.5;
      const tz = cz + Math.sin(ang) * 4.5;
      const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      if (d > 1.4) this.goTo(tx, tz, this.baseSpeed * 0.9, dt, game);
      else {
        this.vel.x *= 0.75; this.vel.z *= 0.75;
        // 转向最近的村民
        let near = null, nd = 9;
        for (const v of game.villagers.list) {
          if (v === this) continue;
          const dd = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z);
          if (dd < nd) { nd = dd; near = v; }
        }
        if (near) this.yaw = lerpAngle(this.yaw, Math.atan2(-(near.pos.x - this.pos.x), -(near.pos.z - this.pos.z)), 3 * dt);
        if (this.bubbleCooldown <= 0) {
          this.bubbleCooldown = 12 + Math.random() * 12;
          const lines = ['今天生意怎么样？', '听说山那边有矿洞。', '夜里别乱跑。', '今年的麦子不错。', '旅行者又来了。'];
          game.ui.bubble(this, lines[(Math.random() * lines.length) | 0], 2600);
        }
      }
    }

    wanderSmall(dt, game) {
      this.ai.timer -= dt;
      if (this.ai.timer <= 0) {
        this.ai.timer = 3 + Math.random() * 4;
        this.ai.targetYaw = this.yaw + (Math.random() - 0.5) * Math.PI * 1.6;
      }
      this.yaw = lerpAngle(this.yaw, this.ai.targetYaw, 2 * dt);
      this.vel.x += (-Math.sin(this.yaw) * 0.7 - this.vel.x) * Math.min(1, 6 * dt);
      this.vel.z += (-Math.cos(this.yaw) * 0.7 - this.vel.z) * Math.min(1, 6 * dt);
    }

    workAction(dt, game) {
      this.workTimer -= dt;
      if (this.profession === 'farmer') {
        this.yaw = lerpAngle(this.yaw, Math.atan2(-(this.workPos.x - this.pos.x), -(this.workPos.z - this.pos.z)), 3 * dt);
        if (this.workTimer <= 0) {
          this.workTimer = 1.2 + Math.random() * 1.6;
          const farm = game.village.farms[0];
          if (farm) {
            const bx = farm.x0 + 1 + ((Math.random() * (farm.x1 - farm.x0 - 2)) | 0);
            const bz = farm.z0 + 1 + ((Math.random() * (farm.z1 - farm.z0 - 2)) | 0);
            const soil = game.world.getBlock(bx, game.village.groundY, bz);
            const crop = game.world.getBlock(bx, game.village.groundY + 1, bz);
            if (crop >= B.WHEAT3 && Math.random() < 0.4) {
              game.world.setBlock(bx, game.village.groundY + 1, bz, B.WHEAT0);
              game.effects.blockBreak(bx, game.village.groundY + 1, bz, B.WHEAT3);
              game.audio.play('break_leaves', { volume: 0.2 });
            } else if ((soil === B.FARMLAND || soil === B.FARMLAND_WET) && crop === B.AIR && Math.random() < 0.3) {
              game.world.setBlock(bx, game.village.groundY + 1, bz, B.WHEAT0);
            }
          }
        }
      } else if (this.profession === 'blacksmith') {
        this.yaw = lerpAngle(this.yaw, Math.atan2(-(this.workPos.x - this.pos.x), -(this.workPos.z - this.pos.z)), 3 * dt);
        if (this.workTimer <= 0) {
          this.workTimer = 1.6 + Math.random();
          if (this.parts.armR) this.parts.armR.rotation.x = -1.2;
          game.audio.play('break_stone', { volume: 0.14, pitch: 1.4 });
        }
      } else if (this.profession === 'librarian') {
        this.yaw = lerpAngle(this.yaw, Math.atan2(-(this.workPos.x - this.pos.x), -(this.workPos.z - this.pos.z)), 3 * dt);
        if (this.workTimer <= 0) {
          this.workTimer = 4 + Math.random() * 4;
          if (this.bubbleCooldown <= 0) {
            this.bubbleCooldown = 18;
            game.ui.bubble(this, '嗯…这一页很有意思。', 2400);
          }
        }
      } else {
        // 屠夫：在广场摆摊
        if (this.workTimer <= 0) {
          this.workTimer = 5 + Math.random() * 5;
          this.wanderSmall(dt, game);
        }
      }
    }

    greet(game) {
      let lines;
      if (this.angry > 0) lines = ['别碰我！', '走开！'];
      else if (this.sleeping) lines = ['呼…呼…'];
      else if (this.profession === 'farmer') lines = ['你好啊，旅行者。', '麦子快熟了。', '要用小麦换绿宝石吗？'];
      else if (this.profession === 'librarian') lines = ['想看看书吗？', '夜里的僵尸怕火把。', '知识就是力量。'];
      else if (this.profession === 'blacksmith') lines = ['要打把好镐子吗？', '我的锤子可不含糊。'];
      else lines = ['新鲜的肉，要来点吗？', '今天收获不错。'];
      game.ui.bubble(this, lines[(Math.random() * lines.length) | 0], 3200);
      game.playAt('villager_hmm', this.pos);
    }

    maybeBubble(game) {
      if (this.bubbleCooldown > 0) return;
      const dist = Math.hypot(game.player.pos.x - this.pos.x, game.player.pos.z - this.pos.z);
      if (dist > 10) { this.bubbleCooldown = 6; return; }
      this.bubbleCooldown = 14 + Math.random() * 16;
      if (this.sleeping) return;
      if (this.state === 'work' && Math.random() < 0.4) {
        game.ui.bubble(this, this.isChild ? '我也想帮忙！' : '今天也要好好干活。', 2400);
      }
    }

    planPath(game, tx, tz) {
      if (!MC.Pathfinder) return null;
      const start = MC.Pathfinder.fromPos(this.pos);
      const gy = game.world.surfaceY(Math.floor(tx), Math.floor(tz));
      return MC.Pathfinder.find(game.world, start, { x: Math.floor(tx), y: gy + 1, z: Math.floor(tz) }, { maxNodes: 900 });
    }

    followPath(dt, game, tx, tz, speed) {
      // 定期重新规划，或目标变化时规划
      const target = this.pathTarget;
      const changed = !target || Math.hypot(target.x - tx, target.z - tz) > 3.2;
      this.pathTimer = (this.pathTimer || 0) - dt;
      if ((changed && this.pathTimer <= 0.6) || (!this.path && this.pathTimer <= 0)) {
        this.pathTarget = { x: tx, z: tz };
        this.path = this.planPath(game, tx, tz);
        this.pathIdx = 0;
        this.pathTimer = 2.2;
        if (!this.path) this.pathTimer = 1.0;
      }
      let wx = tx, wz = tz;
      if (this.path && this.path.length) {
        while (this.pathIdx < this.path.length - 1) {
          const wp = this.path[this.pathIdx];
          if (Math.hypot(wp.x + 0.5 - this.pos.x, wp.z + 0.5 - this.pos.z) < 0.55) this.pathIdx++;
          else break;
        }
        const wp = this.path[this.pathIdx];
        const prev = this.pathIdx > 0 ? this.path[this.pathIdx - 1]
          : { x: Math.floor(this.pos.x), y: Math.floor(this.pos.y), z: Math.floor(this.pos.z) };
        // 先对齐到通道中线，再沿轴向通过，避免卡墙角
        if (wp.x !== prev.x) {
          const done = Math.abs(this.pos.z - (wp.z + 0.5)) < 0.14;
          wx = done ? wp.x + 0.5 : this.pos.x;
          wz = done ? wp.z + 0.5 : wp.z + 0.5;
        } else if (wp.z !== prev.z) {
          const done = Math.abs(this.pos.x - (wp.x + 0.5)) < 0.14;
          wx = done ? wp.x + 0.5 : wp.x + 0.5;
          wz = done ? wp.z + 0.5 : this.pos.z;
        } else {
          wx = wp.x + 0.5; wz = wp.z + 0.5;
        }
        // 路点高一格：靠近时起跳
        if (wp.y > Math.floor(this.pos.y) && this.onGround && Math.hypot(wx - this.pos.x, wz - this.pos.z) < 1.15) {
          this.vel.y = 8.5;
        }
      }
      return { x: wx, z: wz };
    }

    goTo(tx, tz, speed, dt, game) {
      const target = this.followPath(dt, game, tx, tz, speed);
      if (!target) return;
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const distToGoal = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      if (distToGoal < 0.35) { this.vel.x *= 0.8; this.vel.z *= 0.8; return; }
      let desired = Math.atan2(-dx, -dz);
      if (this.sidestep > 0) {
        this.sidestep -= dt;
        desired += Math.PI * 0.45 * (this.sidestep > 0.35 ? 1 : -1);
      }
      this.yaw = lerpAngle(this.yaw, desired, 5 * dt);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.vel.x += (-sin * speed - this.vel.x) * Math.min(1, 7 * dt);
      this.vel.z += (-cos * speed - this.vel.z) * Math.min(1, 7 * dt);

      // 卡住检测
      this.lastCheck.timer += dt;
      if (this.lastCheck.timer > 0.7) {
        const moved = Math.hypot(this.pos.x - this.lastCheck.x, this.pos.z - this.lastCheck.z);
        this.lastCheck = { x: this.pos.x, z: this.pos.z, timer: 0 };
        if (moved < 0.12 && this.onGround) {
          this.stuckTimer++;
          this.sidestep = 0.8;
          this.vel.y = 8.5;
          if (this.stuckTimer > 6) {
            // 兜底：直接传送到目标附近，避免村民永远卡住
            this.pos.x = tx + 0.5;
            this.pos.z = tz + 0.5;
            this.pos.y = game.world.surfaceY(Math.floor(tx), Math.floor(tz)) + 1.02;
            this.stuckTimer = 0;
          }
        } else this.stuckTimer = Math.max(0, this.stuckTimer - 1);
      }
    }

    hurt(dmg, source, game) {
      super.hurt(dmg, source, game);
      this.angry = 180;
      if (source === game.player) {
        game.reputation = Math.max(0, game.reputation - 4);
        game.ui.toast('村民 ' + this.name + ' 生气了！', 'bad');
        // 周围村民一起逃跑
        for (const v of game.villagers.list) {
          if (v !== this && v.pos.distanceTo(this.pos) < 14) v.fleeTimer = 6;
        }
      }
    }

    die(source, game) {
      if (game.player && source === game.player) {
        game.reputation = Math.max(0, game.reputation - 10);
        game.ui.toast('你杀害了村民 ' + this.name, 'bad');
      }
      game.effects.poof(this.pos, 0xc98f6b);
      game.audio.play('villager_hurt', { volume: 0.5 });
      game.villagers.list = game.villagers.list.filter(v => v !== this);
      super.remove();
    }

    restock() {
      for (const t of this.trades) t.usesLeft = t.max;
      this.angry = 0;
    }

    serialize() {
      return {
        name: this.name, profession: this.profession, isChild: this.isChild,
        ageDays: this.ageDays, pos: [this.pos.x, this.pos.y, this.pos.z],
        health: this.health, angry: this.angry
      };
    }
  }

  // =======================================================
  class VillagerManager {
    constructor(game) {
      this.game = game;
      this.list = [];
      this.lastDay = game.nature ? game.nature.day : 1;
    }

    spawnInitial() {
      const v = this.game.world.village;
      const cells = this.game.village;
      const centers = [];
      // 建造时记录的房屋顺序：A B C D smithy
      const houses = v.houses;
      const bedPool = v.beds.slice();
      const takeBed = () => bedPool.shift() || { x: v.center.x, y: v.groundY + 1, z: v.center.z };
      const mkPos = (house, ox, oz) => ({
        x: (house ? house.cx : v.center.x) + ox,
        z: (house ? house.cz : v.center.z) + oz
      });
      const spawnPos = (house) => ({
        x: house.cx + 0.5, z: house.cz + 0.5,
        y: this.game.world.village.groundY + 1.02
      });

      const farm = v.farms[0] || { center: { x: v.center.x, z: v.center.z } };
      const specs = [
        { profession: 'farmer', name: '阿禾', house: houses[0], work: { x: farm.center.x - 3, z: farm.center.z } },
        { profession: 'farmer', name: '小满', house: houses[3], work: { x: farm.center.x + 3, z: farm.center.z } },
        { profession: 'librarian', name: '文竹', house: houses[1], work: { x: houses[1].cx - 1, z: houses[1].cz } },
        { profession: 'blacksmith', name: '铁柱', house: houses[4], work: { x: houses[4].cx, z: houses[4].cz } },
        { profession: 'butcher', name: '大壮', house: houses[2], work: { x: v.center.x + 4, z: v.center.z + 4 } }
      ];
      for (const spec of specs) {
        const house = spec.house;
        const bed = house.beds && house.beds.length ? bedPool.shift() : takeBed();
        const sp = spawnPos(house);
        const villager = new Villager(this.game.entities, {
          x: sp.x, y: sp.y, z: sp.z,
          name: spec.name, profession: spec.profession,
          home: house, bedPos: bed,
          workPos: spec.work,
          villageCenter: { x: v.center.x, z: v.center.z }
        });
        this.list.push(villager);
        this.game.entities.add(villager);
      }
      // 3 个小孩？不，初始只有成人，留床铺给繁衍
    }

    update(dt) {
      const day = this.game.nature.day;
      if (day !== this.lastDay) {
        this.lastDay = day;
        for (const v of this.list) v.restock();
        this.tryBreed();
      }
      for (const v of this.list.slice()) v.ageDays += dt / 86400;
    }

    tryBreed() {
      const adults = this.list.filter(v => !v.isChild);
      const children = this.list.filter(v => v.isChild);
      const freeBeds = this.game.world.village.beds.length - this.list.length;
      if (adults.length >= 2 && freeBeds >= 1 && this.list.length < 12) {
        const v = this.game.world.village;
        const child = new Villager(this.game.entities, {
          x: v.center.x + 4.5,
          y: v.groundY + 1.02,
          z: v.center.z - 3.5,
          name: NAMES[(Math.random() * NAMES.length) | 0],
          profession: 'farmer',
          isChild: true,
          home: v.houses[0], bedPos: v.beds[this.list.length] || null,
          villageCenter: { x: v.center.x, z: v.center.z }
        });
        this.list.push(child);
        this.game.entities.add(child);
        this.game.ui.toast('村子里诞生了一个小村民！', 'good');
        this.game.audio.play('levelup', { volume: 0.4 });
      }
      // 小孩长大
      for (const v of this.list) {
        if (v.isChild) {
          v.ageDays += 1;
          if (v.ageDays >= 3) {
            v.isChild = false;
            v.ageDays = 0;
            v.height = 1.95; v.width = 0.6;
            v.mesh.scale.setScalar(1);
            v.baseSpeed = 2.0;
            const profs = ['farmer', 'librarian', 'blacksmith', 'butcher'];
            v.profession = profs[(Math.random() * profs.length) | 0];
            v.trades = tradeList(v.profession);
            v.workPos = v.workPos || { x: v.villageCenter.x, z: v.villageCenter.z };
            this.game.ui.toast('小村民 ' + v.name + ' 长大了，成为了' + PROFESSIONS[v.profession].label + '。', 'good');
          }
        }
      }
    }

    nearest(pos, maxDist) {
      let best = null, bd = maxDist * maxDist;
      for (const v of this.list) {
        if (v.removed) continue;
        const d = v.pos.distanceToSquared(pos);
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    }

    serialize() {
      return this.list.map(v => v.serialize());
    }
  }

  MC.Villager = Villager;
  MC.VillagerManager = VillagerManager;
  MC.PROFESSIONS = PROFESSIONS;
  MC.villagerTradeList = tradeList;
})();