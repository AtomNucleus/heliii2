import type { AudioBus } from './bus';
import { clamp, createNoiseBuffer } from './util';

/**
 * Rotor + turbine with load transitions, ground-effect blade slap,
 * damage rasp, and boost afterburner wash.
 */
export class RotorBed {
  private bus: AudioBus | null = null;
  private running = false;

  private rotorGain: GainNode | null = null;
  private rotorOscA: OscillatorNode | null = null;
  private rotorOscB: OscillatorNode | null = null;
  private rotorOscC: OscillatorNode | null = null;
  private rotorLfo: OscillatorNode | null = null;
  private rotorLfoGain: GainNode | null = null;
  private rotorFilter: BiquadFilterNode | null = null;
  private loadFilter: BiquadFilterNode | null = null;

  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineFifth: OscillatorNode | null = null;
  private engineWhine: OscillatorNode | null = null;
  private engineWhineGain: GainNode | null = null;
  private engineRunning = false;

  /** Near-ground blade slap (filtered noise pulses via LFO). */
  private slapSource: AudioBufferSourceNode | null = null;
  private slapGain: GainNode | null = null;
  private slapFilter: BiquadFilterNode | null = null;
  private slapLfo: OscillatorNode | null = null;
  private slapLfoGain: GainNode | null = null;

  /** Hull-damage mechanical rasp. */
  private raspSource: AudioBufferSourceNode | null = null;
  private raspGain: GainNode | null = null;
  private raspFilter: BiquadFilterNode | null = null;

  /** Boost afterburner wash. */
  private boostSource: AudioBufferSourceNode | null = null;
  private boostGain: GainNode | null = null;
  private boostFilter: BiquadFilterNode | null = null;

  private intensity = 0.35;
  private load = 0;
  private altitude = 20;
  private healthRatio = 1;
  private boosting = false;
  private rpm = 0.35;

  start(bus: AudioBus) {
    this.bus = bus;
    this.startEngine();
    this.startRotor();
    this.startSlap();
    this.startRasp();
    this.startBoost();
  }

  stop(fadeSec = 0.4) {
    this.stopRotor(fadeSec);
    this.stopEngine(fadeSec);
    this.stopSlap(fadeSec);
    this.stopRasp(fadeSec);
    this.stopBoost(fadeSec);
  }

  /**
   * @param intensity 0…1 throttle/speed blend
   * @param load 0…1 rotor under load (climb, heavy collective, boost)
   * @param extras altitude / health / boost for secondary layers
   */
  update(
    intensity: number,
    load: number,
    extras?: { altitude?: number; healthRatio?: number; boosting?: boolean },
  ) {
    this.intensity = clamp(intensity, 0, 1);
    this.load = clamp(load, 0, 1);
    if (extras?.altitude != null) this.altitude = extras.altitude;
    if (extras?.healthRatio != null) this.healthRatio = clamp(extras.healthRatio, 0, 1);
    if (extras?.boosting != null) this.boosting = extras.boosting;

    // Soft RPM spool toward target (prevents zippering)
    const rpmTarget = clamp(
      this.intensity * 0.7 + this.load * 0.25 + (this.boosting ? 0.2 : 0) + 0.15,
      0.12,
      1,
    );
    this.rpm += (rpmTarget - this.rpm) * 0.08;

    const bus = this.bus;
    if (!bus || !this.running) return;
    const ctx = bus.ctx;
    const now = ctx.currentTime;
    const i = this.rpm;
    const L = this.load;
    const ground = clamp(1 - this.altitude / 14, 0, 1);
    const damage = clamp(1 - this.healthRatio, 0, 1);

    if (this.rotorGain && this.rotorOscA && this.rotorFilter) {
      const targetGain = 0.035 + i * 0.11 + L * 0.05 + ground * 0.02;
      this.rotorGain.gain.setTargetAtTime(targetGain, now, 0.08);
      const blade = 40 + i * 42 - L * 10 + ground * 6;
      this.rotorOscA.frequency.setTargetAtTime(blade, now, 0.1);
      if (this.rotorOscB) this.rotorOscB.frequency.setTargetAtTime(blade * 2 + 2, now, 0.1);
      if (this.rotorOscC) this.rotorOscC.frequency.setTargetAtTime(blade * 0.5 + L * 8, now, 0.12);
      if (this.rotorLfo) this.rotorLfo.frequency.setTargetAtTime(8 + i * 16 + L * 3, now, 0.1);
      this.rotorFilter.frequency.setTargetAtTime(280 + i * 900 - L * 180 + ground * 120, now, 0.12);
      if (this.loadFilter) {
        this.loadFilter.frequency.setTargetAtTime(180 + L * 220, now, 0.15);
        this.loadFilter.Q.setTargetAtTime(0.6 + L * 1.4, now, 0.15);
        this.loadFilter.gain.setTargetAtTime(L * 6.5 + ground * 2, now, 0.15);
      }
    }

    if (this.engineRunning && this.engineGain && this.engineOsc) {
      const eg = 0.028 + i * 0.05 + L * 0.022 + (this.boosting ? 0.018 : 0);
      this.engineGain.gain.setTargetAtTime(eg, now, 0.12);
      this.engineOsc.frequency.setTargetAtTime(46 + i * 44 - L * 6, now, 0.15);
      if (this.engineFifth) {
        this.engineFifth.frequency.setTargetAtTime(70 + i * 58 - L * 8, now, 0.15);
      }
      if (this.engineFilter) {
        this.engineFilter.frequency.setTargetAtTime(190 + i * 500 + L * 90, now, 0.18);
      }
      if (this.engineWhine && this.engineWhineGain) {
        this.engineWhine.frequency.setTargetAtTime(220 + i * 380 + (this.boosting ? 80 : 0), now, 0.12);
        this.engineWhineGain.gain.setTargetAtTime(0.008 + i * 0.022 + (this.boosting ? 0.02 : 0), now, 0.1);
      }
    }

    // Ground-effect blade slap
    if (this.slapGain && this.slapLfo && this.slapFilter) {
      const slap = ground * (0.35 + i * 0.65);
      this.slapGain.gain.setTargetAtTime(0.0001 + slap * 0.055, now, 0.12);
      this.slapLfo.frequency.setTargetAtTime(11 + i * 18, now, 0.1);
      this.slapFilter.frequency.setTargetAtTime(700 + ground * 900 + i * 400, now, 0.15);
    }

    // Damage rasp
    if (this.raspGain && this.raspFilter) {
      const rasp = damage > 0.35 ? (damage - 0.35) / 0.65 : 0;
      this.raspGain.gain.setTargetAtTime(0.0001 + rasp * 0.07, now, 0.2);
      this.raspFilter.frequency.setTargetAtTime(900 + rasp * 1400, now, 0.25);
    }

    // Boost wash
    if (this.boostGain && this.boostFilter) {
      const b = this.boosting ? 1 : 0;
      this.boostGain.gain.setTargetAtTime(0.0001 + b * 0.09, now, 0.08);
      this.boostFilter.frequency.setTargetAtTime(1200 + b * 1800, now, 0.1);
    }
  }

  private startRotor() {
    const bus = this.bus;
    if (!bus || this.running) return;
    const ctx = bus.ctx;

    this.rotorFilter = ctx.createBiquadFilter();
    this.rotorFilter.type = 'lowpass';
    this.rotorFilter.frequency.value = 420;
    this.rotorFilter.Q.value = 0.7;

    this.loadFilter = ctx.createBiquadFilter();
    this.loadFilter.type = 'peaking';
    this.loadFilter.frequency.value = 200;
    this.loadFilter.Q.value = 0.8;
    this.loadFilter.gain.value = 0;

    this.rotorGain = ctx.createGain();
    this.rotorGain.gain.value = 0.0001;
    this.rotorFilter.connect(this.loadFilter);
    this.loadFilter.connect(this.rotorGain);
    this.rotorGain.connect(bus.ambience);

    this.rotorOscA = ctx.createOscillator();
    this.rotorOscA.type = 'sawtooth';
    this.rotorOscA.frequency.value = 48;
    this.rotorOscA.connect(this.rotorFilter);

    this.rotorOscB = ctx.createOscillator();
    this.rotorOscB.type = 'triangle';
    this.rotorOscB.frequency.value = 96.2;
    this.rotorOscB.detune.value = 8;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    this.rotorOscB.connect(bGain);
    bGain.connect(this.rotorFilter);

    this.rotorOscC = ctx.createOscillator();
    this.rotorOscC.type = 'sine';
    this.rotorOscC.frequency.value = 24;
    const cGain = ctx.createGain();
    cGain.gain.value = 0.22;
    this.rotorOscC.connect(cGain);
    cGain.connect(this.rotorFilter);

    this.rotorLfoGain = ctx.createGain();
    this.rotorLfoGain.gain.value = 6;
    this.rotorLfo = ctx.createOscillator();
    this.rotorLfo.type = 'sine';
    this.rotorLfo.frequency.value = 12;
    this.rotorLfo.connect(this.rotorLfoGain);
    this.rotorLfoGain.connect(this.rotorOscA.frequency);

    const now = ctx.currentTime;
    this.rotorOscA.start(now);
    this.rotorOscB.start(now);
    this.rotorOscC.start(now);
    this.rotorLfo.start(now);
    this.running = true;
    this.update(this.intensity, this.load);
  }

  private stopRotor(fadeSec = 0.35) {
    const bus = this.bus;
    if (!bus || !this.running) return;
    const now = bus.ctx.currentTime;
    this.rotorGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    const stopAt = now + fadeSec + 0.05;
    try {
      this.rotorOscA?.stop(stopAt);
      this.rotorOscB?.stop(stopAt);
      this.rotorOscC?.stop(stopAt);
      this.rotorLfo?.stop(stopAt);
    } catch {
      // already stopped
    }
    window.setTimeout(() => {
      this.rotorOscA = null;
      this.rotorOscB = null;
      this.rotorOscC = null;
      this.rotorLfo = null;
      this.rotorLfoGain = null;
      this.rotorFilter = null;
      this.loadFilter = null;
      this.rotorGain = null;
      this.running = false;
    }, (fadeSec + 0.1) * 1000);
  }

  private startEngine() {
    const bus = this.bus;
    if (!bus || this.engineRunning) return;
    const ctx = bus.ctx;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 280;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0001;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(bus.ambience);

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sine';
    this.engineOsc.frequency.value = 55;
    this.engineOsc.connect(this.engineFilter);

    this.engineFifth = ctx.createOscillator();
    this.engineFifth.type = 'sine';
    this.engineFifth.frequency.value = 82.5;
    const fifthGain = ctx.createGain();
    fifthGain.gain.value = 0.4;
    this.engineFifth.connect(fifthGain);
    fifthGain.connect(this.engineFilter);

    this.engineWhineGain = ctx.createGain();
    this.engineWhineGain.gain.value = 0.0001;
    this.engineWhine = ctx.createOscillator();
    this.engineWhine.type = 'triangle';
    this.engineWhine.frequency.value = 280;
    this.engineWhine.connect(this.engineWhineGain);
    this.engineWhineGain.connect(bus.ambience);

    const now = ctx.currentTime;
    this.engineOsc.start(now);
    this.engineFifth.start(now);
    this.engineWhine.start(now);
    this.engineGain.gain.setTargetAtTime(0.045, now, 0.6);
    this.engineRunning = true;
  }

  private stopEngine(fadeSec = 0.5) {
    const bus = this.bus;
    if (!bus || !this.engineRunning) return;
    const now = bus.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    this.engineWhineGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    const stopAt = now + fadeSec + 0.05;
    try {
      this.engineOsc?.stop(stopAt);
      this.engineFifth?.stop(stopAt);
      this.engineWhine?.stop(stopAt);
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      this.engineOsc = null;
      this.engineFifth = null;
      this.engineWhine = null;
      this.engineWhineGain = null;
      this.engineGain = null;
      this.engineFilter = null;
      this.engineRunning = false;
    }, (fadeSec + 0.1) * 1000);
  }

  private startSlap() {
    const bus = this.bus;
    if (!bus || this.slapSource) return;
    const ctx = bus.ctx;
    const buffer = createNoiseBuffer(ctx, 0.8, 'white');

    this.slapFilter = ctx.createBiquadFilter();
    this.slapFilter.type = 'bandpass';
    this.slapFilter.frequency.value = 900;
    this.slapFilter.Q.value = 3.5;

    this.slapGain = ctx.createGain();
    this.slapGain.gain.value = 0.0001;

    this.slapSource = ctx.createBufferSource();
    this.slapSource.buffer = buffer;
    this.slapSource.loop = true;
    this.slapSource.connect(this.slapFilter);
    this.slapFilter.connect(this.slapGain);

    // Amplitude chop at blade rate
    this.slapLfoGain = ctx.createGain();
    this.slapLfoGain.gain.value = 0.04;
    this.slapLfo = ctx.createOscillator();
    this.slapLfo.type = 'square';
    this.slapLfo.frequency.value = 14;
    this.slapLfo.connect(this.slapLfoGain);
    this.slapLfoGain.connect(this.slapGain.gain);

    this.slapGain.connect(bus.ambience);
    const now = ctx.currentTime;
    this.slapSource.start(now);
    this.slapLfo.start(now);
  }

  private stopSlap(fadeSec = 0.35) {
    const bus = this.bus;
    if (!bus || !this.slapSource) return;
    const now = bus.ctx.currentTime;
    this.slapGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    const src = this.slapSource;
    const lfo = this.slapLfo;
    window.setTimeout(() => {
      try {
        src.stop();
        lfo?.stop();
      } catch {
        // ignore
      }
      this.slapSource = null;
      this.slapGain = null;
      this.slapFilter = null;
      this.slapLfo = null;
      this.slapLfoGain = null;
    }, (fadeSec + 0.1) * 1000);
  }

  private startRasp() {
    const bus = this.bus;
    if (!bus || this.raspSource) return;
    const ctx = bus.ctx;
    const buffer = createNoiseBuffer(ctx, 1.2, 'pink');

    this.raspFilter = ctx.createBiquadFilter();
    this.raspFilter.type = 'bandpass';
    this.raspFilter.frequency.value = 1200;
    this.raspFilter.Q.value = 1.8;

    this.raspGain = ctx.createGain();
    this.raspGain.gain.value = 0.0001;

    this.raspSource = ctx.createBufferSource();
    this.raspSource.buffer = buffer;
    this.raspSource.loop = true;
    this.raspSource.connect(this.raspFilter);
    this.raspFilter.connect(this.raspGain);
    this.raspGain.connect(bus.ambience);
    this.raspSource.start();
  }

  private stopRasp(fadeSec = 0.35) {
    const bus = this.bus;
    if (!bus || !this.raspSource) return;
    const now = bus.ctx.currentTime;
    this.raspGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    const src = this.raspSource;
    window.setTimeout(() => {
      try {
        src.stop();
      } catch {
        // ignore
      }
      this.raspSource = null;
      this.raspGain = null;
      this.raspFilter = null;
    }, (fadeSec + 0.1) * 1000);
  }

  private startBoost() {
    const bus = this.bus;
    if (!bus || this.boostSource) return;
    const ctx = bus.ctx;
    const buffer = createNoiseBuffer(ctx, 1.5, 'brown');

    this.boostFilter = ctx.createBiquadFilter();
    this.boostFilter.type = 'highpass';
    this.boostFilter.frequency.value = 1400;

    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0.0001;

    this.boostSource = ctx.createBufferSource();
    this.boostSource.buffer = buffer;
    this.boostSource.loop = true;
    this.boostSource.connect(this.boostFilter);
    this.boostFilter.connect(this.boostGain);
    this.boostGain.connect(bus.ambience);
    this.boostSource.start();
  }

  private stopBoost(fadeSec = 0.3) {
    const bus = this.bus;
    if (!bus || !this.boostSource) return;
    const now = bus.ctx.currentTime;
    this.boostGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    const src = this.boostSource;
    window.setTimeout(() => {
      try {
        src.stop();
      } catch {
        // ignore
      }
      this.boostSource = null;
      this.boostGain = null;
      this.boostFilter = null;
    }, (fadeSec + 0.1) * 1000);
  }
}
