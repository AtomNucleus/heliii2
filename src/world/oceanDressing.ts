import * as THREE from 'three';
import { createEnvMaterialKit, ENV_PALETTE, makePBR } from './materials';
import { disposeObject3D } from './envUtil';
import type { EnvBudget } from './envBudget';

export interface OceanDressingHandle {
  group: THREE.Group;
  water: THREE.Mesh;
  setVisibleCount(detail: number): void;
  update(dt: number, time: number): void;
  getFoamMeshes(): THREE.Mesh[];
  dispose(): void;
}

/**
 * Island ocean ring: deep water plane, shoreline foam, distant swell cards.
 * Frames the Fruzer underlay as a military island in open water.
 */
export function createOceanDressing(
  mapHalfExtent: number,
  budget: EnvBudget,
): OceanDressingHandle {
  const group = new THREE.Group();
  group.name = 'env-ocean';
  const kit = createEnvMaterialKit();

  const oceanSize = Math.max(420, mapHalfExtent * 4.2);
  const waterGeo = new THREE.PlaneGeometry(oceanSize, oceanSize, 1, 1);
  const waterMat = kit.ocean.clone();
  waterMat.color.setHex(ENV_PALETTE.oceanDeep);
  waterMat.opacity = 0.82;
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.55;
  water.receiveShadow = true;
  water.name = 'env-ocean-plane';
  water.renderOrder = -50;
  water.userData.baseY = -0.55;
  water.userData.baseOpacity = 0.82;
  group.add(water);

  // Mid shelf — slightly brighter ring just outside the playable island
  const shelfR = mapHalfExtent * 1.15;
  const shelf = new THREE.Mesh(
    new THREE.RingGeometry(mapHalfExtent * 0.92, shelfR, 64),
    makePBR(ENV_PALETTE.ocean, {
      roughness: 0.22,
      metalness: 0.65,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      name: 'env-ocean-shelf',
    }),
  );
  shelf.rotation.x = -Math.PI / 2;
  shelf.position.y = -0.28;
  shelf.renderOrder = -40;
  group.add(shelf);

  // Shoreline foam bands
  const foamNodes: THREE.Mesh[] = [];
  const foamCount = Math.min(budget.oceanDetail, 8);
  for (let i = 0; i < foamCount; i++) {
    const inner = mapHalfExtent * (0.88 + i * 0.012);
    const outer = inner + 1.8 + (i % 2) * 0.6;
    const foam = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48),
      kit.foam.clone(),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.06 + i * 0.01;
    foam.renderOrder = 1;
    foam.name = `ocean-foam-${i}`;
    group.add(foam);
    foamNodes.push(foam);
  }

  // Distant swell billboards — cheap horizon motion
  const swellMat = makePBR(ENV_PALETTE.ocean, {
    roughness: 0.35,
    metalness: 0.4,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const swellNodes: THREE.Mesh[] = [];
  const swellN = Math.min(budget.oceanDetail, 6);
  for (let i = 0; i < swellN; i++) {
    const a = (i / swellN) * Math.PI * 2;
    const r = mapHalfExtent * 1.55;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(28 + (i % 3) * 8, 3.5), swellMat);
    mesh.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
    mesh.rotation.y = -a + Math.PI * 0.5;
    mesh.renderOrder = -30;
    group.add(mesh);
    swellNodes.push(mesh);
  }

  return {
    group,
    water,
    setVisibleCount(detail: number) {
      for (let i = 0; i < foamNodes.length; i++) foamNodes[i].visible = i < detail;
      for (let i = 0; i < swellNodes.length; i++) swellNodes[i].visible = i < detail;
    },
    update(_dt: number, time: number) {
      // Water plane shimmer may be driven by VisualEffects.WaterResponse.
      // Keep foam/swell motion here as a baseline.
      for (let i = 0; i < foamNodes.length; i++) {
        const fmat = foamNodes[i].material as THREE.MeshStandardMaterial;
        fmat.opacity = 0.32 + 0.14 * Math.sin(time * 0.7 + i * 0.9);
      }
      for (let i = 0; i < swellNodes.length; i++) {
        swellNodes[i].position.y = 0.35 + Math.sin(time * 0.55 + i) * 0.22;
      }
    },
    getFoamMeshes(): THREE.Mesh[] {
      return foamNodes.slice();
    },
    dispose() {
      disposeObject3D(group);
      group.parent?.remove(group);
    },
  };
}
