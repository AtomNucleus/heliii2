import * as THREE from 'three';
import { COLORS } from '../scene/setup';

interface Burst {
  points: THREE.Points;
  life: number;
  maxLife: number;
  velocities: Float32Array;
}

interface Shockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  grow: number;
}

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

/** Lightweight hit / explosion / muzzle FX (procedural, no assets). */
export class CombatEffects {
  readonly group = new THREE.Group();
  private bursts: Burst[] = [];
  private waves: Shockwave[] = [];
  private tracers: Tracer[] = [];

  constructor(scene: THREE.Scene) {
    this.group.name = 'combat-effects';
    scene.add(this.group);
  }

  spawnExplosion(position: THREE.Vector3, scale = 1, color = COLORS.orangeHot) {
    const count = Math.floor(20 + scale * 16);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 1.5 + 0.15,
        Math.random() * 2 - 1,
      ).normalize();
      const speed = (5 + Math.random() * 12) * scale;
      velocities[i * 3] = dir.x * speed;
      velocities[i * 3 + 1] = dir.y * speed;
      velocities[i * 3 + 2] = dir.z * speed;
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.58 * scale,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.bursts.push({
      points,
      life: 0.75 + scale * 0.28,
      maxLife: 0.75 + scale * 0.28,
      velocities,
    });

    // Expanding shock ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.55, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.copy(position);
    ring.lookAt(position.x, position.y + 1, position.z);
    this.group.add(ring);
    this.waves.push({
      mesh: ring,
      life: 0.45 + scale * 0.15,
      maxLife: 0.45 + scale * 0.15,
      grow: 9 + scale * 6,
    });
  }

  spawnMuzzleFlash(position: THREE.Vector3, direction: THREE.Vector3) {
    const tip = position.clone().addScaledVector(direction, 1.15);
    this.spawnExplosion(tip, 0.32, COLORS.neonGreen);

    const streak = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.18, 1.6, 6),
      new THREE.MeshBasicMaterial({
        color: COLORS.neonGreen,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    streak.position.copy(tip);
    streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    this.group.add(streak);
    this.tracers.push({ mesh: streak, life: 0.12, maxLife: 0.12 });
  }

  spawnHitSpark(position: THREE.Vector3) {
    this.spawnExplosion(position, 0.4, COLORS.neonGreen);
  }

  update(dt: number) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.life -= dt;
      const attr = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const n = arr.length / 3;
      for (let p = 0; p < n; p++) {
        arr[p * 3] += burst.velocities[p * 3] * dt;
        arr[p * 3 + 1] += burst.velocities[p * 3 + 1] * dt;
        arr[p * 3 + 2] += burst.velocities[p * 3 + 2] * dt;
        burst.velocities[p * 3 + 1] -= 14 * dt;
      }
      attr.needsUpdate = true;
      const mat = burst.points.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, burst.life / burst.maxLife);

      if (burst.life <= 0) {
        this.group.remove(burst.points);
        burst.points.geometry.dispose();
        mat.dispose();
        this.bursts.splice(i, 1);
      }
    }

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      wave.life -= dt;
      const t = 1 - wave.life / wave.maxLife;
      const s = 1 + t * wave.grow;
      wave.mesh.scale.set(s, s, s);
      const mat = wave.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - t) * 0.85);
      if (wave.life <= 0) {
        this.group.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        mat.dispose();
        this.waves.splice(i, 1);
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      const mat = tracer.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, tracer.life / tracer.maxLife);
      if (tracer.life <= 0) {
        this.group.remove(tracer.mesh);
        tracer.mesh.geometry.dispose();
        mat.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  clear() {
    for (const burst of this.bursts) {
      this.group.remove(burst.points);
      burst.points.geometry.dispose();
      (burst.points.material as THREE.PointsMaterial).dispose();
    }
    for (const wave of this.waves) {
      this.group.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      (wave.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    for (const tracer of this.tracers) {
      this.group.remove(tracer.mesh);
      tracer.mesh.geometry.dispose();
      (tracer.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    this.bursts.length = 0;
    this.waves.length = 0;
    this.tracers.length = 0;
  }
}
