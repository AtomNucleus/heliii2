import type { AudioBus } from './bus';
import type { SpatialAudio } from './spatial';
import type { SpatialPoint, Vec3Like } from './types';
import { playTone, playNoiseBurst } from './synth';
import { clamp } from './util';

/**
 * Spatial combat one-shots: fire, hits, layered explosions, AA bolts.
 */
export class CombatSfx {
  private bus: AudioBus | null = null;
  private spatial: SpatialAudio | null = null;
  private lastFireAt = 0;
  private lastWhooshAt = 0;
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
    if (now - this.lastFireAt < 0.045) return;
    this.lastFireAt = now;
    bus.duck(0.22, 0.1);

    // Muzzle crack
    playNoiseBurst(bus, 0.045, 0.62, 3200, 900);
    // Body thump
    playTone(bus, {
      type: 'square',
      freq: 210,
      freqEnd: 55,
      gain: 0.24,
      gainEnd: 0.0001,
      attack: 0.001,
      duration: 0.11,
    });
    // Sub punch
    playTone(bus, {
      type: 'sine',
      freq: 70,
      freqEnd: 32,
      gain: 0.2,
      duration: 0.14,
    });
    // Mid growl
    playTone(bus, {
      type: 'sawtooth',
      freq: 95,
      freqEnd: 40,
      gain: 0.14,
      duration: 0.09,
      delay: 0.008,
    });
    // Shell eject ping
    playTone(bus, {
      type: 'triangle',
      freq: 1850,
      freqEnd: 920,
      gain: 0.05,
      duration: 0.06,
      delay: 0.04,
    });
  }

  playWeaponHit(at?: SpatialPoint) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus) return;
    const dest = at && spatial ? spatial.createPanner(at, 10, 140) : undefined;
    playNoiseBurst(bus, 0.05, 0.28, 2200, 600, { dest });
    playTone(bus, {
      type: 'triangle',
      freq: 920,
      freqEnd: 380,
      gain: 0.17,
      duration: 0.1,
      dest,
    });
    playTone(bus, {
      type: 'sine',
      freq: 1480,
      freqEnd: 700,
      gain: 0.1,
      duration: 0.08,
      delay: 0.018,
      dest,
    });
    playTone(bus, {
      type: 'square',
      freq: 240,
      freqEnd: 90,
      gain: 0.08,
      duration: 0.07,
      delay: 0.01,
      dest,
    });
    this.disposePannerLater(dest, 0.25);
  }

  playExplosion(intensity = 1, at?: SpatialPoint) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus) return;
    const i = clamp(intensity, 0.4, 1.8);
    bus.duck(0.7 * Math.min(1, i), 0.65);
    const dest = at && spatial ? spatial.createPanner(at, 14, 240) : undefined;
    const pitch =
      at && spatial
        ? spatial.dopplerFactor(at, undefined, this.listener, this.listenerVel)
        : 1;

    // Initial crack
    playNoiseBurst(bus, 0.08 * i, 0.75 * i, 2400, 400, { dest });
    // Body roar
    playNoiseBurst(bus, 0.42 * i, 0.55 * i, 700, 50, { dest, kind: 'brown', delay: 0.02 });
    // Sub boom
    playTone(bus, {
      type: 'sine',
      freq: 42 * pitch,
      freqEnd: 16 * pitch,
      gain: 0.42 * i,
      duration: 0.7,
      dest,
    });
    playTone(bus, {
      type: 'sawtooth',
      freq: 55 * pitch,
      freqEnd: 20 * pitch,
      gain: 0.32 * i,
      duration: 0.5,
      dest,
    });
    // Mid debris
    playTone(bus, {
      type: 'triangle',
      freq: 110 * pitch,
      freqEnd: 35 * pitch,
      gain: 0.18 * i,
      duration: 0.45,
      delay: 0.05,
      dest,
    });
    // High shatter
    playNoiseBurst(bus, 0.22 * i, 0.2 * i, 3500, 800, {
      dest,
      kind: 'pink',
      delay: 0.04,
    });
    // Tail rumble
    playTone(bus, {
      type: 'sine',
      freq: 28 * pitch,
      freqEnd: 18 * pitch,
      gain: 0.16 * i,
      duration: 0.9,
      delay: 0.12,
      dest,
    });
    this.disposePannerLater(dest, 1.1);
  }

  playDamage() {
    const bus = this.bus;
    if (!bus) return;
    bus.duck(0.48, 0.32);
    playNoiseBurst(bus, 0.16, 0.42, 1400, 120);
    playTone(bus, {
      type: 'sawtooth',
      freq: 170,
      freqEnd: 48,
      gain: 0.24,
      duration: 0.3,
    });
    playTone(bus, {
      type: 'square',
      freq: 95,
      freqEnd: 38,
      gain: 0.14,
      duration: 0.24,
      delay: 0.03,
    });
    playTone(bus, {
      type: 'triangle',
      freq: 620,
      freqEnd: 180,
      gain: 0.07,
      duration: 0.18,
      delay: 0.05,
    });
  }

  /** Enemy AA bolt crack — spatial + Doppler. */
  playAaFire(at: SpatialPoint) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus || !spatial) return;
    const dest = spatial.createPanner(at, 8, 170);
    const pitch = spatial.dopplerFactor(
      at,
      { x: at.vx ?? 0, y: at.vy ?? 0, z: at.vz ?? 0 },
      this.listener,
      this.listenerVel,
    );
    playNoiseBurst(bus, 0.055, 0.38, 2600, 500, { dest });
    playTone(bus, {
      type: 'square',
      freq: 540 * pitch,
      freqEnd: 160 * pitch,
      gain: 0.15,
      duration: 0.1,
      dest,
    });
    playTone(bus, {
      type: 'sawtooth',
      freq: 280 * pitch,
      freqEnd: 90 * pitch,
      gain: 0.08,
      duration: 0.12,
      delay: 0.015,
      dest,
    });
    this.disposePannerLater(dest, 0.28);
  }

  /** Incoming bolt whoosh near the listener. */
  playIncomingWhoosh(at: SpatialPoint) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus || !spatial) return;
    const now = bus.ctx.currentTime;
    if (now - this.lastWhooshAt < 0.18) return;
    this.lastWhooshAt = now;

    const dest = spatial.createPanner(at, 6, 85);
    const pitch = spatial.dopplerFactor(
      at,
      { x: at.vx ?? 0, y: at.vy ?? 0, z: at.vz ?? 0 },
      this.listener,
      this.listenerVel,
    );
    playNoiseBurst(bus, 0.2, 0.24, 3400 * pitch, 380, { dest, kind: 'pink' });
    playTone(bus, {
      type: 'sawtooth',
      freq: 980 * pitch,
      freqEnd: 200 * pitch,
      gain: 0.09,
      duration: 0.22,
      dest,
    });
    playTone(bus, {
      type: 'triangle',
      freq: 620 * pitch,
      freqEnd: 140 * pitch,
      gain: 0.05,
      duration: 0.18,
      delay: 0.03,
      dest,
    });
    this.disposePannerLater(dest, 0.35);
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
