import type { AudioBus } from './bus';
import type { SpatialAudio } from './spatial';
import type { FlybyCandidate, Vec3Like } from './types';
import { playTone, playNoiseBurst } from './synth';
import { clamp } from './util';

/**
 * Continuous threat proximity bed + radar pings when hostiles close in.
 */
export class ThreatCues {
  private bus: AudioBus | null = null;
  private listener: Vec3Like = { x: 0, y: 0, z: 0 };

  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private humFilter: BiquadFilterNode | null = null;
  private humLfo: OscillatorNode | null = null;
  private humLfoGain: GainNode | null = null;
  private running = false;

  private lastPingAt = 0;
  private threatLevel = 0;

  attach(bus: AudioBus, _spatial: SpatialAudio) {
    this.bus = bus;
    void _spatial;
  }

  setListener(pos: Vec3Like) {
    this.listener = pos;
  }

  start() {
    const bus = this.bus;
    if (!bus || this.running) return;
    const ctx = bus.ctx;

    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = 'bandpass';
    this.humFilter.frequency.value = 140;
    this.humFilter.Q.value = 2.2;

    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.0001;
    this.humFilter.connect(this.humGain);
    this.humGain.connect(bus.warn);

    this.humOsc = ctx.createOscillator();
    this.humOsc.type = 'sawtooth';
    this.humOsc.frequency.value = 55;
    this.humOsc.connect(this.humFilter);

    this.humLfoGain = ctx.createGain();
    this.humLfoGain.gain.value = 0.012;
    this.humLfo = ctx.createOscillator();
    this.humLfo.type = 'sine';
    this.humLfo.frequency.value = 2.4;
    this.humLfo.connect(this.humLfoGain);
    this.humLfoGain.connect(this.humGain.gain);

    const now = ctx.currentTime;
    this.humOsc.start(now);
    this.humLfo.start(now);
    this.running = true;
  }

  stop(fadeSec = 0.3) {
    const bus = this.bus;
    if (!bus || !this.running) return;
    const now = bus.ctx.currentTime;
    this.humGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    const stopAt = now + fadeSec + 0.05;
    try {
      this.humOsc?.stop(stopAt);
      this.humLfo?.stop(stopAt);
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      this.humOsc = null;
      this.humGain = null;
      this.humFilter = null;
      this.humLfo = null;
      this.humLfoGain = null;
      this.running = false;
      this.threatLevel = 0;
    }, (fadeSec + 0.1) * 1000);
  }

  /**
   * Drive threat bed from nearby hostiles. Returns 0…1 threat for music heat.
   */
  update(hostiles: FlybyCandidate[], nowSec: number): number {
    const bus = this.bus;
    if (!bus || !this.running) return 0;

    let nearest = Infinity;
    let countClose = 0;
    for (const h of hostiles) {
      const dx = h.x - this.listener.x;
      const dy = h.y - this.listener.y;
      const dz = h.z - this.listener.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < nearest) nearest = dist;
      if (dist < 55) countClose++;
    }

    const prox = nearest < 70 ? clamp(1 - nearest / 70, 0, 1) : 0;
    const crowd = clamp(countClose / 4, 0, 1);
    this.threatLevel = clamp(prox * 0.75 + crowd * 0.35, 0, 1);

    const now = bus.ctx.currentTime;
    if (this.humGain && this.humOsc && this.humFilter) {
      const g = 0.0001 + this.threatLevel * 0.045;
      this.humGain.gain.setTargetAtTime(g, now, 0.2);
      this.humOsc.frequency.setTargetAtTime(48 + this.threatLevel * 40, now, 0.25);
      this.humFilter.frequency.setTargetAtTime(110 + this.threatLevel * 180, now, 0.3);
      this.humLfo?.frequency.setTargetAtTime(1.6 + this.threatLevel * 4.5, now, 0.2);
    }

    // Radar ping cadence tightens as threats close
    if (this.threatLevel > 0.25 && nearest < 48) {
      const interval = 1.8 - this.threatLevel * 1.2;
      if (nowSec - this.lastPingAt >= interval) {
        this.lastPingAt = nowSec;
        this.ping(nearest);
      }
    }

    return this.threatLevel;
  }

  get level() {
    return this.threatLevel;
  }

  private ping(dist: number) {
    const bus = this.bus;
    if (!bus) return;
    const prox = clamp(1 - dist / 55, 0.2, 1);
    playTone(bus, {
      type: 'sine',
      freq: 1240,
      freqEnd: 880,
      gain: 0.045 * prox,
      duration: 0.07,
      channel: 'warn',
    });
    playTone(bus, {
      type: 'triangle',
      freq: 1860,
      freqEnd: 1200,
      gain: 0.025 * prox,
      duration: 0.05,
      delay: 0.05,
      channel: 'warn',
    });
    if (prox > 0.65) {
      playNoiseBurst(bus, 0.06, 0.06 * prox, 2800, 900, { channel: 'warn', kind: 'pink' });
    }
  }
}
