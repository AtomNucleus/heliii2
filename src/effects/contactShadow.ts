import * as THREE from 'three';
import type { QualitySettings } from './quality';

/**
 * Soft contact blob under the craft — cheap ground contact cue.
 * Complements cascaded/PCF shadows; not a screen-space contact shadow.
 */
export class ContactShadow {
  readonly mesh: THREE.Mesh;
  private enabled = true;
  private strength = 1;
  private readonly maxOpacity = 0.42;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CircleGeometry(1.8, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0a1218,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.name = 'contact-shadow';
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  applyQuality(q: QualitySettings) {
    this.enabled = q.contactShadow;
    this.strength = q.tier === 'low' ? 0.55 : q.tier === 'medium' ? 0.8 : 1;
    this.mesh.visible = this.enabled;
  }

  update(
    heliPos: THREE.Vector3,
    altitude: number,
    getGroundHeight?: (x: number, z: number) => number,
  ) {
    if (!this.enabled) {
      this.mesh.visible = false;
      return;
    }
    const gy = getGroundHeight ? getGroundHeight(heliPos.x, heliPos.z) : heliPos.y - altitude;
    const alt = Math.max(0.05, heliPos.y - gy);
    this.mesh.visible = alt < 28;
    if (!this.mesh.visible) return;

    this.mesh.position.set(heliPos.x, gy + 0.04, heliPos.z);
    const spread = 1 + Math.min(2.2, alt * 0.12);
    this.mesh.scale.setScalar(spread);
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    const proximity = 1 - Math.min(1, alt / 22);
    mat.opacity = this.maxOpacity * proximity * proximity * this.strength;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
