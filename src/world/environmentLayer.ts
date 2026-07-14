import * as THREE from 'three';
import { detectEnvTier, getEnvBudget, type EnvBudget, type EnvQualityTier } from './envBudget';
import { createCityDressing, type CameraOccluderBox, type CityDressingHandle } from './cityDressing';
import { createVegetation, type VegetationHandle } from './vegetation';
import { createRoadsProps, type RoadsPropsHandle } from './roadsProps';
import { createLandmarks, type LandmarkHandle } from './landmarks';
import { createTerrainDetail, type TerrainDetailHandle } from './terrainDetail';
import { createEnvAnimation, type EnvAnimationHandle } from './envAnimation';
import { createCombatSpaces, type CombatSpace, type CombatSpacesHandle } from './combatSpaces';
import { createDistricts, type DistrictInfo, type DistrictsHandle } from './districts';
import { createOceanDressing, type OceanDressingHandle } from './oceanDressing';
import { createCoastline, type CoastlineHandle } from './coastline';

export type { CombatSpace, DistrictInfo, EnvBudget, EnvQualityTier };
export type { CameraOccluderBox };

/** Soft cap so the spatial hash stays cheap for chase-camera queries. */
const CAMERA_OCCLUDER_CAP = 600;
const MIN_OCCLUDER_HEIGHT = 2.5;
const MIN_OCCLUDER_FOOTPRINT = 3;
const PLANE_HEIGHT_SKIP = 0.3;

export interface EnvironmentLayerOptions {
  getGroundHeight: (x: number, z: number) => number;
  mapHalfExtent: number;
  spawn: THREE.Vector3;
  /** Optional quality tier; defaults to hardware detect */
  tier?: EnvQualityTier;
  /** Parent group (typically world group). If omitted, caller must add `group`. */
  parent?: THREE.Object3D;
  /** Optional Fruzer underlay root to soften toward the PBR overlay */
  underlayRoot?: THREE.Object3D;
}

/**
 * Cohesive military-island environment layer over the Fruzer base map.
 *
 * Integration (from mapLoader / boot):
 * ```ts
 * const environment = createEnvironmentLayer({
 *   getGroundHeight, mapHalfExtent, spawn, parent: worldGroup, underlayRoot: mapScaled,
 * });
 * // each frame:
 * environment.update(dt, time);
 * environment.applyQuality(fx.quality.current);
 * // combat:
 * missionOpts.combatSpaces = environment.combatSpaces;
 * ```
 */
export class EnvironmentLayer {
  readonly group = new THREE.Group();
  readonly combatSpaces: CombatSpace[];
  readonly districts: DistrictInfo[];
  /** Ocean plane for optional `world.water` wiring */
  readonly water: THREE.Mesh;

  private budget: EnvBudget;
  private city: CityDressingHandle;
  private vegetation: VegetationHandle;
  private roads: RoadsPropsHandle;
  private landmarks: LandmarkHandle;
  private terrain: TerrainDetailHandle;
  private anim: EnvAnimationHandle;
  private combat: CombatSpacesHandle;
  private districtLayer: DistrictsHandle;
  private ocean: OceanDressingHandle;
  private coast: CoastlineHandle;
  private underlayRoot: THREE.Object3D | null;
  private disposed = false;
  private lastTier: EnvQualityTier | null = null;

  getFoamMeshes(): THREE.Mesh[] {
    return this.ocean.getFoamMeshes();
  }

  constructor(opts: EnvironmentLayerOptions) {
    this.group.name = 'environment-layer';
    this.budget = getEnvBudget(opts.tier ?? detectEnvTier());
    this.underlayRoot = opts.underlayRoot ?? null;

    const { getGroundHeight, mapHalfExtent, spawn } = opts;

    this.ocean = createOceanDressing(mapHalfExtent, this.budget);
    this.coast = createCoastline(getGroundHeight, mapHalfExtent, this.budget);
    this.terrain = createTerrainDetail(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.districtLayer = createDistricts(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.city = createCityDressing(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.vegetation = createVegetation(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.roads = createRoadsProps(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.landmarks = createLandmarks(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.combat = createCombatSpaces(getGroundHeight, mapHalfExtent, this.budget, spawn);
    this.anim = createEnvAnimation(
      getGroundHeight,
      mapHalfExtent,
      this.budget,
      spawn,
      this.landmarks.anchors,
    );

    this.combatSpaces = this.combat.spaces;
    this.districts = this.districtLayer.districts;
    this.water = this.ocean.water;

    this.group.add(
      this.ocean.group,
      this.coast.group,
      this.terrain.group,
      this.districtLayer.group,
      this.roads.group,
      this.vegetation.group,
      this.city.group,
      this.landmarks.group,
      this.combat.group,
      this.anim.group,
    );

    this.applyUnderlayTint(this.budget.fruzerUnderlay);
    opts.parent?.add(this.group);

    console.info('[env] military-island layer ready', {
      tier: this.budget.tier,
      combatSpaces: this.combatSpaces.length,
      districts: this.districts.length,
      landmarks: this.landmarks.anchors.length,
    });
  }

  get tier(): EnvQualityTier {
    return this.budget.tier;
  }

  get budgetSnapshot(): Readonly<EnvBudget> {
    return this.budget;
  }

  /** Soften Fruzer MeshBasic underlay so PBR overlay reads as the hero surface. */
  private applyUnderlayTint(factor: number) {
    if (!this.underlayRoot) return;
    const f = THREE.MathUtils.clamp(factor, 0.2, 1);
    this.underlayRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshBasicMaterial;
        if (!mat.isMeshBasicMaterial) continue;
        if (mat.userData.envBaseColor == null) {
          mat.userData.envBaseColor = mat.color.clone();
        }
        mat.color.copy(mat.userData.envBaseColor as THREE.Color).multiplyScalar(f);
      }
    });
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
    this.districtLayer.setVisibleCount(this.budget.compounds, this.budget.navMarkers);
    this.ocean.setVisibleCount(this.budget.oceanDetail);
    this.coast.setVisibleCount(this.budget.oceanDetail);
    this.anim.setBudgets(
      this.budget.flags,
      this.budget.blinkLights,
      this.budget.smokeColumns,
      this.budget.birds,
    );
    this.applyUnderlayTint(this.budget.fruzerUnderlay);
  }

  /** Depot / AA / approach anchors for combat layout hooks. */
  getDepotSpaces(): CombatSpace[] {
    return this.combatSpaces.filter((s) => s.kind === 'depot');
  }

  getDistrict(kind: DistrictInfo['kind']): DistrictInfo | undefined {
    return this.districts.find((d) => d.kind === kind);
  }

  /**
   * World AABBs for chase-camera occlusion only (city analytics + district/landmark meshes).
   * Not used for heli flight collision.
   */
  getCameraOccluders(): CameraOccluderBox[] {
    const out: CameraOccluderBox[] = this.city.cameraOccluders.map((b) => ({ ...b }));

    const scratch = new THREE.Box3();
    const collectFrom = (root: THREE.Object3D) => {
      root.updateWorldMatrix(true, true);
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) return;
        scratch.setFromObject(mesh);
        if (scratch.isEmpty()) return;
        const height = scratch.max.y - scratch.min.y;
        if (height < PLANE_HEIGHT_SKIP) return; // planes / decals
        if (height < MIN_OCCLUDER_HEIGHT) return;
        const sx = scratch.max.x - scratch.min.x;
        const sz = scratch.max.z - scratch.min.z;
        if (sx * sz < MIN_OCCLUDER_FOOTPRINT) return;
        out.push({
          minX: scratch.min.x,
          minY: scratch.min.y,
          minZ: scratch.min.z,
          maxX: scratch.max.x,
          maxY: scratch.max.y,
          maxZ: scratch.max.z,
        });
      });
    };

    collectFrom(this.districtLayer.group);
    collectFrom(this.landmarks.group);

    if (out.length <= CAMERA_OCCLUDER_CAP) return out;

    // Prefer tallest boxes when capping
    out.sort((a, b) => b.maxY - b.minY - (a.maxY - a.minY));
    return out.slice(0, CAMERA_OCCLUDER_CAP);
  }

  update(dt: number, time: number) {
    if (this.disposed) return;
    this.ocean.update(dt, time);
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
    this.districtLayer.dispose();
    this.ocean.dispose();
    this.coast.dispose();
    this.group.parent?.remove(this.group);
  }
}

export function createEnvironmentLayer(opts: EnvironmentLayerOptions): EnvironmentLayer {
  return new EnvironmentLayer(opts);
}
