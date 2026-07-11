import type { AudioBus } from './bus';
import type { WarningKind } from './types';
import { playTone, playNoiseBurst } from './synth';

/**
 * Cockpit warning systems: hull, lock tone, altitude, incoming, stall.
 */
export class WarningSystem {
  private bus: AudioBus | null = null;
  private lockOsc: OscillatorNode | null = null;
  private lockGain: GainNode | null = null;
  private lockLfo: OscillatorNode | null = null;
  private lockLfoGain: GainNode | null = null;
  private lockOn = false;

  private hullTimer: number | null = null;
  private altTimer: number | null = null;
  private lastIncomingAt = 0;

  attach(bus: AudioBus) {
    this.bus = bus;
  }

  stopAll() {
    this.setLock(false);
    if (this.hullTimer != null) {
      window.clearInterval(this.hullTimer);
      this.hullTimer = null;
    }
    if (this.altTimer != null) {
      window.clearInterval(this.altTimer);
      this.altTimer = null;
    }
  }

  play(kind: WarningKind) {
    const bus = this.bus;
    if (!bus) return;
    switch (kind) {
      case 'hull':
        this.pulseHull();
        break;
      case 'lock':
        this.setLock(true);
        break;
      case 'altitude':
        this.pulseAltitude();
        break;
      case 'incoming':
        this.pulseIncoming();
        break;
      case 'stall':
        playTone(bus, {
          type: 'sawtooth',
          freq: 180,
          freqEnd: 90,
          gain: 0.1,
          duration: 0.35,
          channel: 'warn',
        });
        playNoiseBurst(bus, 0.2, 0.15, 900, 200, { channel: 'warn' });
        break;
    }
  }

  /** Continuous AIM lock warble while locked. */
  setLock(on: boolean) {
    const bus = this.bus;
    if (!bus) return;
    if (on && !this.lockOn) {
      const ctx = bus.ctx;
      this.lockGain = ctx.createGain();
      this.lockGain.gain.value = 0.0001;
      this.lockGain.connect(bus.warn);

      this.lockOsc = ctx.createOscillator();
      this.lockOsc.type = 'square';
      this.lockOsc.frequency.value = 880;
      this.lockOsc.connect(this.lockGain);

      this.lockLfoGain = ctx.createGain();
      this.lockLfoGain.gain.value = 120;
      this.lockLfo = ctx.createOscillator();
      this.lockLfo.type = 'sine';
      this.lockLfo.frequency.value = 6;
      this.lockLfo.connect(this.lockLfoGain);
      this.lockLfoGain.connect(this.lockOsc.frequency);

      const now = ctx.currentTime;
      this.lockOsc.start(now);
      this.lockLfo.start(now);
      this.lockGain.gain.setTargetAtTime(0.035, now, 0.05);
      this.lockOn = true;
    } else if (!on && this.lockOn) {
      const now = bus.ctx.currentTime;
      this.lockGain?.gain.setTargetAtTime(0.0001, now, 0.04);
      const stopAt = now + 0.12;
      try {
        this.lockOsc?.stop(stopAt);
        this.lockLfo?.stop(stopAt);
      } catch {
        // ignore
      }
      this.lockOsc = null;
      this.lockGain = null;
      this.lockLfo = null;
      this.lockLfoGain = null;
      this.lockOn = false;
    }
  }

  /** Enable/disable repeating hull-critical chirp. */
  setHullCritical(on: boolean) {
    if (on && this.hullTimer == null) {
      this.pulseHull();
      this.hullTimer = window.setInterval(() => this.pulseHull(), 900);
    } else if (!on && this.hullTimer != null) {
      window.clearInterval(this.hullTimer);
      this.hullTimer = null;
    }
  }

  setLowAltitude(on: boolean) {
    if (on && this.altTimer == null) {
      this.pulseAltitude();
      this.altTimer = window.setInterval(() => this.pulseAltitude(), 700);
    } else if (!on && this.altTimer != null) {
      window.clearInterval(this.altTimer);
      this.altTimer = null;
    }
  }

  private pulseHull() {
    const bus = this.bus;
    if (!bus) return;
    bus.duck(0.35, 0.25);
    playTone(bus, {
      type: 'square',
      freq: 620,
      gain: 0.09,
      duration: 0.08,
      channel: 'warn',
    });
    playTone(bus, {
      type: 'square',
      freq: 480,
      gain: 0.08,
      duration: 0.1,
      delay: 0.1,
      channel: 'warn',
    });
  }

  private pulseAltitude() {
    const bus = this.bus;
    if (!bus) return;
    playTone(bus, {
      type: 'sine',
      freq: 980,
      gain: 0.07,
      duration: 0.06,
      channel: 'warn',
    });
    playTone(bus, {
      type: 'sine',
      freq: 980,
      gain: 0.05,
      duration: 0.06,
      delay: 0.12,
      channel: 'warn',
    });
  }

  private pulseIncoming() {
    const bus = this.bus;
    if (!bus) return;
    const now = bus.ctx.currentTime;
    if (now - this.lastIncomingAt < 0.4) return;
    this.lastIncomingAt = now;
    bus.duck(0.25, 0.2);
    playTone(bus, {
      type: 'sawtooth',
      freq: 1400,
      freqEnd: 700,
      gain: 0.08,
      duration: 0.18,
      channel: 'warn',
    });
    playNoiseBurst(bus, 0.12, 0.12, 3000, 800, { channel: 'warn' });
  }
}
