import * as THREE from 'three';

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface FlightState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
}

function createInputState(): InputState {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
  };
}

function resetInputState(input: InputState) {
  input.forward = false;
  input.back = false;
  input.left = false;
  input.right = false;
  input.up = false;
  input.down = false;
}

/**
 * Arcade helicopter controller: WASD / arrows + Space/Shift,
 * soft banking, chase camera, soft ground collision.
 */
export class HelicopterController {
  readonly heli: THREE.Group;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: InputState = createInputState();

  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private velocity = new THREE.Vector3();
  private getGroundHeight: (x: number, z: number) => number;
  private readonly keyboardInput = createInputState();
  private readonly touchInput = createInputState();

  private readonly maxSpeed = 55;
  private readonly accel = 28;
  private readonly verticalAccel = 38;
  private readonly drag = 1.8;
  private readonly turnSpeed = 2.2;
  private worldBound = 105;
  private maxAltitude = 200;

  // Pull back for Fruzer-scale base so the pad / roads read in frame
  private camOffset = new THREE.Vector3(0, 10, 28);
  private camLook = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camSmooth = new THREE.Vector3();
  private lookSmooth = new THREE.Vector3();

  private mainRotor: THREE.Object3D | null = null;
  private tailRotor: THREE.Object3D | null = null;
  private rotorBlur: THREE.Mesh | null = null;

  enabled = false;

  constructor(
    heli: THREE.Group,
    camera: THREE.PerspectiveCamera,
    getGroundHeight: (x: number, z: number) => number,
  ) {
    this.heli = heli;
    this.camera = camera;
    this.getGroundHeight = getGroundHeight;

    this.mainRotor = heli.getObjectByName('mainRotor') ?? null;
    this.tailRotor = heli.getObjectByName('tailRotor') ?? null;
    this.rotorBlur = (heli.getObjectByName('rotorBlur') as THREE.Mesh) ?? null;

    this.bindInput();
  }

  private bindInput() {
    const setKey = (code: string, pressed: boolean) => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keyboardInput.forward = pressed;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keyboardInput.back = pressed;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keyboardInput.left = pressed;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keyboardInput.right = pressed;
          break;
        case 'Space':
          this.keyboardInput.up = pressed;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keyboardInput.down = pressed;
          break;
      }
      this.syncInput();
    };

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      setKey(e.code, true);
    });
    window.addEventListener('keyup', (e) => setKey(e.code, false));
  }

  setTouchInput(nextInput: Partial<InputState>) {
    Object.assign(this.touchInput, nextInput);
    this.syncInput();
  }

  clearTouchInput() {
    resetInputState(this.touchInput);
    this.syncInput();
  }

  private syncInput() {
    this.input.forward = this.keyboardInput.forward || this.touchInput.forward;
    this.input.back = this.keyboardInput.back || this.touchInput.back;
    this.input.left = this.keyboardInput.left || this.touchInput.left;
    this.input.right = this.keyboardInput.right || this.touchInput.right;
    this.input.up = this.keyboardInput.up || this.touchInput.up;
    this.input.down = this.keyboardInput.down || this.touchInput.down;
  }

  /** Soft clamp half-extent for XZ (map-dependent) */
  setWorldBound(halfExtent: number) {
    this.worldBound = halfExtent;
  }

  setMaxAltitude(y: number) {
    this.maxAltitude = y;
  }

  reset(spawn: THREE.Vector3) {
    this.heli.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.heli.rotation.set(0, 0, 0);
    resetInputState(this.keyboardInput);
    resetInputState(this.touchInput);
    this.syncInput();
    this.camSmooth.copy(spawn).add(new THREE.Vector3(0, this.camOffset.y, this.camOffset.z));
    this.lookSmooth.copy(spawn);
    this.camera.position.copy(this.camSmooth);
    this.camera.lookAt(this.lookSmooth);
  }

  getSpeed(): number {
    return this.velocity.length();
  }

  getAltitude(): number {
    const ground = this.getGroundHeight(this.heli.position.x, this.heli.position.z);
    return Math.max(0, this.heli.position.y - ground);
  }

  getState(): FlightState {
    return {
      position: this.heli.position.clone(),
      velocity: this.velocity.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
      roll: this.roll,
      speed: this.getSpeed(),
    };
  }

  update(dt: number) {
    // Rotor animation always runs for visual life.
    // Main rotor: spin about Y (blades in XZ). Tail: spin about X (blades in YZ).
    const rotorSpeed = 28 + this.getSpeed() * 0.4;
    if (this.mainRotor) this.mainRotor.rotation.y += rotorSpeed * dt;
    if (this.tailRotor) this.tailRotor.rotation.x += rotorSpeed * 1.6 * dt;
    if (this.rotorBlur) {
      const mat = this.rotorBlur.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.2 + Math.min(0.25, this.getSpeed() / this.maxSpeed * 0.25);
    }

    if (!this.enabled) {
      this.updateCamera(dt);
      return;
    }

    // Yaw
    if (this.input.left) this.yaw += this.turnSpeed * dt;
    if (this.input.right) this.yaw -= this.turnSpeed * dt;

    // Forward thrust in facing direction
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const accel = new THREE.Vector3();

    if (this.input.forward) accel.addScaledVector(forward, this.accel);
    if (this.input.back) accel.addScaledVector(forward, -this.accel * 0.65);
    if (this.input.up) accel.y += this.verticalAccel;
    if (this.input.down) accel.y -= this.verticalAccel;

    // Light gravity / hover bias — skip while climbing so Space actually lifts
    if (!this.input.up && !this.input.down) {
      accel.y -= 4;
    }

    this.velocity.addScaledVector(accel, dt);

    // Drag (lighter vertical so climb works on large maps)
    this.velocity.x *= Math.exp(-this.drag * dt);
    this.velocity.z *= Math.exp(-this.drag * dt);
    this.velocity.y *= Math.exp(-0.75 * dt);

    // Clamp speed
    const horiz = new THREE.Vector2(this.velocity.x, this.velocity.z);
    if (horiz.length() > this.maxSpeed) {
      horiz.setLength(this.maxSpeed);
      this.velocity.x = horiz.x;
      this.velocity.z = horiz.y;
    }
    this.velocity.y = THREE.MathUtils.clamp(this.velocity.y, -28, 32);

    this.heli.position.addScaledVector(this.velocity, dt);

    // Soft ground collision
    const ground = this.getGroundHeight(this.heli.position.x, this.heli.position.z);
    const minY = ground + 2.0;
    if (this.heli.position.y < minY) {
      this.heli.position.y = minY;
      if (this.velocity.y < 0) this.velocity.y *= -0.2;
    }

    // World bounds soft clamp
    const bound = this.worldBound;
    this.heli.position.x = THREE.MathUtils.clamp(this.heli.position.x, -bound, bound);
    this.heli.position.z = THREE.MathUtils.clamp(this.heli.position.z, -bound, bound);
    this.heli.position.y = Math.min(this.heli.position.y, this.maxAltitude);

    // Visual banking / pitch
    const targetPitch = (this.input.forward ? -0.28 : 0) + (this.input.back ? 0.18 : 0);
    const targetRoll = (this.input.left ? 0.35 : 0) + (this.input.right ? -0.35 : 0);
    this.pitch = THREE.MathUtils.damp(this.pitch, targetPitch, 6, dt);
    this.roll = THREE.MathUtils.damp(this.roll, targetRoll, 6, dt);

    this.heli.rotation.order = 'YXZ';
    this.heli.rotation.y = this.yaw;
    this.heli.rotation.x = this.pitch;
    this.heli.rotation.z = this.roll;

    this.updateCamera(dt);
  }

  private updateCamera(dt: number) {
    const back = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.camPos
      .copy(this.heli.position)
      .addScaledVector(back, this.camOffset.z)
      .add(new THREE.Vector3(0, this.camOffset.y, 0));

    // Slight look-ahead
    this.camLook.copy(this.heli.position).add(new THREE.Vector3(0, 1.2, 0));
    this.camLook.addScaledVector(
      new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)),
      4,
    );

    this.camSmooth.lerp(this.camPos, 1 - Math.exp(-4 * dt));
    this.lookSmooth.lerp(this.camLook, 1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.camSmooth);
    this.camera.lookAt(this.lookSmooth);
  }
}
