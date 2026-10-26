/* =========================================================
 *  pathfinder.js — 共享 A* 寻路（村民 / 僵尸 / 任务引导）
 *  方块坐标：节点 {x,y,z} 表示“脚所在方块”，y-1 必须是实心地面。
 * =======================================================*/
(function () {
  'use strict';

  const B = () => MC.B;

  function passThrough(id) {
    if (id === MC.B.AIR) return true;
    if (id === MC.B.TORCH || id === MC.B.FIRE) return true;
    if (MC.isCross && MC.isCross(id)) return true;
    return !MC.isSolid(id);
  }

  function walkable(world, x, y, z) {
    const feet = world.getBlockFast(x, y, z);
    const head = world.getBlockFast(x, y + 1, z);
    if (!passThrough(feet) || !passThrough(head)) return false;
    const ground = world.getBlockFast(x, y - 1, z);
    if (!MC.isSolid(ground)) return false;
    if (ground === MC.B.WATER) return false;
    if (feet === MC.B.WATER || head === MC.B.WATER) return false;
    return true;
  }

  function find(world, start, goal, opts) {
    opts = opts || {};
    const maxNodes = opts.maxNodes || 1200;
    if (!world || !start || !goal) return null;
    const sx = Math.floor(start.x), sz = Math.floor(start.z);
    let sy = Math.floor(start.y);
    let gx = Math.floor(goal.x), gz = Math.floor(goal.z);
    let gy = goal.y !== undefined ? Math.floor(goal.y) : (world.surfaceY(gx, gz) + 1);
    // 目标点不可站立时向下/向上找一格
    if (!walkable(world, gx, gy, gz)) {
      let fixed = false;
      for (let dy = 1; dy <= 3 && !fixed; dy++) {
        if (walkable(world, gx, gy + dy, gz)) { gy += dy; fixed = true; }
        else if (walkable(world, gx, gy - dy, gz)) { gy -= dy; fixed = true; }
      }
      if (!fixed) return null;
    }
    if (!walkable(world, sx, sy, sz)) {
      let fixed = false;
      for (let dy = 1; dy <= 3 && !fixed; dy++) {
        if (walkable(world, sx, sy + dy, sz)) { sy += dy; fixed = true; }
      }
      if (!fixed) return null;
    }

    const key = (x, y, z) => x + ',' + y + ',' + z;
    const open = [];
    const nodes = new Map();
    const h = (x, y, z) => (Math.abs(x - gx) + Math.abs(z - gz)) + Math.abs(y - gy) * 0.6;
    const startNode = { x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), parent: null, closed: false };
    nodes.set(key(sx, sy, sz), startNode);
    open.push(startNode);
    let expanded = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (open.length && expanded < maxNodes) {
      // 取 f 最小
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.x === gx && cur.z === gz && cur.y === gy) return buildPath(cur);
      if (cur.closed) continue;
      cur.closed = true;
      expanded++;

      for (const [dx, dz] of dirs) {
        const nx = cur.x + dx, nz = cur.z + dz;
        // 依次尝试：同层、向上 1 格台阶、向下 1~3 格
        const candidates = [];
        if (walkable(world, nx, cur.y, nz)) candidates.push({ y: cur.y, cost: 1 });
        if (walkable(world, nx, cur.y + 1, nz)) candidates.push({ y: cur.y + 1, cost: 1.35 });
        for (let d = 1; d <= 3; d++) {
          if (walkable(world, nx, cur.y - d, nz)) { candidates.push({ y: cur.y - d, cost: 1 + d * 0.15 }); break; }
        }
        for (const c of candidates) {
          const k = key(nx, c.y, nz);
          if (nodes.has(k) && nodes.get(k).closed) continue;
          const g = cur.g + c.cost;
          const existing = nodes.get(k);
          if (existing && existing.g <= g) continue;
          const node = existing || { x: nx, y: c.y, z: nz, closed: false };
          node.g = g;
          node.f = g + h(nx, c.y, nz);
          node.parent = cur;
          nodes.set(k, node);
          if (existing) { // 更新已存在节点
            node.f = g + h(nx, c.y, nz);
          } else {
            open.push(node);
          }
        }
      }
    }
    return null;
  }

  function buildPath(node) {
    const path = [];
    let cur = node;
    while (cur && cur.parent) {
      path.push({ x: cur.x, y: cur.y, z: cur.z });
      cur = cur.parent;
    }
    path.reverse();
    return path;
  }

  // 把世界坐标转成脚下方块坐标
  function fromPos(pos) { return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }; }

  MC.Pathfinder = { find: find, walkable: walkable, fromPos: fromPos };
})();