import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { HeliMaterialKit } from './heliMaterials';
import type { HeliDetailHandles } from './heliDetails';
import { applyHeliLod, buildHeliLod, type HeliLodHandles } from './heliLod';

export interface HeliVisualUpdateInput {
  dt: number;
  time: number;
  /** Forward speed in world units / s */
  speed: number;
  /** 0..1 boost active */
  boosting?: boolean;
  /** Hull health 0..100 (mission or controller) */
  health?: number;
  healthMax?: number;
  /** Camera world position for LOD (optional). */
  cameraPosition?: THREE.Vector3;
  /** Precomputed camera→heli distance; overrides cameraPosition. */
  lodDistance?: number;
}

export interface HeliVisualRuntime {
  kit: HeliMaterialKit;
  details: HeliDetailHandles;
  bodyMats: THREE.MeshStandardMaterial[];
  weaponMats: THREE.MeshStandardMaterial[];
  lod: HeliLodHandles;
  time: number;
  lastHealth: number;
  flashTimer: number;
  chinAim: number;
  _heliPos: THREE.Vector3;
}

const MAX_SPEED_REF = 55;
const _camDist = new THREE.Vector3();

/**
 * Attach runtime visual state onto heli.userData for per-frame updates.
 */
export function bindHeliVisualRuntime(
  heli: THREE.Group,
  kit: HeliMaterialKit,
  details: HeliDetailHandles,
  lodExtras: {
    nearOnly?: THREE.Object3D[];
    midOnly?: THREE.Object3D[];
    shadowCasters?: THREE.Object3D[];
  } = {},
): HeliVisualRuntime {
  const bodyMats: THREE.MeshStandardMaterial[] = [];
  const weaponMats: THREE.MeshStandardMaterial[] = [];

  heli.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      const kind = m.userData.heliKind as string | undefined;
      if (kind === 'body' || mesh.name.toLowerCase().includes('body')) {
        if (!bodyMats.includes(m)) bodyMats.push(m);
      }
      if (kind === 'weapon' || mesh.name.toLowerCase().includes('missile')) {
        if (!weaponMats.includes(m)) weaponMats.push(m);
      }
    }
  });

  // Ensure kit body/weapon participate even if not found on meshes yet
  if (!bodyMats.includes(kit.body)) bodyMats.push(kit.body);
  if (!weaponMats.includes(kit.weapon)) weaponMats.push(kit.weapon);

  const lod = buildHeliLod(details, lodExtras);

  const runtime: HeliVisualRuntime = {
    kit,
    details,
    bodyMats,
    weaponMats,
    lod,
    time: 0,
    lastHealth: 100,
    flashTimer: 0,
    chinAim: 0,
    _heliPos: new THREE.Vector3(),
  };
  heli.userData.heliVisuals = runtime;

  // Prime LOD to near
  applyHeliLod(lod, 0);

  return runtime;
}

export function getHeliVisualRuntime(heli: THREE.Object3D): HeliVisualRuntime | null {
  return (heli.userData?.heliVisuals as HeliVisualRuntime) ?? null;
}

/**
 * Drive nav blink, rotor blur, exhaust, cockpit emissives, damage, LOD, and micro-animation.
 * Safe no-op if visuals were not bound.
 */
export function updateHelicopterVisuals(
  heli: THREE.Group,
  input: HeliVisualUpdateInput,
): void {
  const rt = getHeliVisualRuntime(heli);
  if (!rt) return;

  const { details, kit, lod } = rt;
  rt.time += input.dt;
  const t = input.time;
  const speed01 = THREE.MathUtils.clamp(input.speed / MAX_SPEED_REF, 0, 1);
  const boosting = !!input.boosting;
  const healthMax = input.healthMax ?? 100;
  const health = input.health ?? healthMax;
  const health01 = THREE.MathUtils.clamp(health / healthMax, 0, 1);
  const damage01 = 1 - health01;

  if (health < rt.lastHealth - 0.5) {
    rt.flashTimer = 0.35;
  }
  rt.lastHealth = health;
  if (rt.flashTimer > 0) rt.flashTimer = Math.max(0, rt.flashTimer - input.dt);

  // --- LOD ---
  heli.getWorldPosition(rt._heliPos);
  let dist = input.lodDistance;
  if (dist == null && input.cameraPosition) {
    dist = _camDist.copy(input.cameraPosition).sub(rt._heliPos).length();
  }
  if (dist != null) {
    applyHeliLod(lod, dist);
  }

  // Skip expensive emissive flicker work at extreme far (level 3)
  const farCulled = lod.level >= 3;
  if (farCulled) {
    // Still keep outer blur faintly tied to speed
    const outerMat = details.rotorBlurOuter.material as THREE.MeshBasicMaterial;
    outerMat.opacity = 0.12 + speed01 * 0.15;
    return;
  }

  // --- Nav lights ---
  const wingPulse = 0.85 + Math.sin(t * 6.5) * 0.15;
  kit.navRed.emissiveIntensity = 1.4 * wingPulse;
  kit.navGreen.emissiveIntensity = 1.4 * wingPulse;
  details.navPointLights.red.intensity = 0.25 + wingPulse * 0.2;
  details.navPointLights.green.intensity = 0.25 + wingPulse * 0.2;

  const strobeOn = (t * 1.2) % 1 < 0.12;
  const strobeI = strobeOn ? 2.8 : 0.05;
  kit.navWhite.emissiveIntensity = strobeI;
  details.navLights.strobe.visible = lod.level <= 1;
  details.navPointLights.strobe.intensity = strobeOn ? 1.4 : 0.05;

  const beaconMat = details.navLights.beacon.material as THREE.MeshStandardMaterial;
  const beaconOn = (t * 2.4) % 1 < 0.18;
  beaconMat.emissiveIntensity = beaconOn ? 3.2 : 0.08;

  if (health01 < 0.25) {
    const flicker = 0.4 + Math.random() * 0.6;
    kit.navRed.emissiveIntensity *= flicker;
    kit.navGreen.emissiveIntensity *= flicker;
    details.navPointLights.red.intensity *= flicker;
    details.navPointLights.green.intensity *= flicker;
  }

  // --- Rotor blur ---
  const blurBoost = boosting ? 0.14 : 0;
  const outerOp = 0.16 + speed01 * 0.28 + blurBoost;
  const innerOp = 0.1 + speed01 * 0.2 + blurBoost * 0.5;
  const outerMat = details.rotorBlurOuter.material as THREE.MeshBasicMaterial;
  const innerMat = details.rotorBlurInner.material as THREE.MeshBasicMaterial;
  outerMat.opacity = outerOp;
  innerMat.opacity = innerOp;
  details.rotorBlurInner.rotation.z = t * 0.35;

  const tailBlurMat = details.tailRotorBlur.material as THREE.MeshBasicMaterial;
  tailBlurMat.opacity = 0.12 + speed01 * 0.22 + blurBoost * 0.5;

  // Subtle blade tip flex (visual life under load)
  if (lod.level === 0 && details.mainBlades.length) {
    const flex = 1 + speed01 * 0.012 + (boosting ? 0.01 : 0);
    for (let i = 0; i < details.mainBlades.length; i++) {
      const b = details.mainBlades[i];
      b.scale.y = flex;
      b.rotation.z = 0.08 + Math.sin(t * 40 + i) * 0.004 * speed01;
    }
  }

  // --- Exhaust heat ---
  const heat = 0.55 + speed01 * 0.7 + (boosting ? 0.85 : 0);
  kit.exhaust.emissiveIntensity = heat + Math.sin(t * 18) * 0.12;
  details.exhaustLight.intensity = 0.35 + heat * 0.55;
  details.exhaustLight.color.setHex(boosting ? COLORS.orangeSun : COLORS.orangeHot);
  const exScale = 0.9 + speed01 * 0.25 + (boosting ? 0.2 : 0);
  details.exhaustGlow.scale.setScalar(exScale);
  const ex2 = details.group.getObjectByName('exhaustGlow2') as THREE.Mesh | undefined;
  if (ex2) ex2.scale.setScalar(exScale);

  // --- Cockpit / interior ---
  if (lod.level === 0) {
    details.cockpitLight.intensity = 0.35 + 0.25 * Math.sin(t * 3.2) * 0.5 + 0.2;
    if (health01 < 0.35) {
      details.cockpitLight.color.setHex(0xff5530);
      details.cockpitLight.intensity = 0.3 + Math.sin(t * 14) * 0.25;
    } else {
      details.cockpitLight.color.setHex(0x4ecdc4);
    }

    const dash = details.interior.getObjectByName('dashGlow') as THREE.Mesh | null;
    if (dash) {
      const dm = dash.material as THREE.MeshBasicMaterial;
      dm.opacity =
        health01 < 0.3
          ? 0.25 + Math.abs(Math.sin(t * 10)) * 0.45
          : 0.45 + Math.sin(t * 4) * 0.1;
      dm.color.setHex(health01 < 0.3 ? 0xff4422 : 0x39ff9a);
    }
  }

  // Canopy: clearer when healthy, smoked / red when damaged
  const canopyMat = details.canopy.material as THREE.MeshPhysicalMaterial;
  canopyMat.opacity = 0.55 + damage01 * 0.28;
  canopyMat.color.setRGB(
    0.43 + damage01 * 0.35,
    0.78 - damage01 * 0.45,
    0.91 - damage01 * 0.5,
  );
  if (!canopyMat.emissive) canopyMat.emissive = new THREE.Color();
  canopyMat.emissive.setHex(rt.flashTimer > 0 ? 0xff3300 : 0x000000);
  canopyMat.emissiveIntensity = rt.flashTimer > 0 ? rt.flashTimer * 2.2 : damage01 * 0.15;

  // --- Damage decals + sparks ---
  const showCount = Math.floor(damage01 * details.damageDecals.length + 0.001);
  for (let i = 0; i < details.damageDecals.length; i++) {
    const scar = details.damageDecals[i];
    const mat = scar.material as THREE.MeshStandardMaterial;
    const active = lod.level === 0 && (i < showCount || (damage01 > 0.12 && i === 0));
    scar.visible = active;
    if (active) {
      mat.opacity = 0.35 + damage01 * 0.55;
      mat.emissiveIntensity = damage01 > 0.55 ? 0.4 + Math.sin(t * 9 + i) * 0.25 : 0.05;
    }
  }

  const sparks = details.damageSparks;
  const sparkMat = sparks.material as THREE.PointsMaterial;
  if (damage01 > 0.45 && lod.level === 0) {
    sparks.visible = true;
    sparkMat.opacity = (damage01 - 0.45) * 1.4 * (0.5 + Math.sin(t * 22) * 0.5);
    sparks.rotation.y = t * 0.7;
  } else {
    sparks.visible = false;
    sparkMat.opacity = 0;
  }

  // Chin gun tracks slight aim oscillation
  if (details.chinGun && lod.level <= 1) {
    rt.chinAim += (Math.sin(t * 0.7) * 0.15 - rt.chinAim) * Math.min(1, input.dt * 3);
    details.chinGun.rotation.y = rt.chinAim;
    const barrel = details.chinGun.getObjectByName('chinBarrel');
    if (barrel) barrel.rotation.x = Math.PI / 2 + Math.sin(t * 0.9) * 0.08;
  }

  // Weapon pod micro-vibration under boost
  if (boosting && lod.level <= 1) {
    details.weaponPods.position.y = Math.sin(t * 55) * 0.008;
  } else {
    details.weaponPods.position.y = 0;
  }

  // Body / weapon emissive response
  for (const m of rt.bodyMats) {
    const base = (m.userData.baseEmissiveIntensity as number) ?? 0.08;
    m.emissiveIntensity =
      base +
      damage01 * 0.35 +
      (rt.flashTimer > 0 ? rt.flashTimer * 1.5 : 0) +
      (boosting ? 0.12 : 0);
    if (damage01 > 0.5) {
      m.emissive.setHex(COLORS.orangeHot);
    } else if (m.emissive) {
      m.emissive.setHex(0x0a1814);
    }
  }
  for (const m of rt.weaponMats) {
    const base = (m.userData.baseEmissiveIntensity as number) ?? 0.12;
    m.emissiveIntensity = base + (boosting ? 0.35 : 0) + Math.sin(t * 5) * 0.04;
  }

  // Antenna sway
  details.antenna.rotation.z = Math.sin(t * 2.1) * 0.04 * (0.4 + speed01);
}
