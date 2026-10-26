/* =========================================================
 *  world.js — 体素世界：地形、群系、树木、矿脉、村庄、区块网格
 * =======================================================*/
(function () {
  'use strict';
  const CH = 16, HEIGHT = 64, SEA = 30, CHUNK_AREA = CH * CH, CHUNK_VOL = CHUNK_AREA * HEIGHT;
  const B = MC.B;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------- 噪声 ----------------
  function hash2i(x, z, seed) {
    let h = seed | 0;
    h = Math.imul(h ^ (x | 0), 374761393);
    h = Math.imul(h ^ (z | 0), 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash3i(x, y, z, seed) {
    let h = seed | 0;
    h = Math.imul(h ^ (x | 0), 374761393);
    h = Math.imul(h ^ (y | 0), 668265263);
    h = Math.imul(h ^ (z | 0), 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const smoothstep = (t) => t * t * (3 - 2 * t);
  function noise2(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = smoothstep(xf), v = smoothstep(zf);
    const a = hash2i(xi, zi, seed), b = hash2i(xi + 1, zi, seed);
    const c = hash2i(xi, zi + 1, seed), d = hash2i(xi + 1, zi + 1, seed);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function noise3(x, y, z, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = smoothstep(xf), v = smoothstep(yf), w = smoothstep(zf);
    const c000 = hash3i(xi, yi, zi, seed), c100 = hash3i(xi + 1, yi, zi, seed);
    const c010 = hash3i(xi, yi + 1, zi, seed), c110 = hash3i(xi + 1, yi + 1, zi, seed);
    const c001 = hash3i(xi, yi, zi + 1, seed), c101 = hash3i(xi + 1, yi, zi + 1, seed);
    const c011 = hash3i(xi, yi + 1, zi + 1, seed), c111 = hash3i(xi + 1, yi + 1, zi + 1, seed);
    const x00 = c000 * (1 - u) + c100 * u, x10 = c010 * (1 - u) + c110 * u;
    const x01 = c001 * (1 - u) + c101 * u, x11 = c011 * (1 - u) + c111 * u;
    const y0 = x00 * (1 - v) + x10 * v, y1 = x01 * (1 - v) + x11 * v;
    return y0 * (1 - w) + y1 * w;
  }
  function fbm2(x, z, seed, oct, lac, gain) {
    oct = oct || 4; lac = lac || 2; gain = gain || 0.5;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise2(x * freq, z * freq, seed + i * 1013);
      norm += amp;
      amp *= gain; freq *= lac;
    }
    return sum / norm;
  }

  // ---------------- 材质 ----------------
  let MAT = null;
  function materials() {
    if (MAT) return MAT;
    const tex = MC.atlasTexture;
    MAT = {
      opaque: new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }),
      cross: new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      water: new THREE.MeshLambertMaterial({
        map: tex, vertexColors: true, transparent: true, opacity: 0.72,
        depthWrite: false, side: THREE.DoubleSide
      })
    };
    return MAT;
  }

  // ---------------- 面定义 ----------------
  const FACE_DEFS = [
    { dir: [1, 0, 0], corners: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]], uvs: [[0, 1], [0, 0], [1, 0], [1, 1]], shade: 0.82 },
    { dir: [-1, 0, 0], corners: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], uvs: [[0, 1], [0, 0], [1, 0], [1, 1]], shade: 0.74 },
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 1.0 },
    { dir: [0, -1, 0], corners: [[1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0]], uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.5 },
    { dir: [0, 0, 1], corners: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]], uvs: [[0, 1], [0, 0], [1, 0], [1, 1]], shade: 0.9 },
    { dir: [0, 0, -1], corners: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]], uvs: [[0, 1], [0, 0], [1, 0], [1, 1]], shade: 0.62 }
  ];
  const AO_LEVELS = [0.45, 0.65, 0.85, 1.0];

  function tileUV(tile) {
    const tx = tile % 16, ty = (tile / 16) | 0;
    const pad = 0.35 / 256;
    return { u0: tx / 16 + pad, u1: (tx + 1) / 16 - pad, v0: 1 - (ty + 1) / 16 + pad, v1: 1 - ty / 16 - pad };
  }
  const UV_CACHE = {};
  function uvOf(tile) { return UV_CACHE[tile] || (UV_CACHE[tile] = tileUV(tile)); }

  // =======================================================
  class World {
    constructor(scene, seed, saved) {
      this.scene = scene;
      this.seed = seed >>> 0;
      this.chunks = new Map();
      this.chunkGroup = new THREE.Group();
      this.chunkGroup.name = 'chunks';
      scene.add(this.chunkGroup);
      this.renderDist = 5;
      this.mods = new Map();          // "x,y,z" -> blockId
      this.modsByChunk = new Map();   // chunkKey -> Map(index -> id)
      this.torches = new Set();
      this._loadQueue = [];
      this._meshQueue = [];
      this.centerCx = null;
      this.centerCz = null;
      this.pending = true;
      this._buildMaterials = materials();

      this.village = this._buildVillage();
      this.spawn = this._findSpawn();

      if (saved && saved.mods) this.loadMods(saved.mods);
    }

    // ------------------- 地形高度 -------------------
    baseHeight(x, z) {
      const continent = fbm2(x * 0.006, z * 0.006, this.seed + 101, 3, 2, 0.55) - 0.5;
      const hills = fbm2(x * 0.022, z * 0.022, this.seed + 202, 4, 2, 0.5) - 0.5;
      const detail = fbm2(x * 0.075, z * 0.075, this.seed + 303, 2, 2, 0.5) - 0.5;
      const mountainMask = fbm2(x * 0.0038, z * 0.0038, this.seed + 404, 3, 2, 0.5);
      const mount = Math.max(0, Math.min(1, (mountainMask - 0.585) / 0.12));
      let h = 31 + continent * 30 + hills * 18 + detail * 3 + Math.pow(mount, 1.7) * 32;
      return clamp(Math.round(h), 5, HEIGHT - 9);
    }

    // 村庄平整后的地形高度（区块生成与实体使用同一函数）
    terrainHeight(x, z) {
      const v = this.village;
      if (!v) return this.baseHeight(x, z);
      const dx = x - v.center.x, dz = z - v.center.z;
      const r = Math.sqrt(dx * dx + dz * dz);
      const base = this.baseHeight(x, z);
      if (r <= 26) return v.groundY;
      if (r >= 40) return base;
      const t = smoothstep((r - 26) / 14);
      return Math.round(v.groundY * (1 - t) + base * t);
    }

    inVillage(x, z, margin) {
      const v = this.village;
      const m = margin || 0;
      const dx = x - v.center.x, dz = z - v.center.z;
      return dx * dx + dz * dz <= (30 + m) * (30 + m);
    }

    biomeAt(x, z) {
      const h = this.baseHeight(x, z);
      if (h < SEA) return 'ocean';
      if (h <= SEA + 1) return 'beach';
      const t = fbm2(x * 0.0032, z * 0.0032, this.seed + 505, 3, 2, 0.5);
      const m = fbm2(x * 0.0041, z * 0.0041, this.seed + 606, 3, 2, 0.5);
      const mountMask = fbm2(x * 0.0045, z * 0.0045, this.seed + 404, 3, 2, 0.5);
      if (h > SEA + 12 || mountMask > 0.64) return 'mountain';
      if (t > 0.6 && m < 0.45) return 'desert';
      if (m > 0.56) return 'forest';
      return 'plains';
    }

    // ------------------- 村庄规划 -------------------
    _findVillageCenter() {
      // 从原点向外寻找一块足够平坦、不会被水淹的台地
      const candidates = [];
      for (let i = 0; i < 96; i++) {
        const ang = i * 2.399963; // 黄金角螺旋
        const rad = 8 + i * 5.5;
        candidates.push([Math.round(Math.cos(ang) * rad), Math.round(Math.sin(ang) * rad)]);
      }
      candidates.unshift([0, 0]);
      for (const [x, z] of candidates) {
        let minH = 999, maxH = -999, ok = true;
        for (let dx = -34; dx <= 34; dx += 6) {
          for (let dz = -34; dz <= 34; dz += 6) {
            if (dx * dx + dz * dz > 34 * 34) continue;
            const h = this.baseHeight(x + dx, z + dz);
            if (h <= SEA + 1) { ok = false; break; }
            minH = Math.min(minH, h); maxH = Math.max(maxH, h);
          }
          if (!ok) break;
        }
        if (ok && maxH - minH <= 10) return { x, z, groundY: clamp(Math.round(this.baseHeight(x, z)), SEA + 2, 40) };
      }
      return { x: 0, z: 0, groundY: clamp(this.baseHeight(0, 0), SEA + 2, 40) };
    }

    _buildVillage() {
      const found = this._findVillageCenter();
      const v = {
        center: { x: found.x, z: found.z },
        groundY: found.groundY,
        plazaR: 6,
        houses: [],
        beds: [],
        farms: [],
        torches: [],
        smithy: null,
        structBlocks: new Map()
      };
      this.village = v; // terrainHeight 需要
      const y = v.groundY;
      const put = (x, yy, z, id) => {
        v.structBlocks.set(`${x},${yy},${z}`, id);
        if (id === B.TORCH) v.torches.push([x, yy, z]);
      };

      // 广场
      for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) put(x, y, z, B.GRAVEL);

      // 道路（从每扇门通向中心）
      const pathTo = (x0, z0) => {
        const steps = Math.max(Math.abs(x0), Math.abs(z0)) * 2 + 2;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = Math.round(x0 * (1 - t));
          const z = Math.round(z0 * (1 - t));
          put(x, y, z, B.GRAVEL);
          put(x + 1, y, z, B.GRAVEL);
          put(x, y, z + 1, B.GRAVEL);
        }
      };

      // 房屋
      const buildHouse = (cx, cz, w, d, doorDir, opts) => {
        opts = opts || {};
        const x0 = cx - (w >> 1), x1 = x0 + w - 1;
        const z0 = cz - (d >> 1), z1 = z0 + d - 1;
        const floorY = y, wallY = y + 1, roofY = y + 4;
        // 地板
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) put(x, floorY, z, B.PLANKS);
        // 墙
        for (let x = x0; x <= x1; x++) {
          for (let z = z0; z <= z1; z++) {
            if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
            for (let yy = wallY; yy <= y + 3; yy++) {
              put(x, yy, z, yy === wallY ? B.COBBLE : B.PLANKS);
            }
          }
        }
        // 门
        const doorX = opts.doorX !== undefined ? opts.doorX : cx;
        const doorZ = opts.doorZ !== undefined ? opts.doorZ : cz;
        put(doorX, wallY, doorZ, B.AIR);
        put(doorX, wallY + 1, doorZ, B.AIR);
        // 窗户
        const winY = wallY + 1;
        const wx = Math.min(x0 + 1, x1 - 1), wz = Math.min(z0 + 1, z1 - 1);
        for (let x = x0 + 2; x <= x1 - 2; x += 2) {
          put(x, winY, z0, B.GLASS);
          put(x, winY, z1, B.GLASS);
        }
        for (let z = z0 + 2; z <= z1 - 2; z += 2) {
          put(x0, winY, z, B.GLASS);
          put(x1, winY, z, B.GLASS);
        }
        // 清理门窗位置
        put(doorX, wallY, doorZ, B.AIR);
        put(doorX, wallY + 1, doorZ, B.AIR);
        // 屋顶（稍微出檐）+ 屋脊
        for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) put(x, roofY, z, B.PLANKS);
        for (let x = x0; x <= x1; x++) put(x, roofY + 1, cz, B.PLANKS);

        // 清理室内空间（含地表装饰）
        for (let x = x0 + 1; x <= x1 - 1; x++) {
          for (let z = z0 + 1; z <= z1 - 1; z++) {
            for (let yy = wallY; yy <= y + 3; yy++) put(x, yy, z, B.AIR);
          }
        }
        // 室内：床
        const beds = opts.beds || 1;
        for (let i = 0; i < beds; i++) {
          const bx = x0 + 1 + (i % 2), bz = z0 + 1 + ((i / 2) | 0);
          put(bx, wallY, bz, B.BED);
          v.beds.push({ x: bx, y: wallY, z: bz });
        }
        // 火把
        const tx = x0 + 1, tz = z0 + 1;
        put(x1 - 1, wallY, z1 - 1, B.TORCH);
        // 工作台
        if (opts.crafting) put(x1 - 1, wallY, z0 + 1, B.CRAFTING);
        // 书架
        let shelf = null;
        if (opts.shelf) { put(x0, wallY + 1, z0, B.BOOKSHELF); shelf = { x: x0, y: wallY + 1, z: z0 }; }
        // 铁砧
        let anvil = null;
        if (opts.anvil) { put(cx, wallY, cz + 1, B.ANVIL); anvil = { x: cx, y: wallY, z: cz + 1 }; }

        // 门口标记 + 清空门上方
        const door = { x: doorX, z: doorZ };
        v.houses.push({ cx, cz, x0, x1, z0, z1, door, beds, shelf, anvil, floorY });
        return v.houses[v.houses.length - 1];
      };

      // A：农夫
      const houseA = buildHouse(-14, -11, 7, 6, null, { doorX: -11, doorZ: -11, beds: 1, crafting: true });
      // B：图书管理员
      const houseB = buildHouse(14, -11, 7, 6, null, { doorX: 11, doorZ: -11, beds: 1, shelf: true });
      // C：屠夫（两张床）
      const houseC = buildHouse(13, 11, 7, 6, null, { doorX: 10, doorZ: 10, beds: 2 });
      // D：农夫 2 / 备用
      const houseD = buildHouse(-13, 11, 7, 6, null, { doorX: -10, doorZ: 10, beds: 2 });
      // 铁匠铺
      const smithy = buildHouse(0, -16, 9, 8, null, { doorX: 0, doorZ: -13, beds: 1, anvil: true, crafting: true });
      v.smithy = smithy;

      // 农田（村庄东侧）
      const fx0 = 10, fx1 = 20, fz0 = -4, fz1 = 6;
      for (let x = fx0; x <= fx1; x++) {
        for (let z = fz0; z <= fz1; z++) {
          if (x === 13 || x === 17) {
            put(x, y, z, B.WATER);
          } else {
            put(x, y, z, B.FARMLAND_WET);
            if (hash2i(x, z, this.seed + 8181) < 0.88) {
              const stage = 1 + ((hash2i(x, z, this.seed + 9191) * 3) | 0);
              put(x, y + 1, z, B.WHEAT0 + Math.min(stage, 3));
            }
          }
        }
      }
      v.farms.push({ x0: fx0, x1: fx1, z0: fz0, z1: fz1, center: { x: 15, z: 1 } });

      // 水井
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
        const edge = Math.abs(x) === 2 || Math.abs(z) === 2;
        if (edge) { put(x, y, z, B.COBBLE); put(x, y + 1, z, B.COBBLE); }
        else put(x, y, z, B.WATER);
      }
      // 广场火把柱
      for (const [lx, lz] of [[-8, -8], [8, -8], [-8, 7], [8, 7]]) {
        put(lx, y + 1, lz, B.LOG);
        put(lx, y + 2, lz, B.LOG);
        put(lx, y + 3, lz, B.TORCH);
      }

      // 门到广场的路
      pathTo(-11, -11);
      pathTo(11, -11);
      pathTo(10, 10);
      pathTo(-10, 10);
      pathTo(0, -13);
      pathTo(9, 1);

      // 村庄布局是围绕局部原点设计的：整体平移到实际村庄中心
      const OX = v.center.x, OZ = v.center.z;
      if (OX !== 0 || OZ !== 0) {
        const shifted = new Map();
        for (const [key, id] of v.structBlocks) {
          const [x, yy, z] = key.split(',').map(Number);
          shifted.set(`${x + OX},${yy},${z + OZ}`, id);
        }
        v.structBlocks = shifted;
        v.structByChunk = null;
        for (const h of v.houses) {
          h.cx += OX; h.cz += OZ;
          h.x0 += OX; h.x1 += OX; h.z0 += OZ; h.z1 += OZ;
          h.door.x += OX; h.door.z += OZ;
          if (h.shelf) { h.shelf.x += OX; h.shelf.z += OZ; }
          if (h.anvil) { h.anvil.x += OX; h.anvil.z += OZ; }
        }
        for (const b of v.beds) { b.x += OX; b.z += OZ; }
        for (const f of v.farms) { f.x0 += OX; f.x1 += OX; f.z0 += OZ; f.z1 += OZ; f.center.x += OX; f.center.z += OZ; }
        for (const t of v.torches) { t[0] += OX; t[2] += OZ; }
      }
      // 登记火把光源
      for (const t of v.torches) this.torches.add(`${t[0]},${t[1]},${t[2]}`);

      // 分块索引（加速区块生成时的结构叠加）
      v.structByChunk = new Map();
      for (const [key, id] of v.structBlocks) {
        const [x, yy, z] = key.split(',').map(Number);
        const cx = x >> 4, cz = z >> 4;
        const ck = cx + ',' + cz;
        let arr = v.structByChunk.get(ck);
        if (!arr) { arr = []; v.structByChunk.set(ck, arr); }
        arr.push([localIndex(x & 15, yy, z & 15), id]);
      }
      // 这是决定性的：村庄中心与出生点
      v.spawnPos = { x: v.center.x, z: v.center.z + 8 };
      return v;
    }

    _findSpawn() {
      const v = this.village;
      const x = v.spawnPos.x, z = v.spawnPos.z;
      const y = this.terrainHeight(x, z);
      return { x: x + 0.5, y: y + 1.02, z: z + 0.5 };
    }

    // ------------------- 区块数据 -------------------
    chunkKey(cx, cz) { return cx + ',' + cz; }
    getChunk(cx, cz) { return this.chunks.get(this.chunkKey(cx, cz)); }

    ensureChunk(cx, cz) {
      const key = this.chunkKey(cx, cz);
      let c = this.chunks.get(key);
      if (!c) {
        c = { cx, cz, key, blocks: null, generated: false, opaqueMesh: null, crossMesh: null, glowMesh: null, waterMesh: null, dirty: true };
        this.chunks.set(key, c);
        this._generateChunk(c);
      }
      return c;
    }

    _generateChunk(c) {
      const blocks = new Uint8Array(CHUNK_VOL);
      const baseX = c.cx * CH, baseZ = c.cz * CH;
      const seed = this.seed;
      const heights = new Int16Array(CHUNK_AREA);
      const biomes = new Array(CHUNK_AREA);

      for (let lz = 0; lz < CH; lz++) {
        for (let lx = 0; lx < CH; lx++) {
          const wx = baseX + lx, wz = baseZ + lz;
          const h = this.terrainHeight(wx, wz);
          const biome = this.biomeAt(wx, wz);
          const idx = lz * CH + lx;
          heights[idx] = h;
          biomes[idx] = biome;

          let topBlock, soilBlock, soilDepth;
          if (biome === 'ocean' || biome === 'beach') {
            topBlock = B.SAND; soilBlock = B.SAND; soilDepth = 3;
          } else if (biome === 'desert') {
            topBlock = B.SAND; soilBlock = B.SAND; soilDepth = 4;
          } else if (biome === 'mountain') {
            topBlock = h > 44 ? B.STONE : B.GRASS;
            soilBlock = h > 44 ? B.STONE : B.DIRT; soilDepth = h > 44 ? 1 : 2;
          } else {
            topBlock = B.GRASS; soilBlock = B.DIRT; soilDepth = 3;
          }

          for (let y = 0; y <= h; y++) {
            let id;
            if (y === 0) id = B.BEDROCK;
            else if (y >= h - soilDepth) id = y === h ? topBlock : soilBlock;
            else id = B.STONE;

            // 矿脉
            if (id === B.STONE) {
              const r = hash3i(wx, y, wz, seed + 1313);
              if (y < 44 && r < 0.012) id = B.COAL_ORE;
              else if (y < 30 && r > 0.988) id = B.IRON_ORE;
              else if (y < 16 && r > 0.9965) id = B.DIAMOND_ORE;
            }
            blocks[localIndex(lx, y, lz)] = id;
          }

          // 洞穴（隧道噪声），避开水面与村庄
          if (!this.inVillage(wx, wz, 0)) {
            const maxY = h - 3;
            for (let y = 4; y <= maxY; y++) {
              const n1 = noise3(wx * 0.055, y * 0.08, wz * 0.055, seed + 1717);
              const n2 = noise3(wx * 0.055 + 31.7, y * 0.08 + 17.3, wz * 0.055 + 53.1, seed + 1818);
              if (Math.abs(n1 - 0.5) < 0.045 && Math.abs(n2 - 0.5) < 0.045) {
                blocks[localIndex(lx, y, lz)] = B.AIR;
              }
            }
          }

          // 海洋 / 湖泊
          if (h < SEA) {
            for (let y = h + 1; y <= SEA; y++) blocks[localIndex(lx, y, lz)] = B.WATER;
          }

          // 地表装饰
          if (h >= SEA && biome !== 'ocean' && biome !== 'mountain') {
            if (topBlock === B.GRASS) {
              const r = hash2i(wx, wz, seed + 2121);
              if (r < 0.14) {
                if (r < 0.012) blocks[localIndex(lx, h + 1, lz)] = (hash2i(wx, wz, seed + 2323) < 0.5) ? B.FLOWER_RED : B.FLOWER_YELLOW;
                else blocks[localIndex(lx, h + 1, lz)] = B.TALL_GRASS;
              }
            }
          }
        }
      }

      // 村庄内清掉自然生长的植物（先清，再叠加村庄结构，避免误删农田作物）
      if (this.inVillage(baseX + 8, baseZ + 8, 0)) {
        for (let lz = 0; lz < CH; lz++) {
          for (let lx = 0; lx < CH; lx++) {
            const wx = baseX + lx, wz = baseZ + lz;
            if (!this.inVillage(wx, wz, 0)) continue;
            for (let yy = this.village.groundY + 1; yy < this.village.groundY + 7; yy++) {
              const idx = localIndex(lx, yy, lz);
              if (MC.isPlant(blocks[idx]) || blocks[idx] === B.TALL_GRASS) blocks[idx] = B.AIR;
            }
          }
        }
      }

      // 村庄结构叠加
      const structArr = this.village.structByChunk && this.village.structByChunk.get(c.key);
      if (structArr) {
        for (const [idx, id] of structArr) blocks[idx] = id;
      }

      // 树木（跨区块：扫描扩展范围，只写入本区块内的方块）
      const densityFor = (biome) => biome === 'forest' ? 0.045 : biome === 'plains' ? 0.005 : biome === 'mountain' ? 0.002 : 0;
      for (let lz = -3; lz < CH + 3; lz++) {
        for (let lx = -3; lx < CH + 3; lx++) {
          const wx = baseX + lx, wz = baseZ + lz;
          if (this.inVillage(wx, wz, 0)) continue;
          const biome = this.biomeAt(wx, wz);
          const density = densityFor(biome);
          if (density <= 0) continue;
          if (hash2i(wx, wz, seed + 3434) >= density) continue;
          const h = this.terrainHeight(wx, wz);
          if (h <= SEA + 1) continue;
          const trunkH = 4 + ((hash2i(wx, wz, seed + 3535) * 3) | 0);
          // 树干
          for (let dy = 1; dy <= trunkH; dy++) {
            const lx2 = wx - baseX, lz2 = wz - baseZ, yy = h + dy;
            if (lx2 >= 0 && lx2 < CH && lz2 >= 0 && lz2 < CH) blocks[localIndex(lx2, yy, lz2)] = B.LOG;
          }
          // 树叶（近似球形）
          for (let dy = trunkH - 3; dy <= trunkH; dy++) {
            const radius = dy >= trunkH - 1 ? 2 : 1;
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                if (Math.abs(dx) === radius && Math.abs(dz) === radius && hash2i(wx + dx, wz + dz, seed + 3636) < 0.5) continue;
                if (dy === trunkH && Math.abs(dx) + Math.abs(dz) > 2) continue;
                const lx2 = wx - baseX + dx, lz2 = wz - baseZ + dz;
                if (lx2 < 0 || lx2 >= CH || lz2 < 0 || lz2 >= CH) continue;
                const yy = h + dy;
                const idx = localIndex(lx2, yy, lz2);
                if (blocks[idx] === B.AIR) blocks[idx] = B.LEAVES;
              }
            }
          }
        }
      }

      // 应用玩家改动
      const modArr = this.modsByChunk.get(c.key);
      if (modArr) for (const [idx, id] of modArr) blocks[idx] = id;

      c.blocks = blocks;
      c.generated = true;
      c.dirty = true;
      c.heights = heights;
      this._meshQueue.push(c);
    }

    // ------------------- 方块访问 -------------------
    getBlock(x, y, z) {
      if (y < 0 || y >= HEIGHT) return 0;
      const cx = x >> 4, cz = z >> 4;
      const c = this.getChunk(cx, cz) || this.ensureChunk(cx, cz);
      return c.blocks[localIndex(x & 15, y, z & 15)];
    }
    getBlockFast(x, y, z) {
      if (y < 0 || y >= HEIGHT) return 0;
      const c = this.getChunk(x >> 4, z >> 4);
      if (!c || !c.generated) return 0;
      return c.blocks[localIndex(x & 15, y, z & 15)];
    }
    setBlock(x, y, z, id, record) {
      if (y < 0 || y >= HEIGHT) return;
      const cx = x >> 4, cz = z >> 4;
      const c = this.ensureChunk(cx, cz);
      const idx = localIndex(x & 15, y, z & 15);
      const old = c.blocks[idx];
      if (old === id) return;
      c.blocks[idx] = id;
      c.dirty = true;
      this._markNeighborDirty(x, z, cx, cz);
      if (record !== false) {
        const key = x + ',' + y + ',' + z;
        this.mods.set(key, id);
        let arr = this.modsByChunk.get(c.key);
        if (!arr) { arr = new Map(); this.modsByChunk.set(c.key, arr); }
        arr.set(idx, id);
      }
      if (id === B.TORCH || id === B.FURNACE_LIT) this.torches.add(x + ',' + y + ',' + z);
      else this.torches.delete(x + ',' + y + ',' + z);
      this._meshQueue.push(c);
      if (c.blocks) c.dirty = true;
    }
    _markNeighborDirty(x, z, cx, cz) {
      const lx = x & 15, lz = z & 15;
      const dirty = (ccx, ccz) => {
        const c = this.getChunk(ccx, ccz);
        if (c) { c.dirty = true; this._meshQueue.push(c); }
      };
      if (lx === 0) dirty(cx - 1, cz);
      if (lx === 15) dirty(cx + 1, cz);
      if (lz === 0) dirty(cx, cz - 1);
      if (lz === 15) dirty(cx, cz + 1);
    }

    isSolidAt(x, y, z) { return MC.isSolid(this.getBlock(x, y, z)); }
    isWaterAt(x, y, z) { return this.getBlock(x, y, z) === B.WATER; }

    heightAt(x, z) { return this.terrainHeight(x, z); }

    surfaceY(x, z) {
      const c = this.ensureChunk(x >> 4, z >> 4);
      const lx = x & 15, lz = z & 15;
      for (let y = HEIGHT - 1; y >= 0; y--) {
        const id = c.blocks[localIndex(lx, y, lz)];
        if (id !== B.AIR && id !== B.WATER && MC.isSolid(id)) return y;
      }
      return 0;
    }

    // ------------------- 区块网格 -------------------
    _buildMesh(c) {
      const blocks = c.blocks;
      if (!blocks) return;
      const baseX = c.cx * CH, baseZ = c.cz * CH;
      const geo = { opaque: newGeo(), cross: newGeo(), glow: newGeo(), water: newGeo() };
      const world = this;

      const localGet = (x, y, z) => {
        const lx = x - baseX, lz = z - baseZ;
        if (lx >= 0 && lx < CH && lz >= 0 && lz < CH) {
          if (y < 0 || y >= HEIGHT) return 0;
          return blocks[localIndex(lx, y, lz)];
        }
        return world.getBlock(x, y, z);
      };
      const opaqueAt = (x, y, z) => MC.isOpaque(localGet(x, y, z));

      for (let y = 0; y < HEIGHT; y++) {
        for (let lz = 0; lz < CH; lz++) {
          for (let lx = 0; lx < CH; lx++) {
            const id = blocks[localIndex(lx, y, lz)];
            if (id === B.AIR) continue;
            const wx = baseX + lx, wz = baseZ + lz;
            const def = MC.BLOCKS[id];
            if (!def) continue;

            // 十字形植物
            if (def.render === 'cross') {
              const target = def.glow ? geo.glow : geo.cross;
              addCross(target, wx, y, wz, def, def.glow ? 1 : def.shade || 1);
              continue;
            }

            // 液体
            if (def.render === 'liquid') {
              addLiquid(geo.water, blocks, world, lx, y, lz, wx, wz, id);
              continue;
            }

            // 立方体
            const tiles = def.tiles;
            for (let f = 0; f < 6; f++) {
              const face = FACE_DEFS[f];
              const nx = wx + face.dir[0], ny = y + face.dir[1], nz = wz + face.dir[2];
              const nid = localGet(nx, ny, nz);
              const ndef = MC.BLOCKS[nid];
              let visible;
              if (!ndef) visible = true;
              else if (ndef.opaque) visible = false;
              else if (nid === id) visible = false;
              else visible = true;
              if (!visible) continue;

              let tile;
              if (f === 2) tile = tiles.top !== undefined ? tiles.top : (tiles.all !== undefined ? tiles.all : tiles.side);
              else if (f === 3) tile = tiles.bottom !== undefined ? tiles.bottom : (tiles.all !== undefined ? tiles.all : tiles.side);
              else if (f === 4 && tiles.front !== undefined) tile = tiles.front;
              else tile = tiles.side !== undefined ? tiles.side : (tiles.all !== undefined ? tiles.all : tiles.top);
              if (tile === undefined) continue;
              const uv = uvOf(tile);
              const useAO = def.opaque;
              for (let v = 0; v < 4; v++) {
                const corner = face.corners[v];
                const ao = useAO ? aoAt(world, wx, y, wz, face, corner, opaqueAt) : 1;
                const shade = face.shade * ao;
                geo.opaque.pos.push(wx + corner[0], y + corner[1], wz + corner[2]);
                geo.opaque.norm.push(face.dir[0], face.dir[1], face.dir[2]);
                const uvPair = face.uvs[v];
                geo.opaque.uv.push(uv.u0 + (uv.u1 - uv.u0) * uvPair[0], uv.v0 + (uv.v1 - uv.v0) * uvPair[1]);
                geo.opaque.col.push(shade, shade, shade);
              }
              const n = geo.opaque.pos.length / 3;
              geo.opaque.idx.push(n - 4, n - 3, n - 2, n - 4, n - 2, n - 1);
            }
          }
        }
      }

      c.dirty = false;

      // 应用
      const apply = (which, mat) => {
        const g = geo[which];
        const key = which + 'Mesh';
        if (g.pos.length === 0) {
          if (c[key]) { c[key].geometry.dispose(); this.chunkGroup.remove(c[key]); c[key] = null; }
          return;
        }
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
        bg.setAttribute('normal', new THREE.Float32BufferAttribute(g.norm, 3));
        bg.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
        bg.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
        bg.setIndex(g.idx);
        bg.computeBoundingSphere();
        if (c[key]) {
          c[key].geometry.dispose();
          c[key].geometry = bg;
        } else {
          const mesh = new THREE.Mesh(bg, mat);
          mesh.position.set(0, 0, 0);
          if (which === 'water') mesh.renderOrder = 2;
          c[key] = mesh;
          this.chunkGroup.add(mesh);
        }
      };
      apply('opaque', this._buildMaterials.opaque);
      apply('cross', this._buildMaterials.cross);
      apply('glow', this._buildMaterials.glow);
      apply('water', this._buildMaterials.water);
    }

    _unloadChunk(c) {
      for (const key of ['opaqueMesh', 'crossMesh', 'glowMesh', 'waterMesh']) {
        const m = c[key];
        if (m) { m.geometry.dispose(); this.chunkGroup.remove(m); c[key] = null; }
      }
      this.chunks.delete(c.key);
      const i = this._meshQueue.indexOf(c);
      if (i >= 0) this._meshQueue.splice(i, 1);
    }

    // ------------------- 更新/流式加载 -------------------
    update(playerPos, opts) {
      const cx = Math.floor(playerPos.x / CH), cz = Math.floor(playerPos.z / CH);
      if (cx !== this.centerCx || cz !== this.centerCz) {
        this.centerCx = cx; this.centerCz = cz;
        // 清理远处区块
        for (const [key, c] of this.chunks) {
          const d = Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz));
          if (d > this.renderDist + 2) this._unloadChunk(c);
        }
      }
      const now = performance.now();
      const budget = opts && opts.budget ? opts.budget : 10;

      // 生成
      let genCount = 0;
      for (let r = 0; r <= this.renderDist && genCount < 3; r++) {
        for (let dz = -r; dz <= r && genCount < 3; dz++) {
          for (let dx = -r; dx <= r && genCount < 3; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const key = this.chunkKey(cx + dx, cz + dz);
            if (!this.chunks.has(key)) {
              this.ensureChunk(cx + dx, cz + dz);
              genCount++;
            }
          }
        }
      }

      // 网格
      const ms = performance.now() - now;
      if (ms < budget) {
        const list = this._meshQueue;
        let built = 0;
        while (list.length && built < 2) {
          const c = list.shift();
          if (!c.generated || !this.chunks.has(c.key) || !c.dirty) continue;
          const d = Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz));
          if (d > this.renderDist + 1) continue;
          this._buildMesh(c);
          built++;
          if (performance.now() - now > budget) break;
        }
      }
    }

    setRenderDistance(n) {
      n = Math.max(2, Math.min(8, Math.round(n) || 5));
      this.renderDist = n;
      const cx = this.centerCx, cz = this.centerCz;
      for (const c of this.chunks.values()) {
        const d = Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz));
        const vis = d <= n + 1;
        for (const key of ['opaqueMesh', 'crossMesh', 'glowMesh', 'waterMesh']) {
          if (c[key]) c[key].visible = vis;
        }
      }
    }

    preload(playerPos, radius) {
      const cx = Math.floor(playerPos.x / CH), cz = Math.floor(playerPos.z / CH);
      const r = radius || 3;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) this.ensureChunk(cx + dx, cz + dz);
      for (const c of this.chunks.values()) {
        if (c.generated && c.dirty && Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz)) <= r + 1) this._buildMesh(c);
      }
      this.centerCx = cx; this.centerCz = cz;
    }

    rebuildAll() {
      for (const c of this.chunks.values()) if (c.generated) { c.dirty = true; this._meshQueue.push(c); }
    }

    // ------------------- 射线检测 -------------------
    raycast(origin, dir, maxDist) {
      let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
      const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
      const tDeltaX = Math.abs(1 / dir.x), tDeltaY = Math.abs(1 / dir.y), tDeltaZ = Math.abs(1 / dir.z);
      let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(dir.x)) : Infinity;
      let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(dir.y)) : Infinity;
      let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(dir.z)) : Infinity;
      let nx = 0, ny = 0, nz = 0;
      let t = 0;
      while (t <= maxDist) {
        const id = this.getBlock(x, y, z);
        if (id !== B.AIR && id !== B.WATER) {
          return { x, y, z, id, dist: t, nx, ny, nz };
        }
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
          x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
        } else if (tMaxY < tMaxZ) {
          y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
        } else {
          z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
        }
        if (y < 0 || y >= HEIGHT) break;
      }
      return null;
    }

    // ------------------- 存档 -------------------
    serialize() {
      return { seed: this.seed, mods: Array.from(this.mods.entries()) };
    }
    loadMods(mods) {
      for (const [key, id] of mods) {
        const [x, y, z] = key.split(',').map(Number);
        this.mods.set(key, id);
        const ck = (x >> 4) + ',' + (z >> 4);
        let arr = this.modsByChunk.get(ck);
        if (!arr) { arr = new Map(); this.modsByChunk.set(ck, arr); }
        arr.set(localIndex(x & 15, y, z & 15), id);
        if (id === B.TORCH) this.torches.add(key);
      }
    }

    dispose() {
      for (const c of Array.from(this.chunks.values())) this._unloadChunk(c);
      this.scene.remove(this.chunkGroup);
    }
  }

  // ---------------- 网格辅助 ----------------
  function newGeo() { return { pos: [], norm: [], uv: [], col: [], idx: [] }; }

  function localIndex(lx, y, lz) { return (y * CH + lz) * CH + lx; }

  function aoAt(world, x, y, z, face, corner, opaqueAt) {
    const d = face.dir;
    let ax1, ax2;
    if (d[0] !== 0) { ax1 = [0, 1, 0]; ax2 = [0, 0, 1]; }
    else if (d[1] !== 0) { ax1 = [1, 0, 0]; ax2 = [0, 0, 1]; }
    else { ax1 = [1, 0, 0]; ax2 = [0, 1, 0]; }
    const s1 = ax1[0] ? corner[0] * 2 - 1 : ax1[1] ? corner[1] * 2 - 1 : corner[2] * 2 - 1;
    const s2 = ax2[0] ? corner[0] * 2 - 1 : ax2[1] ? corner[1] * 2 - 1 : corner[2] * 2 - 1;
    const bx = x + d[0], by = y + d[1], bz = z + d[2];
    const n1 = opaqueAt(bx + ax1[0] * s1, by + ax1[1] * s1, bz + ax1[2] * s1) ? 1 : 0;
    const n2 = opaqueAt(bx + ax2[0] * s2, by + ax2[1] * s2, bz + ax2[2] * s2) ? 1 : 0;
    const nc = opaqueAt(bx + ax1[0] * s1 + ax2[0] * s2, by + ax1[1] * s1 + ax2[1] * s2, bz + ax1[2] * s1 + ax2[2] * s2) ? 1 : 0;
    if (n1 && n2) return AO_LEVELS[0];
    return AO_LEVELS[3 - (n1 + n2 + nc)] || AO_LEVELS[0];
  }

  function addCross(target, wx, y, wz, def, shade) {
    if (def.tileScale === undefined) {
      // 默认尺寸
      def.tileScale = 1;
    }
    let w = 0.9, h = 1;
    if (def.id === B.TORCH) { w = 0.38; h = 0.78; }
    else if (def.id === B.SAPLING) { w = 0.7; h = 0.8; }
    else if (def.id === B.FLOWER_RED || def.id === B.FLOWER_YELLOW) { w = 0.7; h = 0.85; }
    const uv = uvOf(def.tiles.all);
    const planes = [
      [[0.5 - w / 2, 0, 0.5 - w / 2], [0.5 + w / 2, 0, 0.5 + w / 2], [0.5 + w / 2, h, 0.5 + w / 2], [0.5 - w / 2, h, 0.5 - w / 2]],
      [[0.5 + w / 2, 0, 0.5 - w / 2], [0.5 - w / 2, 0, 0.5 + w / 2], [0.5 - w / 2, h, 0.5 + w / 2], [0.5 + w / 2, h, 0.5 - w / 2]]
    ];
    const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
    for (const plane of planes) {
      for (let v = 0; v < 4; v++) {
        const p = plane[v];
        target.pos.push(wx + p[0], y + p[1], wz + p[2]);
        target.norm.push(0, 1, 0);
        target.uv.push(uv.u0 + (uv.u1 - uv.u0) * uvs[v][0], uv.v0 + (uv.v1 - uv.v0) * uvs[v][1]);
        target.col.push(shade, shade, shade);
      }
      const n = target.pos.length / 3;
      target.idx.push(n - 4, n - 3, n - 2, n - 4, n - 2, n - 1);
    }
  }

  function addLiquid(target, blocks, world, lx, y, lz, wx, wz, id) {
    const tops = world.getBlock(wx, y + 1, wz);
    const topH = (tops === id) ? 1 : 0.9;
    const uv = uvOf(MC.BLOCKS[id].tiles.all);
    const faces = [
      { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, topH, 0], [1, topH, 1]], shade: 0.82 },
      { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, topH, 1], [0, topH, 0]], shade: 0.74 },
      { dir: [0, 1, 0], corners: [[0, topH, 1], [1, topH, 1], [1, topH, 0], [0, topH, 0]], shade: 1.0 },
      { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, topH, 1], [0, topH, 1]], shade: 0.9 },
      { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, topH, 0], [1, topH, 0]], shade: 0.62 }
    ];
    for (const f of faces) {
      const nid = world.getBlock(wx + f.dir[0], y + f.dir[1], wz + f.dir[2]);
      if (nid === id || MC.isOpaque(nid)) continue;
      if (f.dir[0] === 0 && f.dir[1] === 0 && f.dir[2] === 0) continue;
      if (f.dir[1] === 0) {
        // 侧面：若上方是水，则从 y 到 topH
        if (topH >= 1) {
          // 整格
        }
      }
      const uvs = [[0, 1], [0, 0], [1, 0], [1, 1]];
      // 顶面的 UV 与侧面不同，简单处理
      for (let v = 0; v < 4; v++) {
        const c = f.corners[v];
        target.pos.push(wx + c[0], y + c[1], wz + c[2]);
        target.norm.push(f.dir[0], f.dir[1], f.dir[2]);
        const uvp = f.dir[1] !== 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]][v] : uvs[v];
        target.uv.push(uv.u0 + (uv.u1 - uv.u0) * uvp[0], uv.v0 + (uv.v1 - uv.v0) * uvp[1]);
        target.col.push(f.shade, f.shade, f.shade);
      }
      const n = target.pos.length / 3;
      target.idx.push(n - 4, n - 3, n - 2, n - 4, n - 2, n - 1);
    }
  }

  // 静态辅助
  MC.World = World;
  MC.WORLD_CONST = { CH, HEIGHT, SEA };
  MC.noise2 = noise2;
  MC.hash2i = hash2i;
  MC.localIndex = localIndex;
})();