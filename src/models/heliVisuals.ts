import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { HeliMaterialKit } from './heliMaterials';
import type { HeliDetailHandles } from './heliDetails';

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
}

export interface HeliVisualRuntime {
  kit: HeliMaterialKit;
  details: HeliDetailHandles;
  bodyMats: THREE.MeshStandardMaterial[];
  weaponMats: THREE.MeshStandardMaterial[];
  time: number;
  lastHealth: number;
  flashTimer: number;
}

const MAX_SPEED_REF = 55;

/**
 * Attach runtime visual state onto heli.userData for per-frame updates.
 */
export function bindHeliVisualRuntime(
  heli: THREE.Group,
  kit: HeliMaterialKit,
  details: HeliDetailHandles,
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
        bodyMats.push(m);
      }
      if (kind === 'weapon' || mesh.name.toLowerCase().includes('missile')) {
        weaponMats.push(m);
      }
    }
  });

  const runtime: HeliVisualRuntime = {
    kit,
    details,
    bodyMats,
    weaponMats,
    time: 0,
    lastHealth: 100,
    flashTimer: 0,
  };
  heli.userData.heliVisuals = runtime;
  return runtime;
}

export function getHeliVisualRuntime(heli: THREE.Object3D): HeliVisualRuntime | null {
  return (heli.userData?.heliVisuals as HeliVisualRuntime) ?? null;
}

/**
 * Drive nav blink, rotor blur, exhaust, cockpit emissives, and damage look.
 * Safe no-op if visuals were not bound (e.g. raw group).
 */
export function updateHelicopterVisuals(
  heli: THREE.Group,
  input: HeliVisualUpdateInput,
): void {
  const rt = getHeliVisualRuntime(heli);
  if (!rt) return;

  const { details, kit } = rt;
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

  // --- Nav lights: steady wing tips + strobe / beacon pulse ---
  const wingPulse = 0.85 + Math.sin(t * 6.5) * 0.15;
  kit.navRed.emissiveIntensity = 1.4 * wingPulse;
  kit.navGreen.emissiveIntensity = 1.4 * wingPulse;
  details.navPointLights.red.intensity = 0.25 + wingPulse * 0.2;
  details.navPointLights.green.intensity = 0.25 + wingPulse * 0.2;

  // Anti-collision strobe ~1.2 Hz
  const strobeOn = (t * 1.2) % 1 < 0.12;
  const strobeI = strobeOn ? 2.8 : 0.05;
  kit.navWhite.emissiveIntensity = strobeI;
  details.navLights.strobe.visible = true;
  details.navPointLights.strobe.intensity = strobeOn ? 1.4 : 0.05;

  const beaconMat = details.navLights.beacon.material as THREE.MeshStandardMaterial;
  const beaconOn = (t * 2.4) % 1 < 0.18;
  beaconMat.emissiveIntensity = beaconOn ? 3.2 : 0.08;

  // Dim nav lights when critically damaged
  if (health01 < 0.25) {
    const flicker = 0.4 + Math.random() * 0.6;
    kit.navRed.emissiveIntensity *= flicker;
    kit.navGreen.emissiveIntensity *= flicker;
    details.navPointLights.red.intensity *= flicker;
    details.navPointLights.green.intensity *= flicker;
  }

  // --- Rotor blur opacity / spin shimmer ---
  const blurBoost = boosting ? 0.14 : 0;
  const outerOp = 0.16 + speed01 * 0.28 + blurBoost;
  const innerOp = 0.1 + speed01 * 0.2 + blurBoost * 0.5;
  const outerMat = details.rotorBlurOuter.material as THREE.MeshBasicMaterial;
  const innerMat = details.rotorBlurInner.material as THREE.MeshBasicMaterial;
  outerMat.opacity = outerOp;
  innerMat.opacity = innerOp;
  // Counter-rotate inner disc slightly for shimmer (parent already spins)
  details.rotorBlurInner.rotation.z = t * 0.35;

  // --- Exhaust heat ---
  const heat = 0.55 + speed01 * 0.7 + (boosting ? 0.85 : 0);
  kit.exhaust.emissiveIntensity = heat + Math.sin(t * 18) * 0.12;
  details.exhaustLight.intensity = 0.35 + heat * 0.55;
  details.exhaustLight.color.setHex(boosting ? COLORS.orangeSun : COLORS.orangeHot);
  details.exhaustGlow.scale.setScalar(0.9 + speed01 * 0.25 + (boosting ? 0.2 : 0));

  // --- Cockpit / interior ---
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
    dm.opacity = health01 < 0.3 ? 0.25 + Math.abs(Math.sin(t * 10)) * 0.45 : 0.45 + Math.sin(t * 4) * 0.1;
    dm.color.setHex(health01 < 0.3 ? 0xff4422 : 0x39ff9a);
  }

  // Canopy: clearer when healthy, smoked / red when damaged
  const canopyMat = details.canopy.material as THREE.MeshPhysicalMaterial;
  canopyMat.opacity = 0.55 + damage01 * 0.25;
  canopyMat.color.setRGB(
    0.43 + damage01 * 0.35,
    0.78 - damage01 * 0.45,
    0.91 - damage01 * 0.5,
  );
  canopyMat.emissive = canopyMat.emissive ?? new THREE.Color();
  canopyMat.emissive.setHex(rt.flashTimer > 0 ? 0xff3300 : 0x000000);
  canopyMat.emissiveIntensity = rt.flashTimer > 0 ? rt.flashTimer * 2.2 : damage01 * 0.15;

  // --- Damage decals ---
  const showCount = Math.floor(damage01 * details.damageDecals.length + 0.001);
  for (let i = 0; i < details.damageDecals.length; i++) {
    const scar = details.damageDecals[i];
    const mat = scar.material as THREE.MeshStandardMaterial;
    const active = i < showCount || (damage01 > 0.15 && i === 0);
    scar.visible = active;
    if (active) {
      mat.opacity = 0.35 + damage01 * 0.55;
      mat.emissiveIntensity = damage01 > 0.55 ? 0.4 + Math.sin(t * 9 + i) * 0.25 : 0.05;
    }
  }

  // Body / weapon emissive response to damage + boost
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

  // Subtle antenna sway (visual life)
  details.antenna.rotation.z = Math.sin(t * 2.1) * 0.04 * (0.4 + speed01);
}
