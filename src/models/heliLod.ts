import * as THREE from 'three';
import type { HeliDetailHandles } from './heliDetails';

/** Distance bands (world units from camera → heli). */
export const HELI_LOD = {
  /** Full detail: canopy interior, all lights, gear, scars, dual blur. */
  near: 28,
  /** Mid: drop interior + some point lights, keep weapons/nav bulbs. */
  mid: 70,
  /** Far: body + weapons + single blur disc only. */
  far: 140,
} as const;

export type HeliLodLevel = 0 | 1 | 2 | 3;

export interface HeliLodHandles {
  /** High-detail-only meshes (interior, antenna sway bits, small fairings). */
  nearOnly: THREE.Object3D[];
  /** Mid+near meshes (landing gear struts detail, dual blur inner, chin gun). */
  midOnly: THREE.Object3D[];
  /** Point lights throttled by LOD (nav/exhaust/cockpit). */
  lights: THREE.PointLight[];
  /** Meshes that cast shadows only at near/mid. */
  shadowCasters: THREE.Object3D[];
  level: HeliLodLevel;
}

/**
 * Collect LOD buckets from the procedural detail layer + optional extras.
 * Cheap: visibility toggles only — no geometry rebuilds.
 */
export function buildHeliLod(
  details: HeliDetailHandles,
  extras: {
    nearOnly?: THREE.Object3D[];
    midOnly?: THREE.Object3D[];
    shadowCasters?: THREE.Object3D[];
  } = {},
): HeliLodHandles {
  const nearOnly: THREE.Object3D[] = [
    details.interior,
    details.antenna,
    details.canopyFrame,
    details.landingGearDetail,
    details.cockpitExtras,
    details.damageSparks,
    ...details.damageDecals,
    ...(extras.nearOnly ?? []),
  ];

  const midOnly: THREE.Object3D[] = [
    details.rotorBlurInner,
    details.navLights.beacon,
    details.navLights.strobe,
    details.tailRotorBlur,
    details.chinGun,
    ...(extras.midOnly ?? []),
  ];

  const lights: THREE.PointLight[] = [
    details.navPointLights.red,
    details.navPointLights.green,
    details.navPointLights.strobe,
    details.cockpitLight,
    details.exhaustLight,
  ];

  const shadowCasters = extras.shadowCasters ?? [];

  return {
    nearOnly,
    midOnly,
    lights,
    shadowCasters,
    level: -1 as unknown as HeliLodLevel, // force first apply
  };
}

export function distanceToLod(distance: number): HeliLodLevel {
  if (distance < HELI_LOD.near) return 0;
  if (distance < HELI_LOD.mid) return 1;
  if (distance < HELI_LOD.far) return 2;
  return 3;
}

/**
 * Apply LOD visibility / light / shadow policy.
 * Returns true when the level changed.
 */
export function applyHeliLod(lod: HeliLodHandles, distance: number): boolean {
  const next = distanceToLod(distance);
  if (next === lod.level) return false;
  lod.level = next;

  const showNear = next <= 0;
  const showMid = next <= 1;
  const showFarDetail = next <= 2;

  for (const o of lod.nearOnly) o.visible = showNear;
  for (const o of lod.midOnly) o.visible = showMid;

  // Light policy by index: 0 red, 1 green, 2 strobe, 3 cockpit, 4 exhaust
  if (lod.lights.length >= 5) {
    const [red, green, strobe, cockpit, exhaust] = lod.lights;
    if (next === 0) {
      red.visible = green.visible = strobe.visible = cockpit.visible = exhaust.visible = true;
    } else if (next === 1) {
      red.visible = green.visible = exhaust.visible = true;
      strobe.visible = cockpit.visible = false;
    } else {
      red.visible = green.visible = strobe.visible = cockpit.visible = exhaust.visible = false;
    }
  } else {
    for (const l of lod.lights) l.visible = next <= 1;
  }

  for (const o of lod.shadowCasters) {
    o.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = showFarDetail && next <= 1;
      }
    });
  }

  // Outer rotor blur stays visible further; hide only at extreme far
  return true;
}
