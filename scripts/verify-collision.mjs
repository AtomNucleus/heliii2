/**
 * Lightweight Node verification for collision math (no Three.js / DOM).
 * Run: node scripts/verify-collision.mjs
 */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function sphereVsAABB(cx, cy, cz, radius, box) {
  const qx = clamp(cx, box.minX, box.maxX);
  const qy = clamp(cy, box.minY, box.maxY);
  const qz = clamp(cz, box.minZ, box.maxZ);
  let dx = cx - qx;
  let dy = cy - qy;
  let dz = cz - qz;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq > 1e-10) {
    const dist = Math.sqrt(distSq);
    if (dist >= radius) return { hit: false, penetration: 0, nx: 0, ny: 1, nz: 0 };
    return {
      hit: true,
      penetration: radius - dist,
      nx: dx / dist,
      ny: dy / dist,
      nz: dz / dist,
    };
  }

  const toMinX = cx - box.minX;
  const toMaxX = box.maxX - cx;
  const toMinY = cy - box.minY;
  const toMaxY = box.maxY - cy;
  const toMinZ = cz - box.minZ;
  const toMaxZ = box.maxZ - cz;
  const m = Math.min(toMinX, toMaxX, toMinY, toMaxY, toMinZ, toMaxZ);
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (m === toMinX) nx = -1;
  else if (m === toMaxX) nx = 1;
  else if (m === toMinY) ny = -1;
  else if (m === toMaxY) ny = 1;
  else if (m === toMinZ) nz = -1;
  else nz = 1;
  return { hit: true, penetration: m + radius, nx, ny, nz };
}

function resolveImpact(vx, vy, vz, nx, ny, nz, crashSpeed = 16, scrapeSpeed = 4.5) {
  const closing = -(vx * nx + vy * ny + vz * nz);
  const closingSpeed = Math.max(0, closing);
  let impactKind = 'none';
  let damage = 0;
  if (closingSpeed >= crashSpeed) {
    impactKind = 'crash';
    const t = clamp((closingSpeed - crashSpeed) / (crashSpeed * 1.2), 0, 1);
    damage = 10 + t * t * 22;
  } else if (closingSpeed >= scrapeSpeed) {
    impactKind = 'scrape';
    const t = clamp(closingSpeed / crashSpeed, 0, 1);
    damage = (1.2 + t * 3.5) * 0.35;
  }
  return { closingSpeed, impactKind, damage };
}

/** Minimal XZ spatial hash mirroring SpatialHash.queryIds semantics. */
class SpatialHashSmoke {
  constructor(colliders, cellSize = 12) {
    this.colliders = colliders.map((c, i) => ({ ...c, id: i, active: c.active !== false }));
    this.cellSize = cellSize;
    this.cells = new Map();
    for (const c of this.colliders) this.insert(c);
  }
  key(ix, iz) {
    return ((ix + 0x8000) & 0xffff) | (((iz + 0x8000) & 0xffff) << 16);
  }
  insert(c) {
    const minIx = Math.floor(c.minX / this.cellSize);
    const maxIx = Math.floor(c.maxX / this.cellSize);
    const minIz = Math.floor(c.minZ / this.cellSize);
    const maxIz = Math.floor(c.maxZ / this.cellSize);
    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        const k = this.key(ix, iz);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(c.id);
      }
    }
  }
  queryIds(minX, maxX, minZ, maxZ) {
    const out = [];
    const seen = new Set();
    const minIx = Math.floor(minX / this.cellSize);
    const maxIx = Math.floor(maxX / this.cellSize);
    const minIz = Math.floor(minZ / this.cellSize);
    const maxIz = Math.floor(maxZ / this.cellSize);
    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        const bucket = this.cells.get(this.key(ix, iz));
        if (!bucket) continue;
        for (const id of bucket) {
          if (seen.has(id)) continue;
          const c = this.colliders[id];
          if (!c || c.active === false) continue;
          seen.add(id);
          out.push(id);
        }
      }
    }
    return out;
  }
  setActive(id, active) {
    this.colliders[id].active = active;
  }
  addCollider(partial) {
    const id = this.colliders.length;
    const entry = { ...partial, id, active: true };
    this.colliders.push(entry);
    this.insert(entry);
    return id;
  }
}

function proximityLevel(dist) {
  if (dist <= 5.5) return 3;
  if (dist <= 12) return 2;
  if (dist <= 22) return 1;
  return 0;
}

function applyDestructible(box, closingSpeed, isCrash) {
  if (box.hp === undefined) return { destroyed: false, hp: box.hp };
  const minClosing = 7;
  const over = Math.max(0, closingSpeed - minClosing);
  let dmg = over * 1.35;
  if (isCrash) dmg += 12;
  box.hp = Math.max(0, box.hp - dmg);
  return { destroyed: box.hp <= 0, hp: box.hp };
}

function nearGroundAssist(clearance, vy, band = 7.5, bleedMul = 0.42) {
  if (clearance >= band || vy >= -1.5) return { assist: 0, vy };
  const t = clamp(1 - clearance / band, 0, 1);
  const assist = t * t;
  const closing = Math.max(0, -vy);
  const bleed = assist * bleedMul * closing;
  return { assist, vy: vy + bleed };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const box = { minX: -2, minY: 0, minZ: -2, maxX: 2, maxY: 10, maxZ: 2 };

// Separated
{
  const r = sphereVsAABB(10, 5, 0, 2, box);
  assert(!r.hit, 'expected miss when far from AABB');
}

// Side scrape contact
{
  const r = sphereVsAABB(3.5, 4, 0, 2, box);
  assert(r.hit, 'expected side hit');
  assert(r.penetration > 0.4 && r.penetration < 0.6, `pen=${r.penetration}`);
  assert(Math.abs(r.nx - 1) < 1e-6, 'normal should point +X');
}

// Inside push-out
{
  const r = sphereVsAABB(0, 5, 0, 2, box);
  assert(r.hit && r.penetration > 2, 'inside should push out');
}

// Crash vs scrape classification
{
  const crash = resolveImpact(20, 0, 0, -1, 0, 0);
  assert(crash.impactKind === 'crash', 'fast hit should crash');
  assert(crash.damage > 10, 'crash damage');

  const scrape = resolveImpact(6, 0, 0, -1, 0, 0);
  assert(scrape.impactKind === 'scrape', 'medium hit should scrape');
  assert(scrape.damage > 0 && scrape.damage < 5, 'scrape damage small');

  const soft = resolveImpact(1, 0, 0, -1, 0, 0);
  assert(soft.impactKind === 'none', 'slow contact is none');
}

// Spatial hash key uniqueness + inactive skip + procedural add
{
  const cellSize = 12;
  const key = (ix, iz) => ((ix + 0x8000) & 0xffff) | (((iz + 0x8000) & 0xffff) << 16);
  const a = key(0, 0);
  const b = key(1, 0);
  const c = key(0, 1);
  assert(a !== b && a !== c && b !== c, 'hash keys must differ');

  const hash = new SpatialHashSmoke([
    { minX: 0, minY: 0, minZ: 0, maxX: 4, maxY: 8, maxZ: 4, kind: 'building' },
    { minX: 20, minY: 0, minZ: 20, maxX: 24, maxY: 3, maxZ: 24, kind: 'prop', hp: 30, maxHp: 30 },
  ]);
  let ids = hash.queryIds(-1, 5, -1, 5);
  assert(ids.includes(0) && !ids.includes(1), 'query should find nearby building only');
  hash.setActive(0, false);
  ids = hash.queryIds(-1, 5, -1, 5);
  assert(!ids.includes(0), 'inactive collider skipped');
  const pid = hash.addCollider({
    minX: 1, minY: 0, minZ: 1, maxX: 2, maxY: 2, maxZ: 2, kind: 'prop', hp: 20, maxHp: 20,
  });
  assert(pid === 2, 'procedural id');
  ids = hash.queryIds(-1, 5, -1, 5);
  assert(ids.includes(2), 'procedural collider queryable');
}

// Proximity bands
{
  assert(proximityLevel(30) === 0, 'far = clear');
  assert(proximityLevel(18) === 1, 'caution');
  assert(proximityLevel(10) === 2, 'warning');
  assert(proximityLevel(3) === 3, 'critical');
}

// Destructible shatter
{
  const prop = { hp: 20, maxHp: 20 };
  const soft = applyDestructible(prop, 5, false);
  assert(!soft.destroyed && prop.hp === 20, 'below min closing no damage');
  const hit = applyDestructible(prop, 20, true);
  assert(hit.destroyed, 'crash should shatter low-HP prop');
}

// Near-ground assist bleeds descent
{
  const r = nearGroundAssist(2, -20);
  assert(r.assist > 0.5, 'assist engaged near ground');
  assert(r.vy > -20, 'vertical closing reduced');
  const high = nearGroundAssist(40, -20);
  assert(high.assist === 0 && high.vy === -20, 'no assist at altitude');
}

console.log('verify-collision: all checks passed');
