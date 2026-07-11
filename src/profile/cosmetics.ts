/** Apply equipped cosmetic skins / loadouts to the helicopter material kit. */

import * as THREE from 'three';
import type { HeliMaterialKit } from '../models/heliMaterials';
import { getHeliVisualRuntime } from '../models/heliVisuals';
import type { LoadoutId, SkinId } from './types';

export interface SkinPalette {
  bodyTint: number;
  accent: number;
  canopy: number;
  weapon: number;
  navBoost: number;
  emissiveBody: number;
}

const SKIN_PALETTES: Record<SkinId, SkinPalette> = {
  sunsetGreen: {
    bodyTint: 0xffffff,
    accent: 0xff8c3a,
    canopy: 0x5eb8d8,
    weapon: 0x3a4548,
    navBoost: 1,
    emissiveBody: 0x0a1814,
  },
  nightOps: {
    bodyTint: 0x6a7a82,
    accent: 0x4ecdc4,
    canopy: 0x2a4a58,
    weapon: 0x1e282c,
    navBoost: 0.85,
    emissiveBody: 0x061018,
  },
  emberStripe: {
    bodyTint: 0xffe0c8,
    accent: 0xff6a1a,
    canopy: 0xffa06a,
    weapon: 0x4a3030,
    navBoost: 1.15,
    emissiveBody: 0x2a1208,
  },
  ghostArray: {
    bodyTint: 0xd8e8e4,
    accent: 0xa8c8c0,
    canopy: 0xc8e8f0,
    weapon: 0x505858,
    navBoost: 0.7,
    emissiveBody: 0x101818,
  },
};

const LOADOUT_WEAPON_GLOW: Record<LoadoutId, number> = {
  standard: 0.12,
  tracerPods: 0.55,
  reconSuite: 0.22,
};

/**
 * Tint heli materials for the equipped skin + loadout.
 * Stores base colors on userData so re-application is idempotent.
 */
export function applyHeliCosmetics(
  heli: THREE.Object3D,
  skin: SkinId,
  loadout: LoadoutId,
): void {
  const rt = getHeliVisualRuntime(heli);
  const kit: HeliMaterialKit | null = rt?.kit ?? null;
  const palette = SKIN_PALETTES[skin] ?? SKIN_PALETTES.sunsetGreen;

  const applyMat = (mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial, kind: string) => {
    if (!mat.userData.cosmoBase) {
      mat.userData.cosmoBase = {
        color: mat.color.clone(),
        emissive: mat.emissive?.clone?.() ?? new THREE.Color(0x000000),
        emissiveIntensity: mat.emissiveIntensity ?? 0,
      };
    }
    if (kind === 'body' || mat.userData.heliKind === 'body') {
      mat.color.setHex(palette.bodyTint);
      if (mat.emissive) mat.emissive.setHex(palette.emissiveBody);
    }
    if (kind === 'weapon' || mat.userData.heliKind === 'weapon') {
      mat.color.setHex(palette.weapon);
      mat.emissiveIntensity = LOADOUT_WEAPON_GLOW[loadout] ?? 0.12;
      mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
      if (mat.emissive) mat.emissive.setHex(loadout === 'tracerPods' ? 0xff6a1a : 0xff8c3a);
    }
    if (kind === 'accent') {
      mat.color.setHex(palette.accent);
      if (mat.emissive) mat.emissive.setHex(palette.accent);
    }
  };

  if (kit) {
    applyMat(kit.body, 'body');
    applyMat(kit.weapon, 'weapon');
    applyMat(kit.accent, 'accent');
    kit.canopy.color.setHex(palette.canopy);
    kit.navRed.emissiveIntensity = 1.8 * palette.navBoost;
    kit.navGreen.emissiveIntensity = 1.8 * palette.navBoost;
    if (loadout === 'reconSuite') {
      kit.interior.emissive.setHex(0x2a6058);
      kit.interior.emissiveIntensity = 0.65;
    } else {
      kit.interior.emissive.setHex(0x1a4038);
      kit.interior.emissiveIntensity = 0.45;
    }
  }

  if (rt) {
    for (const m of rt.bodyMats) applyMat(m, 'body');
    for (const m of rt.weaponMats) applyMat(m, 'weapon');
  }

  heli.userData.equippedSkin = skin;
  heli.userData.equippedLoadout = loadout;
}

export function getSkinPalette(skin: SkinId): SkinPalette {
  return SKIN_PALETTES[skin] ?? SKIN_PALETTES.sunsetGreen;
}
