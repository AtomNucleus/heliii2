import * as THREE from 'three';
import { COLORS } from '../scene/setup';

/**
 * Shared PBR palette for Operation SUNSET military-island environment.
 * Procedural only — no external textures.
 */
export const ENV_PALETTE = {
  concrete: 0x6a6e72,
  concreteDark: 0x4a4e54,
  asphalt: 0x2c3036,
  asphaltWet: 0x24282e,
  olive: 0x4a5a3a,
  oliveDark: 0x2e3a28,
  steel: 0x6a7480,
  steelDark: 0x3a424c,
  rust: 0x8a4a30,
  rustDark: 0x5a3020,
  sandbag: 0x8a7a58,
  wood: 0x5a4028,
  pine: COLORS.pine,
  pineDark: COLORS.pineDark,
  scrub: COLORS.grassDark,
  rock: COLORS.rock,
  rockDark: COLORS.rockDark,
  sand: COLORS.sand,
  ocean: 0x1a4a58,
  oceanDeep: 0x0c2a36,
  foam: 0x8ec8c8,
  navGreen: COLORS.neonGreen,
  navAmber: COLORS.orangeSun,
  navHot: COLORS.orangeHot,
  accentTeal: COLORS.tealMid,
  hangarRoof: 0x3a4550,
  warning: 0xc45a20,
} as const;

export interface PbrOpts {
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  side?: THREE.Side;
  name?: string;
  emissive?: number;
  emissiveIntensity?: number;
  envMapIntensity?: number;
}

/** Shared MeshStandardMaterial factory — keeps draw-call materials consistent. */
export function makePBR(color: number, opts: PbrOpts = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0.08,
    flatShading: opts.flatShading ?? true,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite ?? true,
    side: opts.side ?? THREE.FrontSide,
    envMapIntensity: opts.envMapIntensity ?? 0.55,
  });
  if (opts.emissive != null) {
    mat.emissive = new THREE.Color(opts.emissive);
    mat.emissiveIntensity = opts.emissiveIntensity ?? 0.8;
  }
  if (opts.name) mat.name = opts.name;
  return mat;
}

export function makeEmissivePBR(
  color: number,
  intensity = 1.1,
  opts: PbrOpts = {},
): THREE.MeshStandardMaterial {
  return makePBR(color, {
    roughness: 0.45,
    metalness: 0.15,
    emissive: color,
    emissiveIntensity: intensity,
    ...opts,
  });
}

/** Preset kits used across modules (clone when mutation is needed). */
export function createEnvMaterialKit() {
  return {
    concrete: makePBR(ENV_PALETTE.concrete, { roughness: 0.9, name: 'env-concrete' }),
    concreteDark: makePBR(ENV_PALETTE.concreteDark, { roughness: 0.92, name: 'env-concrete-d' }),
    asphalt: makePBR(ENV_PALETTE.asphalt, {
      roughness: 0.95,
      metalness: 0.02,
      name: 'env-asphalt',
    }),
    olive: makePBR(ENV_PALETTE.olive, { roughness: 0.88, name: 'env-olive' }),
    oliveDark: makePBR(ENV_PALETTE.oliveDark, { roughness: 0.9, name: 'env-olive-d' }),
    steel: makePBR(ENV_PALETTE.steel, { roughness: 0.45, metalness: 0.55, name: 'env-steel' }),
    steelDark: makePBR(ENV_PALETTE.steelDark, {
      roughness: 0.5,
      metalness: 0.6,
      name: 'env-steel-d',
    }),
    rust: makePBR(ENV_PALETTE.rust, { roughness: 0.78, metalness: 0.25, name: 'env-rust' }),
    wood: makePBR(ENV_PALETTE.wood, { roughness: 0.92, metalness: 0.02, name: 'env-wood' }),
    sandbag: makePBR(ENV_PALETTE.sandbag, { roughness: 0.95, name: 'env-sandbag' }),
    hangarRoof: makePBR(ENV_PALETTE.hangarRoof, {
      roughness: 0.55,
      metalness: 0.35,
      name: 'env-hangar-roof',
    }),
    pine: makePBR(ENV_PALETTE.pine, { roughness: 0.9, name: 'env-pine' }),
    pineDark: makePBR(ENV_PALETTE.pineDark, { roughness: 0.9, name: 'env-pine-d' }),
    scrub: makePBR(ENV_PALETTE.scrub, { roughness: 0.95, name: 'env-scrub' }),
    rock: makePBR(ENV_PALETTE.rock, { roughness: 0.96, name: 'env-rock' }),
    rockDark: makePBR(ENV_PALETTE.rockDark, { roughness: 0.96, name: 'env-rock-d' }),
    sand: makePBR(ENV_PALETTE.sand, { roughness: 0.98, metalness: 0.02, name: 'env-sand' }),
    ocean: makePBR(ENV_PALETTE.ocean, {
      roughness: 0.18,
      metalness: 0.72,
      transparent: true,
      opacity: 0.78,
      name: 'env-ocean',
    }),
    foam: makePBR(ENV_PALETTE.foam, {
      roughness: 0.65,
      metalness: 0.05,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
      name: 'env-foam',
    }),
    navGreen: makeEmissivePBR(ENV_PALETTE.navGreen, 1.25, { name: 'env-nav-green' }),
    navAmber: makeEmissivePBR(ENV_PALETTE.navAmber, 1.15, { name: 'env-nav-amber' }),
    navHot: makeEmissivePBR(ENV_PALETTE.navHot, 1.2, { name: 'env-nav-hot' }),
    warning: makePBR(ENV_PALETTE.warning, {
      roughness: 0.55,
      metalness: 0.2,
      emissive: ENV_PALETTE.warning,
      emissiveIntensity: 0.35,
      name: 'env-warning',
    }),
  };
}

export type EnvMaterialKit = ReturnType<typeof createEnvMaterialKit>;
