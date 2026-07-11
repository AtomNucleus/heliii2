import type { AudioBus } from './bus';
import type { SpatialAudio } from './spatial';
import type { SpatialPoint, Vec3Like } from './types';
import { playTone, playNoiseBurst } from './synth';
import { clamp } from './util';

/**
 * Spatial combat one-shots: fire, hits, explosions, AA bolts.
 */
export class CombatSfx {
  private bus: AudioBus | null = null;
  private spatial: SpatialAudio | null = null;
  private lastFireAt = 0;
  private listener: Vec3Like = { x: 0, y: 0, z: 0 };
  private listenerVel: Vec3Like = { x: 0, y: 0, z: 0 };

  attach(bus: AudioBus, spatial: SpatialAudio) {
    this.bus = bus;
    this.spatial = spatial;
  }

  setListener(pos: Vec3Like, vel?: Vec3Like) {
    this.listener = pos;
    if (vel) this.listenerVel = vel;
  }

  playWeaponFire() {
    const bus = this.bus;
    if (!bus) return;
    const now = bus.ctx.currentTime;
    if (now - this.lastFireAt < 0.05) return;
    this.lastFireAt = now;
    bus.duck(0.2, 0.12);
    playNoiseBurst(bus, 0.07, 0.55, 1800, 400);
    playTone(bus, {
      type: 'square',
      freq: 220,
      freqEnd: 70,
      gain: 0.22,
      gainEnd: 0.0001,
      attack: 0.002,
      duration: 0.12,
    });
    playTone(bus, {
      type: 'sawtooth',
      freq: 90,
      freqEnd: 40,
      gain: 0.18,
      duration: 0.1,
    });
  }

  playWeaponHit(at?: SpatialPoint) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus) return;
    const dest = at && spatial ? spatial.createPanner(at, 10, 140) : undefined;
    playTone(bus, {
      type: 'triangle',
      freq: 880,
      freqEnd: 440,
      gain: 0.16,
      duration: 0.09,
      dest,
    });
    playTone(bus, {
      type: 'sine',
      freq: 1320,
      freqEnd: 660,
      gain: 0.1,
      duration: 0.08,
      delay: 0.02,
      dest,
    });
    this.disposePannerLater(dest, 0.2);
  }

  playExplosion(intensity = 1, at?: SpatialPoint) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus) return;
    const i = clamp(intensity, 0.4, 1.6);
    bus.duck(0.65 * Math.min(1, i), 0.55);
    const dest = at && spatial ? spatial.createPanner(at, 14, 220) : undefined;
    const pitch =
      at && spatial
        ? spatial.dopplerFactor(at, undefined, this.listener, this.listenerVel)
        : 1;
    playNoiseBurst(bus, 0.35 * i, 0.7 * i, 800, 60, { dest });
    playTone(bus, {
      type: 'sawtooth',
      freq: 48 * pitch,
      freqEnd: 18 * pitch,
      gain: 0.4 * i,
      duration: 0.55,
      dest,
    });
    playTone(bus, {
      type: 'triangle',
      freq: 90 * pitch,
      freqEnd: 30 * pitch,
      gain: 0.2 * i,
      duration: 0.4,
      delay: 0.04,
      dest,
    });
    playTone(bus, {
      type: 'sine',
      freq: 36 * pitch,
      freqEnd: 20 * pitch,
      gain: 0.25 * i,
      duration: 0.7,
      dest,
    });
    this.disposePannerLater(dest, 0.9);
  }

  playDamage() {
    const bus = this.bus;
    if (!bus) return;
    bus.duck(0.45, 0.3);
    playNoiseBurst(bus, 0.15, 0.4, 1200, 150);
    playTone(bus, {
      type: 'sawtooth',
      freq: 160,
      freqEnd: 55,
      gain: 0.22,
      duration: 0.28,
    });
    playTone(bus, {
      type: 'square',
      freq: 90,
      freqEnd: 40,
      gain: 0.12,
      duration: 0.22,
      delay: 0.03,
    });
  }

  /** Enemy AA bolt crack — spatial + Doppler. */
  playAaFire(at: SpatialPoint) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus || !spatial) return;
    const dest = spatial.createPanner(at, 8, 160);
    const pitch = spatial.dopplerFactor(
      at,
      { x: at.vx ?? 0, y: at.vy ?? 0, z: at.vz ?? 0 },
      this.listener,
      this.listenerVel,
    );
    playNoiseBurst(bus, 0.06, 0.35, 2400, 600, { dest });
    playTone(bus, {
      type: 'square',
      freq: 520 * pitch,
      freqEnd: 180 * pitch,
      gain: 0.14,
      duration: 0.1,
      dest,
    });
    this.disposePannerLater(dest, 0.25);
  }

  /** Incoming bolt whoosh near the listener. */
  playIncomingWhoosh(at: SpatialPoint) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus || !spatial) return;
    const dest = spatial.createPanner(at, 6, 80);
    const pitch = spatial.dopplerFactor(
      at,
      { x: at.vx ?? 0, y: at.vy ?? 0, z: at.vz ?? 0 },
      this.listener,
      this.listenerVel,
    );
    playNoiseBurst(bus, 0.18, 0.22, 3200 * pitch, 400, { dest, kind: 'pink' });
    playTone(bus, {
      type: 'sawtooth',
      freq: 900 * pitch,
      freqEnd: 220 * pitch,
      gain: 0.08,
      duration: 0.2,
      dest,
    });
    this.disposePannerLater(dest, 0.3);
  }

  private disposePannerLater(panner: PannerNode | undefined, afterSec: number) {
    if (!panner) return;
    window.setTimeout(() => {
      try {
        panner.disconnect();
      } catch {
        // ignore
      }
    }, afterSec * 1000);
  }
}
