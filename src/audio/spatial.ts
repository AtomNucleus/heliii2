import type { AudioBus } from './bus';
import type { Vec3Like } from './types';

/**
 * Lightweight spatial voice: PannerNode + optional Doppler via playbackRate-like
 * pitch on a dedicated gain chain. Listener is updated from heli pose each frame.
 */
export class SpatialAudio {
  private readonly bus: AudioBus;
  private listenerSet = false;

  constructor(bus: AudioBus) {
    this.bus = bus;
  }

  setListener(pos: Vec3Like, forward?: Vec3Like, up?: Vec3Like, velocity?: Vec3Like) {
    const ctx = this.bus.ctx;
    const listener = ctx.listener;
    const now = ctx.currentTime;

    if ('positionX' in listener) {
      listener.positionX.setTargetAtTime(pos.x, now, 0.05);
      listener.positionY.setTargetAtTime(pos.y, now, 0.05);
      listener.positionZ.setTargetAtTime(pos.z, now, 0.05);
      if (forward && up) {
        listener.forwardX.setTargetAtTime(forward.x, now, 0.08);
        listener.forwardY.setTargetAtTime(forward.y, now, 0.08);
        listener.forwardZ.setTargetAtTime(forward.z, now, 0.08);
        listener.upX.setTargetAtTime(up.x, now, 0.08);
        listener.upY.setTargetAtTime(up.y, now, 0.08);
        listener.upZ.setTargetAtTime(up.z, now, 0.08);
      }
    } else {
      // Legacy
      const legacy = listener as AudioListener & {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (
          fx: number,
          fy: number,
          fz: number,
          ux: number,
          uy: number,
          uz: number,
        ) => void;
      };
      legacy.setPosition?.(pos.x, pos.y, pos.z);
      if (forward && up) {
        legacy.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    }

    // Store velocity for Doppler helpers (Web Audio Doppler is deprecated)
    void velocity;
    this.listenerSet = true;
  }

  createPanner(pos: Vec3Like, refDistance = 12, maxDistance = 180): PannerNode {
    const ctx = this.bus.ctx;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.15;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 0;
    this.setPannerPosition(panner, pos);
    panner.connect(this.bus.sfx);
    return panner;
  }

  setPannerPosition(panner: PannerNode, pos: Vec3Like) {
    const now = this.bus.ctx.currentTime;
    if ('positionX' in panner) {
      panner.positionX.setValueAtTime(pos.x, now);
      panner.positionY.setValueAtTime(pos.y, now);
      panner.positionZ.setValueAtTime(pos.z, now);
    } else {
      (panner as PannerNode & { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(
        pos.x,
        pos.y,
        pos.z,
      );
    }
  }

  /**
   * Approximate Doppler factor from relative radial velocity.
   * Returns pitch multiplier ~0.85…1.2
   */
  dopplerFactor(
    sourcePos: Vec3Like,
    sourceVel: Vec3Like | undefined,
    listenerPos: Vec3Like,
    listenerVel: Vec3Like | undefined,
  ): number {
    const dx = sourcePos.x - listenerPos.x;
    const dy = sourcePos.y - listenerPos.y;
    const dz = sourcePos.z - listenerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    const svx = sourceVel?.x ?? 0;
    const svy = sourceVel?.y ?? 0;
    const svz = sourceVel?.z ?? 0;
    const lvx = listenerVel?.x ?? 0;
    const lvy = listenerVel?.y ?? 0;
    const lvz = listenerVel?.z ?? 0;

    // Closing speed (positive = approaching)
    const closing =
      (lvx - svx) * nx + (lvy - svy) * ny + (lvz - svz) * nz;
    const mach = closing / 340; // treat units ~m/s-ish arcade
    return Math.max(0.82, Math.min(1.22, 1 + mach * 0.35));
  }

  get ready() {
    return this.listenerSet;
  }
}
