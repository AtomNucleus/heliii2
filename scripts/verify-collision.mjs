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

// Spatial hash key uniqueness smoke
{
  const cellSize = 12;
  const key = (ix, iz) => ((ix + 0x8000) & 0xffff) | (((iz + 0x8000) & 0xffff) << 16);
  const a = key(0, 0);
  const b = key(1, 0);
  const c = key(0, 1);
  assert(a !== b && a !== c && b !== c, 'hash keys must differ');
}

console.log('verify-collision: all checks passed');
