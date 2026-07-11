import type { AudioBus } from './bus';
import type { SpatialAudio } from './spatial';
import type { FlybyCandidate, Vec3Like } from './types';
import { playTone, playNoiseBurst } from './synth';

interface Tracked {
  id: string;
  lastDist: number;
  coolUntil: number;
}

/**
 * Doppler-like flybys when hostiles pass close at speed.
 */
export class FlybyEngine {
  private bus: AudioBus | null = null;
  private spatial: SpatialAudio | null = null;
  private tracks = new Map<string, Tracked>();
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

  reset() {
    this.tracks.clear();
  }

  update(hostiles: FlybyCandidate[], nowSec: number) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus || !spatial) return;

    const seen = new Set<string>();
    for (const h of hostiles) {
      const id = String(h.id);
      seen.add(id);
      const dx = h.x - this.listener.x;
      const dy = h.y - this.listener.y;
      const dz = h.z - this.listener.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      let track = this.tracks.get(id);
      if (!track) {
        track = { id, lastDist: dist, coolUntil: 0 };
        this.tracks.set(id, track);
        continue;
      }

      const closing = track.lastDist - dist;
      const relSpeed = Math.hypot(
        (h.vx ?? 0) - this.listenerVel.x,
        (h.vy ?? 0) - this.listenerVel.y,
        (h.vz ?? 0) - this.listenerVel.z,
      );

      // Closest-approach crossing inside proximity bubble
      if (
        nowSec >= track.coolUntil &&
        dist < 16 &&
        track.lastDist >= 16 &&
        closing > 0.2 &&
        (relSpeed > 8 || closing > 0.6)
      ) {
        this.triggerFlyby(h, dist);
        track.coolUntil = nowSec + 2.4;
      } else if (
        nowSec >= track.coolUntil &&
        dist < 12 &&
        closing > 0.35 &&
        track.lastDist < 20 &&
        relSpeed > 14
      ) {
        this.triggerFlyby(h, dist);
        track.coolUntil = nowSec + 2.0;
      }

      track.lastDist = dist;
    }

    for (const id of [...this.tracks.keys()]) {
      if (!seen.has(id)) this.tracks.delete(id);
    }
  }

  private triggerFlyby(h: FlybyCandidate, dist: number) {
    const bus = this.bus;
    const spatial = this.spatial;
    if (!bus || !spatial) return;

    const pos = { x: h.x, y: h.y, z: h.z };
    const vel = { x: h.vx ?? 0, y: h.vy ?? 0, z: h.vz ?? 0 };
    const dest = spatial.createPanner(pos, 8, 90);
    const pitch = spatial.dopplerFactor(pos, vel, this.listener, this.listenerVel);
    const prox = Math.max(0.35, 1 - dist / 28);

    bus.duck(0.2 * prox, 0.25);
    playNoiseBurst(bus, 0.35, 0.28 * prox, 2800 * pitch, 350, {
      dest,
      kind: 'pink',
    });
    playTone(bus, {
      type: 'sawtooth',
      freq: 420 * pitch,
      freqEnd: Math.max(80, 160 / pitch),
      gain: 0.1 * prox,
      duration: 0.4,
      dest,
    });
    playTone(bus, {
      type: 'triangle',
      freq: 180 * pitch,
      freqEnd: 70,
      gain: 0.07 * prox,
      duration: 0.45,
      delay: 0.05,
      dest,
    });

    window.setTimeout(() => {
      try {
        dest.disconnect();
      } catch {
        // ignore
      }
    }, 600);
  }
}
