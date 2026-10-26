/* =========================================================
 *  ui.js — HUD、快捷栏、背包/合成、村民交易、气泡、调试信息
 * =======================================================*/
(function () {
  'use strict';
  const B = MC.B, I = MC.I;

  class UI {
    constructor(game) {
      this.game = game;
      this.el = {};
      this.hotbarSlots = [];
      this.lastHealth = -1;
      this.lastHunger = -1;
      this.lastAir = -2;
      this.lastSelected = -1;
      this.bubbles = [];
      this.tradeVillager = null;
      this.modal = null;
      this.selectionBox = null;
      this.toastTimers = [];
      this.debugTimer = 0;
      this.mapTimer = 0;
      this.chestKey = null;
      this.furnaceKey = null;
      this.furnaceViewTimer = 0;
      this.mapCanvas = document.getElementById('minimap-canvas');
      this.mapCtx = this.mapCanvas ? this.mapCanvas.getContext('2d') : null;
      this.mapDir = document.getElementById('minimap-dir');
      this.initElements();
      this.buildHotbar();
      this.buildSelectionBox();
      this.buildAirBar();
    }

    q(id) { return document.getElementById(id); }

    // ---------------- 小地图 ----------------
    updateMinimap(dt) {
      const g = this.game, cv = this.mapCanvas, ctx = this.mapCtx;
      if (!cv || !ctx) return;
      if (!g.settings || !g.settings.minimap) return;
      this.mapTimer -= dt;
      if (this.mapTimer > 0) return;
      this.mapTimer = 0.5;

      const p = g.player.pos;
      const R = 56;                       // 显示半径（方块）
      const size = cv.width;              // 184
      const scale = size / (R * 2);
      const B = MC.B;
      const colorOf = (id) => {
        if (id === B.GRASS) return '#6f9f42';
        if (id === B.DIRT) return '#7c5a3a';
        if (id === B.STONE) return '#8a8a8a';
        if (id === B.COBBLE) return '#7d7d7d';
        if (id === B.LOG) return '#6a4a2a';
        if (id === B.LEAVES) return '#3f7a35';
        if (id === B.SAND) return '#d8cf9c';
        if (id === B.WATER) return '#3a6fc4';
        if (id === B.PLANKS) return '#b08a5a';
        if (id === B.GLASS) return '#bcd4da';
        if (id === B.GRAVEL) return '#8d8579';
        if (id === B.COAL_ORE) return '#6d6d6d';
        if (id === B.IRON_ORE) return '#a58a6a';
        if (id === B.DIAMOND_ORE) return '#6ac6c6';
        if (id === B.FARMLAND) return '#5f432a';
        if (id === B.FARMLAND_WET) return '#4b3522';
        if (id >= B.WHEAT0 && id <= B.WHEAT3) return '#c2ad46';
        if (id === B.TORCH) return '#ffb040';
        if (id === B.SAPLING) return '#4d8a3a';
        if (id === B.FLOWER_RED) return '#c0566a';
        if (id === B.FLOWER_YELLOW) return '#d8c04a';
        if (id === B.TALL_GRASS) return '#6a9c3f';
        if (id === B.BED) return '#a84444';
        if (id === B.CRAFTING) return '#a97a4a';
        if (id === B.ANVIL) return '#555555';
        if (id === B.BOOKSHELF) return '#8a6a3a';
        if (id === B.FIRE) return '#ff7a2a';
        if (id === B.BEDROCK) return '#333333';
        return '#5a5a5a';
      };

      ctx.fillStyle = '#0e151d';
      ctx.fillRect(0, 0, size, size);
      const startX = Math.floor(p.x - R), startZ = Math.floor(p.z - R);
      const step = 2;
      const startScan = Math.min(62, Math.max(45, Math.floor(p.y) + 12));
      for (let wz = startZ; wz < startZ + R * 2; wz += step) {
        const py = (wz - startZ) * scale;
        for (let wx = startX; wx < startX + R * 2; wx += step) {
          let id = 0;
          for (let y = startScan; y >= 4; y--) {
            const b = g.world.getBlockFast(wx, y, wz);
            if (b !== 0) { id = b; break; }
          }
          if (!id) continue;
          ctx.fillStyle = colorOf(id);
          ctx.fillRect((wx - startX) * scale, py, step * scale + 0.6, step * scale + 0.6);
        }
      }

      // 村庄标记 / 方向
      const vc = g.world.village && g.world.village.center;
      let dirText = '';
      if (vc) {
        const dx = vc.x - p.x, dz = vc.z - p.z;
        const dist = Math.hypot(dx, dz);
        const cx2 = size / 2, cz2 = size / 2;
        if (Math.abs(dx) <= R && Math.abs(dz) <= R) {
          ctx.save();
          ctx.fillStyle = '#8fe060';
          ctx.strokeStyle = '#1c3a12';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx2 + dx * scale, cz2 + dz * scale - 5);
          ctx.lineTo(cx2 + dx * scale + 4.5, cz2 + dz * scale);
          ctx.lineTo(cx2 + dx * scale, cz2 + dz * scale + 5);
          ctx.lineTo(cx2 + dx * scale - 4.5, cz2 + dz * scale);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.restore();
        } else {
          const ang = Math.atan2(dx, -dz);
          const arrowX = cx2 + Math.sin(ang) * (size / 2 - 12);
          const arrowY = cz2 - Math.cos(ang) * (size / 2 - 12);
          ctx.save();
          ctx.translate(arrowX, arrowY);
          ctx.rotate(ang);
          ctx.fillStyle = '#8fe060';
          ctx.beginPath();
          ctx.moveTo(0, -7); ctx.lineTo(6, 6); ctx.lineTo(0, 2); ctx.lineTo(-6, 6);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
        const idx = Math.round(((Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
        dirText = '村庄 ' + Math.round(dist) + ' 格 ' + arrows[idx];
      }

      // 玩家箭头
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(-g.player.yaw);
      ctx.fillStyle = '#ffe07a';
      ctx.strokeStyle = '#4a3a08';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();

      // 北
      ctx.fillStyle = 'rgba(230,240,250,.75)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('北', size / 2, 12);

      if (this.mapDir) this.mapDir.textContent = dirText || '已探索区域';
    }

    initElements() {
      for (const id of ['hud', 'hotbar', 'hearts', 'hunger', 'topbar', 'clock-text', 'clock-icon', 'weather-text',
        'debug', 'toast-wrap', 'bubble-layer', 'damage-flash', 'underwater-tint', 'item-name',
        'inventory-screen', 'inv-grid', 'recipe-list', 'trade-screen', 'trade-title', 'trade-body',
        'help-screen', 'pause-screen', 'death-screen', 'death-msg', 'loading', 'loading-fill',
        'loading-text', 'start-screen', 'crosshair', 'chest-screen', 'chest-grid', 'chest-inv-grid',
        'furnace-screen', 'furnace-input', 'furnace-fuel', 'furnace-output', 'burn-fill', 'smelt-fill',
        'furnace-inv-grid', 'quest-screen', 'quest-list', 'quest-rep']) {
        this.el[id] = document.getElementById(id);
      }
      this.el['inv-panel'] = this.el['inventory-screen'];
    }

    buildSelectionBox() {
      const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
      const edges = new THREE.EdgesGeometry(geo);
      const mat = new THREE.LineBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.55 });
      this.selectionBox = new THREE.LineSegments(edges, mat);
      this.selectionBox.visible = false;
      this.game.scene.add(this.selectionBox);
      // 挖掘进度条
      const wrap = document.createElement('div');
      wrap.id = 'mine-wrap';
      wrap.style.cssText = 'position:absolute;left:50%;top:calc(50% + 22px);transform:translateX(-50%);width:86px;height:5px;background:rgba(0,0,0,.45);border-radius:3px;overflow:hidden;opacity:0;transition:opacity .12s;';
      const fill = document.createElement('div');
      fill.id = 'mine-fill';
      fill.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#7fbf4a,#d8f0a0);';
      wrap.appendChild(fill);
      this.el.hud.appendChild(wrap);
      this.el['mine-wrap'] = wrap;
      this.el['mine-fill'] = fill;
    }

    buildAirBar() {
      const row = document.createElement('div');
      row.id = 'airbar';
      row.style.cssText = 'position:absolute;left:50%;bottom:100px;transform:translateX(-50%);display:none;gap:3px;';
      for (let i = 0; i < 10; i++) {
        const b = document.createElement('div');
        b.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#7fd4ff;box-shadow:0 0 6px rgba(120,210,255,.8);opacity:.9;';
        row.appendChild(b);
      }
      this.el.hud.appendChild(row);
      this.el.airbar = row;
    }

    // ---------------- 快捷栏 ----------------
    buildHotbar() {
      const bar = this.el.hotbar;
      bar.innerHTML = '';
      this.hotbarSlots = [];
      for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        const key = document.createElement('span');
        key.className = 'key';
        key.textContent = i + 1;
        const icon = document.createElement('div');
        icon.className = 'icon';
        const count = document.createElement('span');
        count.className = 'count';
        slot.appendChild(key);
        slot.appendChild(icon);
        slot.appendChild(count);
        slot.addEventListener('mousedown', (e) => { e.preventDefault(); this.game.player.selectSlot(i); });
        bar.appendChild(slot);
        this.hotbarSlots.push({ slot, icon, count });
      }
      this.refreshHotbar();
    }

    refreshHotbar() {
      const player = this.game.player;
      if (!player) return;
      for (let i = 0; i < 9; i++) {
        const item = player.hotbar[i];
        const s = this.hotbarSlots[i];
        if (!s) continue;
        if (item && player.countOf(item) > 0) {
          s.icon.style.backgroundImage = `url(${MC.icon(item)})`;
          const n = player.countOf(item);
          const stack = MC.ITEMS[item] && MC.ITEMS[item].tool ? 1 : 64;
          s.count.textContent = n > 1 ? String(Math.min(n, 999)) : '';
        } else {
          s.icon.style.backgroundImage = '';
          s.count.textContent = '';
        }
        s.slot.classList.toggle('active', i === player.selected);
      }
      this.lastSelected = player.selected;
    }

    onInventoryChanged() { this.refreshHotbar(); if (this.modal === 'inventory') this.refreshInventory(); }
    onSelectionChanged() {
      this.refreshHotbar();
      const item = this.game.player.selectedItem();
      if (item) {
        const name = this.el['item-name'];
        name.textContent = MC.labelOf(item);
        name.classList.add('show');
        clearTimeout(this._itemNameTimer);
        this._itemNameTimer = setTimeout(() => name.classList.remove('show'), 1400);
      }
    }

    // ---------------- 状态 ----------------
    setHealth(hp, max) {
      if (hp === this.lastHealth) return;
      this.lastHealth = hp;
      const full = Math.floor(hp / 2), half = hp % 2;
      let html = '';
      for (let i = 0; i < 10; i++) {
        const kind = i < full ? 'heart_full' : (i === full && half ? 'heart_half' : 'heart_empty');
        html += `<div class="stat-icon" style="background-image:url(${MC.makeRawIcon(kind)})"></div>`;
      }
      this.el.hearts.innerHTML = html;
    }

    setHunger(hg, max) {
      if (hg === this.lastHunger) return;
      this.lastHunger = hg;
      const full = Math.floor(hg / 2), half = hg % 2;
      let html = '';
      for (let i = 0; i < 10; i++) {
        const kind = i < full ? 'food_full' : (i === full && half ? 'food_half' : 'food_empty');
        html += `<div class="stat-icon" style="background-image:url(${MC.makeRawIcon(kind)})"></div>`;
      }
      this.el.hunger.innerHTML = html;
    }

    setAir(ratio) {
      const bar = this.el.airbar;
      if (!bar) return;
      if (ratio < 0) { bar.style.display = 'none'; return; }
      if (Math.abs(ratio - this.lastAir) < 0.01) return;
      this.lastAir = ratio;
      bar.style.display = 'flex';
      const shown = Math.ceil(ratio * 10);
      for (let i = 0; i < 10; i++) {
        bar.children[i].style.visibility = i < shown ? 'visible' : 'hidden';
      }
    }

    setDamageFlash(on) {
      this.el['damage-flash'].style.opacity = on ? '1' : '0';
    }

    setClock(text, isDay) {
      this.el['clock-text'].textContent = text;
      this.el['clock-icon'].textContent = isDay ? '☀' : '☾';
      this.el['clock-icon'].style.color = isDay ? '#ffd76a' : '#b9d4ff';
    }

    setWeather(label) {
      this.el['weather-text'].textContent = label;
    }

    shake(seconds) {
      this.game.shakeTime = Math.max(this.game.shakeTime, seconds);
    }

    // ---------------- 选择框 / 挖掘进度 ----------------
    setSelectionBox(target) {
      const sb = this.selectionBox;
      if (!target) { sb.visible = false; return; }
      sb.visible = true;
      sb.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    }

    setMiningProgress(p) {
      const wrap = this.el['mine-wrap'], fill = this.el['mine-fill'];
      if (!wrap) return;
      if (p <= 0) { wrap.style.opacity = '0'; fill.style.width = '0%'; return; }
      wrap.style.opacity = '1';
      fill.style.width = (p * 100).toFixed(1) + '%';
    }

    // ---------------- 提示 / 气泡 ----------------
    toast(msg, type) {
      const d = document.createElement('div');
      d.className = 'toast' + (type ? ' ' + type : '');
      d.textContent = msg;
      this.el['toast-wrap'].appendChild(d);
      const t = setTimeout(() => {
        d.style.transition = 'opacity .3s, transform .3s';
        d.style.opacity = '0';
        d.style.transform = 'translateX(16px)';
        setTimeout(() => d.remove(), 320);
      }, 2800);
      this.toastTimers.push(t);
      if (this.el['toast-wrap'].children.length > 6) {
        this.el['toast-wrap'].firstChild.remove();
      }
    }

    bubble(entity, text, ms) {
      const layer = this.el['bubble-layer'];
      if (!layer || !entity) return;
      const d = document.createElement('div');
      d.className = 'bubble';
      d.textContent = text;
      layer.appendChild(d);
      this.bubbles.push({ el: d, entity, until: performance.now() + (ms || 2600) });
    }

    updateBubbles(camera) {
      const now = performance.now();
      const v = new THREE.Vector3();
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        if (now > b.until || !b.entity || b.entity.removed) {
          b.el.remove();
          this.bubbles.splice(i, 1);
          continue;
        }
        const p = b.entity.pos;
        v.set(p.x, p.y + (b.entity.height || 1.8) + 0.5, p.z);
        v.project(camera);
        if (v.z > 1) { b.el.style.display = 'none'; continue; }
        b.el.style.display = 'block';
        b.el.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
        b.el.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
        const dist = camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z));
        b.el.style.opacity = dist > 30 ? '0' : (dist > 18 ? String(1 - (dist - 18) / 12) : '1');
      }
    }

    // ---------------- 背包 ----------------
    openInventory() {
      if (this.modal) return;
      this.modal = 'inventory';
      this.el['inventory-screen'].classList.remove('hidden');
      this.el.crosshair.style.display = 'none';
      this.refreshInventory();
      this.game.audio.play('click', { volume: 0.3 });
      this.game.releasePointer();
    }

    closeInventory() {
      if (this.modal !== 'inventory') return;
      this.modal = null;
      this.el['inventory-screen'].classList.add('hidden');
      this.el.crosshair.style.display = '';
      this.game.audio.play('click', { volume: 0.25 });
    }

    refreshInventory() {
      const player = this.game.player;
      const grid = this.el['inv-grid'];
      if (!grid) return;
      grid.innerHTML = '';
      const ids = Array.from(player.items.keys()).filter(id => player.countOf(id) > 0);
      ids.sort((a, b) => a - b);
      if (ids.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column:1/-1;color:#7f92a5;font-size:12px;padding:14px 4px;';
        empty.textContent = '背包空空如也，去砍树吧。';
        grid.appendChild(empty);
      }
      for (const id of ids) {
        const cell = document.createElement('div');
        cell.className = 'item-cell';
        cell.title = MC.labelOf(id);
        const icon = document.createElement('div');
        icon.className = 'icon';
        icon.style.backgroundImage = `url(${MC.icon(id)})`;
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = String(player.countOf(id));
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = MC.labelOf(id);
        cell.appendChild(icon);
        cell.appendChild(count);
        cell.appendChild(name);
        cell.addEventListener('click', () => {
          player.swapHotbarWithItem(id);
          this.refreshHotbar();
          this.refreshInventory();
          this.game.audio.play('click', { volume: 0.25 });
        });
        grid.appendChild(cell);
      }
      this.refreshRecipes();
    }

    refreshRecipes() {
      const list = this.el['recipe-list'];
      if (!list) return;
      list.innerHTML = '';
      const player = this.game.player;
      for (const r of MC.RECIPES) {
        const can = player.hasItems(r.cost);
        const row = document.createElement('div');
        row.className = 'recipe';
        const icon = document.createElement('div');
        icon.className = 'r-icon';
        icon.style.backgroundImage = `url(${MC.icon(r.out.id)})`;
        const info = document.createElement('div');
        info.className = 'r-info';
        const name = document.createElement('div');
        name.className = 'r-name';
        name.textContent = MC.labelOf(r.out.id) + (r.out.count > 1 ? ' ×' + r.out.count : '');
        const cost = document.createElement('div');
        cost.className = 'r-cost';
        cost.innerHTML = r.cost.map(c => `<b>${MC.labelOf(c.id)}</b>×${c.count}`).join(' + ');
        info.appendChild(name);
        info.appendChild(cost);
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = '合成';
        btn.disabled = !can;
        btn.addEventListener('click', () => {
          if (this.game.player.craft(r)) {
            this.refreshInventory();
            this.refreshHotbar();
          }
        });
        row.appendChild(icon);
        row.appendChild(info);
        row.appendChild(btn);
        list.appendChild(row);
      }
    }

    // ---------------- 任务 ----------------
    openQuests() {
      this.modal = 'quests';
      this.el['quest-screen'].classList.remove('hidden');
      this.el.crosshair.style.display = 'none';
      this.refreshQuests();
    }

    closeQuests() {
      this.modal = null;
      this.el['quest-screen'].classList.add('hidden');
      this.el.crosshair.style.display = '';
    }

    refreshQuests() {
      const list = this.el['quest-list'];
      if (!list) return;
      const rep = this.game.reputation;
      const info = this.game.repInfo();
      this.el['quest-rep'].textContent = `村民好感 ${rep} · ${info.label}` + (info.discount ? `（交易便宜 ${info.discount} 个材料）` : '');
      list.innerHTML = '';
      const items = this.game.quests.list;
      for (const q of items) {
        const row = document.createElement('div');
        row.className = 'quest-row' + (q.done ? ' done' : '');
        const mark = document.createElement('div');
        mark.className = 'quest-mark';
        mark.textContent = q.done ? '✓' : '○';
        const body = document.createElement('div');
        body.className = 'quest-body';
        const title = document.createElement('div');
        title.className = 'quest-title';
        title.textContent = q.title;
        const desc = document.createElement('div');
        desc.className = 'quest-desc';
        desc.textContent = q.desc;
        const reward = document.createElement('div');
        reward.className = 'quest-reward';
        reward.textContent = '奖励：' + q.rewardText;
        body.appendChild(title); body.appendChild(desc); body.appendChild(reward);
        row.appendChild(mark); row.appendChild(body);
        list.appendChild(row);
      }
    }

    // ---------------- 箱子 ----------------
    makeCell(id, count, onClick, big) {
      const cell = document.createElement('div');
      cell.className = 'item-cell' + (big ? ' big' : '');
      cell.title = MC.labelOf(id);
      if (id) {
        const icon = document.createElement('div');
        icon.className = 'icon';
        icon.style.backgroundImage = `url(${MC.icon(id)})`;
        cell.appendChild(icon);
        if (count > 1) {
          const c = document.createElement('span');
          c.className = 'count';
          c.textContent = String(count);
          cell.appendChild(c);
        }
      }
      if (onClick) cell.addEventListener('click', onClick);
      return cell;
    }

    openChest(key) {
      this.chestKey = key;
      this.modal = 'chest';
      this.el['chest-screen'].classList.remove('hidden');
      this.el.crosshair.style.display = 'none';
      this.refreshChest();
      this.game.audio.play('chest_open', { volume: 0.4 });
    }

    closeChest() {
      this.modal = null;
      this.chestKey = null;
      this.el['chest-screen'].classList.add('hidden');
      this.el.crosshair.style.display = '';
      this.game.audio.play('chest_close', { volume: 0.35 });
    }

    chestSlots() {
      return this.game.chests.get(this.chestKey) || new Array(27).fill(null);
    }

    chestStore(id, count) {
      const slots = this.chestSlots();
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] && slots[i].id === id && slots[i].count < 64) {
          const can = Math.min(64 - slots[i].count, count);
          slots[i].count += can; count -= can;
          if (count <= 0) return true;
        }
      }
      for (let i = 0; i < slots.length; i++) {
        if (!slots[i]) { slots[i] = { id: id, count: count }; return true; }
      }
      return false;
    }

    refreshChest() {
      if (!this.chestKey) return;
      const slots = this.chestSlots();
      const grid = this.el['chest-grid'];
      grid.innerHTML = '';
      for (let i = 0; i < 27; i++) {
        const slot = slots[i];
        const cell = this.makeCell(slot ? slot.id : 0, slot ? slot.count : 0, slot ? () => {
          const s = this.chestSlots()[i];
          if (!s) return;
          this.game.player.addItem(s.id, s.count);
          this.chestSlots()[i] = null;
          this.refreshChest();
          this.game.audio.play('click', { volume: 0.25 });
        } : null);
        grid.appendChild(cell);
      }
      const inv = this.el['chest-inv-grid'];
      inv.innerHTML = '';
      const player = this.game.player;
      for (const id of Array.from(player.items.keys())) {
        const count = player.countOf(id);
        if (count <= 0) continue;
        inv.appendChild(this.makeCell(id, count, () => {
          if (this.chestStore(id, player.countOf(id))) {
            player.items.delete(id);
            this.refreshChest();
            this.refreshHotbar();
            this.game.audio.play('click', { volume: 0.25 });
          } else {
            this.game.ui.toast('箱子满了', 'warn');
          }
        }));
      }
    }

    chestTakeAll() {
      if (!this.chestKey) return;
      const slots = this.chestSlots();
      for (let i = 0; i < slots.length; i++) {
        if (slots[i]) { this.game.player.addItem(slots[i].id, slots[i].count); slots[i] = null; }
      }
      this.refreshChest();
    }

    chestPutAll() {
      if (!this.chestKey) return;
      const player = this.game.player;
      for (const id of Array.from(player.items.keys())) {
        const count = player.countOf(id);
        if (count > 0 && this.chestStore(id, count)) player.items.delete(id);
      }
      this.refreshChest();
      this.refreshHotbar();
    }

    // ---------------- 熔炉 ----------------
    openFurnace(key) {
      this.furnaceKey = key;
      this.modal = 'furnace';
      this.el['furnace-screen'].classList.remove('hidden');
      this.el.crosshair.style.display = 'none';
      this.refreshFurnace();
    }

    closeFurnace() {
      this.modal = null;
      this.furnaceKey = null;
      this.el['furnace-screen'].classList.add('hidden');
      this.el.crosshair.style.display = '';
      this.game.audio.play('chest_close', { volume: 0.35, pitch: 0.8 });
    }

    furnaceState() {
      return this.game.furnaces.get(this.furnaceKey) || { input: null, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 };
    }

    refreshFurnace() {
      if (!this.furnaceKey) return;
      const st = this.furnaceState();
      const player = this.game.player;
      const input = this.el['furnace-input'];
      const fuel = this.el['furnace-fuel'];
      const output = this.el['furnace-output'];
      const slotCell = (el, slot, onClick) => {
        el.innerHTML = '';
        el.style.backgroundImage = '';
        if (slot) {
          el.appendChild(this.makeCell(slot.id, slot.count, onClick, true)).style.position = 'absolute';
        }
      };
      // 直接重建单元格内容
      [input, fuel, output].forEach(el => { el.innerHTML = ''; });
      if (st.input) input.appendChild(this.makeCell(st.input.id, st.input.count, () => {
        player.addItem(st.input.id, st.input.count); st.input = null; this.refreshFurnace();
      }, true));
      if (st.fuel) fuel.appendChild(this.makeCell(st.fuel.id, st.fuel.count, () => {
        player.addItem(st.fuel.id, st.fuel.count); st.fuel = null; this.refreshFurnace();
      }, false));
      if (st.output) output.appendChild(this.makeCell(st.output.id, st.output.count, () => {
        player.addItem(st.output.id, st.output.count); st.output = null; this.refreshFurnace();
      }, true));

      const smelt = st.input ? MC.smeltOf(st.input.id) : null;
      const fill = this.el['smelt-fill'];
      if (fill) fill.style.width = (smelt ? Math.min(100, st.progress / smelt.time * 100) : 0) + '%';
      const burn = this.el['burn-fill'];
      if (burn) burn.style.width = (st.burnMax ? Math.min(100, st.burn / st.burnMax * 100) : 0) + '%';

      const inv = this.el['furnace-inv-grid'];
      inv.innerHTML = '';
      for (const id of Array.from(player.items.keys())) {
        const count = player.countOf(id);
        if (count <= 0) continue;
        inv.appendChild(this.makeCell(id, count, () => {
          if (MC.smeltOf(id)) {
            if (!st.input) st.input = { id: id, count: 0 };
            if (st.input.id !== id) { this.game.ui.toast('原料槽已有别的物品', 'warn'); return; }
            st.input.count += count;
            player.items.delete(id);
          } else if (MC.fuelOf(id) > 0) {
            if (!st.fuel) st.fuel = { id: id, count: 0 };
            if (st.fuel.id !== id) { this.game.ui.toast('燃料槽已有别的物品', 'warn'); return; }
            st.fuel.count += count;
            player.items.delete(id);
          } else {
            this.game.ui.toast('这个物品不能熔炼，也不能当燃料', 'warn');
            return;
          }
          this.refreshFurnace();
          this.refreshHotbar();
          this.game.audio.play('click', { volume: 0.25 });
        }));
      }
    }

    // ---------------- 交易 ----------------
    openTrade(villager) {
      if (this.modal) return;
      this.modal = 'trade';
      this.tradeVillager = villager;
      villager.tradeActive = true;
      this.el['trade-screen'].classList.remove('hidden');
      this.el.crosshair.style.display = 'none';
      const repInfo = this.game.repInfo();
      this.el['trade-title'].textContent = `${villager.name} · ${villager.professionLabel} · 好感 ${this.game.reputation}（${repInfo.label}）`;
      this.refreshTrade();
      this.game.audio.play('villager_hmm', { volume: 0.35 });
      this.game.releasePointer();
      this.game.audio.play('trade', { volume: 0.4 });
    }

    closeTrade() {
      if (this.modal !== 'trade') return;
      if (this.tradeVillager) this.tradeVillager.tradeActive = false;
      this.modal = null;
      this.tradeVillager = null;
      this.el['trade-screen'].classList.add('hidden');
      this.el.crosshair.style.display = '';
      this.game.audio.play('click', { volume: 0.25 });
    }

    refreshTrade() {
      const v = this.tradeVillager;
      const body = this.el['trade-body'];
      if (!v || !body) return;
      body.innerHTML = '';
      if (v.angry > 0) {
        const note = document.createElement('div');
        note.style.cssText = 'padding:10px;color:#e9a0a0;font-size:13px;';
        note.textContent = '（他还在生气，暂时不愿意交易。）';
        body.appendChild(note);
      }
      const info = this.game.repInfo();
      const giveCost = (t) => this.game.tradeGiveCount(t);
      v.trades.forEach((t, idx) => {
        const cost = giveCost(t);
        const can = Math.min(this.game.player.countOf(t.give.id), 64) >= cost && t.usesLeft > 0 && v.angry <= 0;
        const row = document.createElement('div');
        row.className = 'trade-offer' + (can ? '' : ' disabled');
        const gi = document.createElement('div');
        gi.className = 't-icon';
        gi.style.backgroundImage = `url(${MC.icon(t.give.id)})`;
        const arrow = document.createElement('div');
        arrow.className = 't-arrow';
        arrow.textContent = '→';
        const ri = document.createElement('div');
        ri.className = 't-icon';
        ri.style.backgroundImage = `url(${MC.icon(t.get.id)})`;
        const desc = document.createElement('div');
        desc.className = 't-desc';
        const disc = cost < t.give.count ? ` <s>${t.give.count}</s>` : '';
        desc.innerHTML = `用 <b>${MC.labelOf(t.give.id)} ×${cost}</b>${disc} 换 <b>${MC.labelOf(t.get.id)} ×${t.get.count}</b><br><small>今日剩余 ${t.usesLeft} 次 · 好感 ${this.game.reputation}（${info.label}）</small>`;
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = '交易';
        btn.disabled = !can;
        btn.addEventListener('click', () => this.performTrade(idx));
        row.appendChild(gi);
        row.appendChild(arrow);
        row.appendChild(ri);
        row.appendChild(desc);
        row.appendChild(btn);
        body.appendChild(row);
      });
    }

    performTrade(idx) {
      const v = this.tradeVillager;
      if (!v || this.modal !== 'trade') return;
      const t = v.trades[idx];
      if (!t || t.usesLeft <= 0 || v.angry > 0) return;
      const player = this.game.player;
      const cost = this.game.tradeGiveCount(t);
      if (player.countOf(t.give.id) < cost) {
        this.toast('材料不够', 'warn');
        return;
      }
      player.consume([{ id: t.give.id, count: cost }]);
      const bonus = this.game.repInfo().bonus ? 1 : 0;
      player.addItem(t.get.id, t.get.count + bonus);
      t.usesLeft--;
      this.game.stats.trades++;
      this.game.audio.play('emerald', { volume: 0.5 });
      this.toast(`交易成功：获得 ${MC.labelOf(t.get.id)} ×${t.get.count + bonus}`, 'good');
      this.game.reputation = Math.min(100, this.game.reputation + 2);
      this.refreshTrade();
      this.refreshHotbar();
      if (this.modal === 'inventory') this.refreshInventory();
    }

    // ---------------- 其他界面 ----------------
    showDeath(reason) {
      this.el['death-msg'].textContent = '你被' + reason + '击倒了。';
      this.el['death-screen'].classList.remove('hidden');
      this.el.crosshair.style.display = 'none';
      this.game.releasePointer();
    }
    hideDeath() {
      this.el['death-screen'].classList.add('hidden');
      this.el.crosshair.style.display = '';
    }

    setDebug(text) {
      this.el.debug.textContent = text;
    }

    toggleDebug() {
      this.el.debug.classList.toggle('hidden');
    }

    update(dt, camera) {
      this.updateBubbles(camera);
      this.updateMinimap(dt);
      if (this.modal === 'furnace') {
        this.furnaceViewTimer -= dt;
        if (this.furnaceViewTimer <= 0) { this.furnaceViewTimer = 0.25; this.refreshFurnace(); }
      }
      const player = this.game.player;
      if (!player) return;
      if (this.lastSelected !== player.selected) this.refreshHotbar();
      // 水下色罩
      this.el['underwater-tint'].classList.toggle('hidden', !player.headInWater);
      // 调试
      this.debugTimer -= dt;
      if (this.debugTimer <= 0) {
        this.debugTimer = 0.25;
        if (!this.el.debug.classList.contains('hidden')) {
          const p = player.pos;
          const info = [
            `FPS ${this.game.fps.toFixed(0)}  区块 ${this.game.world.chunks.size}`,
            `坐标 ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}`,
            `群系 ${this.game.world.biomeAt(Math.floor(p.x), Math.floor(p.z))}  时间 ${this.game.nature.clockText}`,
            `天气 ${this.game.nature.weatherLabel}  实体 ${this.game.entities.list.length}`,
            `村民 ${this.game.villagers.list.length}  好感 ${this.game.reputation}`,
            `种子 ${this.game.world.seed}`
          ];
          this.setDebug(info.join('\n'));
        }
      }
    }
  }

  MC.UI = UI;
})();