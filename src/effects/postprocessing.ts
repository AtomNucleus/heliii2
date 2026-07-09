import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { COLORS } from '../scene/setup';

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.28, // strength — avoid crushing terrain on software GL
    0.4, // radius
    0.85, // threshold — only bright emissives bloom
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  };
  window.addEventListener('resize', onResize);
  onResize();

  return { composer, bloom, onResize };
}

/** Trail particles behind the helicopter */
export class ExhaustParticles {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private readonly count = 80;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      this.life[i] = Math.random();
      this.positions[i * 3 + 1] = -100;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const mat = new THREE.PointsMaterial({
      color: COLORS.orangeGlow,
      size: 0.35,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt: number, heliPos: THREE.Vector3, heliQuat: THREE.Quaternion, speed: number) {
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(heliQuat).normalize();
    const emitPos = heliPos.clone().addScaledVector(back, 1.2);
    emitPos.y -= 0.2;

    const rate = 0.02 + speed * 0.002;

    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt * (0.8 + Math.random());
      if (this.life[i] <= 0 && Math.random() < rate * 10) {
        this.life[i] = 1;
        this.positions[i * 3] = emitPos.x + (Math.random() - 0.5) * 0.4;
        this.positions[i * 3 + 1] = emitPos.y + (Math.random() - 0.5) * 0.3;
        this.positions[i * 3 + 2] = emitPos.z + (Math.random() - 0.5) * 0.4;
        this.velocities[i * 3] = back.x * (2 + Math.random() * 3) + (Math.random() - 0.5);
        this.velocities[i * 3 + 1] = 0.5 + Math.random() * 1.5;
        this.velocities[i * 3 + 2] = back.z * (2 + Math.random() * 3) + (Math.random() - 0.5);
      }

      if (this.life[i] > 0) {
        this.positions[i * 3] += this.velocities[i * 3] * dt;
        this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
        this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
        this.velocities[i * 3 + 1] += 2 * dt;
      } else {
        this.positions[i * 3 + 1] = -100;
      }
    }

    const attr = this.points.geometry.attributes.position as THREE.BufferAttribute;
    attr.needsUpdate = true;

    const mat = this.points.material as THREE.PointsMaterial;
    mat.opacity = 0.35 + Math.min(0.4, speed / 40);
  }
}
