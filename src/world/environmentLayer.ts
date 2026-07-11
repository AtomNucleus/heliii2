import * as THREE from 'three';
import { detectEnvTier, getEnvBudget, type EnvBudget, type EnvQualityTier } from './envBudget';
import { createCityDressing, type CityDressingHandle } from './cityDressing';
import { createVegetation, type VegetationHandle } from './vegetation';
import { createRoadsProps, type RoadsPropsHandle } from './roadsProps';
import { createLandmarks, type LandmarkHandle } from './landmarks';
import { createTerrainDetail, type TerrainDetailHandle } from './terrainDetail';
import { createEnvAnimation, type EnvAnimationHandle } from './envAnimation';
import { createCombatSpaces, type CombatSpace, type CombatSpacesHandle } from './combatSpaces';

export type { CombatSpace, EnvBudget, EnvQualityTier };

export interface EnvironmentLayerOptions {
  getGroundHeight: (x: number, z: number) => number;
  mapHalfExtent: number;
  spawn: THREE.Vector3;
  /** Optional quality tier; defaults to hardware detect */
  tier?: EnvQualityTier;
  /** Parent group (typically world group). If omitted, caller must add `group`. */
  parent?: THREE.Object3D;
}

/**
 * Cohesive higher-detail environment layer for the Fruzer base map.
 * Procedural/instanced dressing + authored combat spaces; keeps the licensed GLB.
 */
export class EnvironmentLayer {
  readonly group = new THREE.Group();
  readonly combatSpaces: CombatSpace[];

  private budget: EnvBudget;
  private city: CityDressingHandle;
  private vegetation: VegetationHandle;
  private roads: RoadsPropsHandle;
  private landmarks: LandmarkHandle;
  private terrain: TerrainDetailHandle;
  private anim: EnvAnimationHandle;
  private combat: CombatSpacesHandle;
  private disposed = false;
  private lastTier: EnvQualityTier | null = null;

  constructor(opts: EnvironmentLayerOptions) {
    this.group.name = 'environment-layer';
    this.budget = getEnvBudget(opts.tier ?? detectEnvTier());

    const { getGroundHeight, mapHalfExtent, spawn } = opts;

    this.city = createCityDressing(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.vegetation = createVegetation(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.roads = createRoadsProps(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.landmarks = createLandmarks(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.terrain = createTerrainDetail(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.combat = createCombatSpaces(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.anim = createEnvAnimation(
      getGroundHeight,
      mapHalfExtent,
      this.budget,
      spawn,
      this.landmarks.anchors,
    );

    this.combatSpaces = this.combat.spaces;

    this.group.add(
      this.terrain.group,
      this.roads.group,
      this.vegetation.group,
      this.city.group,
      this.landmarks.group,
      this.combat.group,
      this.anim.group,
    );

    opts.parent?.add(this.group);

    console.info('[env] layer ready', {
      tier: this.budget.tier,
      combatSpaces: this.combatSpaces.length,
      landmarks: this.landmarks.anchors.length,
    });
  }

  get tier(): EnvQualityTier {
    return this.budget.tier;
  }

  /** Apply a quality tier (from AdaptiveQuality or explicit). */
  applyQuality(tier: EnvQualityTier | { tier?: string } | string) {
    const tRaw =
      typeof tier === 'string'
        ? tier
        : (tier as { tier?: string }).tier ?? 'medium';
    const next = getEnvBudget(tRaw);
    if (this.lastTier === next.tier) return;
    this.lastTier = next.tier;
    this.budget = next;
    this.city.setVisibleCount(this.budget.buildings, this.budget.rooftopProps);
    this.vegetation.setVisibleCount(this.budget.trees, this.budget.bushes);
    this.roads.setVisibleCount({
      streetLamps: this.budget.streetLamps,
      barriers: this.budget.barriers,
      crates: this.budget.crates,
      cones: this.budget.cones,
    });
    this.landmarks.setVisibleCount(this.budget.landmarks);
    this.terrain.setVisibleCount(this.budget.groundPatches, this.budget.rubble);
    this.combat.setVisibleCount(this.budget.combatSpaces);
    this.anim.setBudgets(
      this.budget.flags,
      this.budget.blinkLights,
      this.budget.smokeColumns,
      this.budget.birds,
    );
  }

  /** Depot / AA / approach anchors for combat layout hooks. */
  getDepotSpaces(): CombatSpace[] {
    return this.combatSpaces.filter((s) => s.kind === 'depot');
  }

  update(dt: number, time: number) {
    if (this.disposed) return;
    if (this.budget.animate) this.anim.update(dt, time);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.city.dispose();
    this.vegetation.dispose();
    this.roads.dispose();
    this.landmarks.dispose();
    this.terrain.dispose();
    this.combat.dispose();
    this.anim.dispose();
    this.group.parent?.remove(this.group);
  }
}

export function createEnvironmentLayer(opts: EnvironmentLayerOptions): EnvironmentLayer {
  return new EnvironmentLayer(opts);
}
