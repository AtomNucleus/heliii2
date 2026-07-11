import type { AudioBus } from './bus';
import { clamp } from './util';

/**
 * Rotor + turbine with load transitions.
 * Load (collective / climb / boost) thickens the thrum and drops blade pitch.
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
  private engineRunning = false;

  private intensity = 0.35;
  private load = 0;

  start(bus: AudioBus) {
    this.bus = bus;
    this.startEngine();
    this.startRotor();
  }

  stop(fadeSec = 0.4) {
    this.stopRotor(fadeSec);
    this.stopEngine(fadeSec);
  }

  /**
   * @param intensity 0…1 throttle/speed blend
   * @param load 0…1 rotor under load (climb, heavy collective, boost)
   */
  update(intensity: number, load: number) {
    this.intensity = clamp(intensity, 0, 1);
    this.load = clamp(load, 0, 1);
    const bus = this.bus;
    if (!bus || !this.running) return;
    const ctx = bus.ctx;
    const now = ctx.currentTime;
    const i = this.intensity;
    const L = this.load;

    if (this.rotorGain && this.rotorOscA && this.rotorFilter) {
      // Load: louder, darker, slightly slower blade rate
      const targetGain = 0.035 + i * 0.11 + L * 0.05;
      this.rotorGain.gain.setTargetAtTime(targetGain, now, 0.08);
      const blade = 42 + i * 38 - L * 10;
      this.rotorOscA.frequency.setTargetAtTime(blade, now, 0.1);
      if (this.rotorOscB) this.rotorOscB.frequency.setTargetAtTime(blade * 2 + 2, now, 0.1);
      if (this.rotorOscC) this.rotorOscC.frequency.setTargetAtTime(blade * 0.5 + L * 8, now, 0.12);
      if (this.rotorLfo) this.rotorLfo.frequency.setTargetAtTime(9 + i * 14 + L * 3, now, 0.1);
      this.rotorFilter.frequency.setTargetAtTime(300 + i * 850 - L * 180, now, 0.12);
      if (this.loadFilter) {
        this.loadFilter.frequency.setTargetAtTime(180 + L * 220, now, 0.15);
        this.loadFilter.Q.setTargetAtTime(0.6 + L * 1.4, now, 0.15);
        this.loadFilter.gain.setTargetAtTime(L * 6.5, now, 0.15);
      }
    }

    if (this.engineRunning && this.engineGain && this.engineOsc) {
      const eg = 0.028 + i * 0.048 + L * 0.02;
      this.engineGain.gain.setTargetAtTime(eg, now, 0.12);
      this.engineOsc.frequency.setTargetAtTime(48 + i * 40 - L * 6, now, 0.15);
      if (this.engineFifth) {
        this.engineFifth.frequency.setTargetAtTime(72 + i * 55 - L * 8, now, 0.15);
      }
      if (this.engineFilter) {
        this.engineFilter.frequency.setTargetAtTime(200 + i * 460 + L * 80, now, 0.18);
      }
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

    // Sub-harmonic growl under load
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

    const now = ctx.currentTime;
    this.engineOsc.start(now);
    this.engineFifth.start(now);
    this.engineGain.gain.setTargetAtTime(0.045, now, 0.6);
    this.engineRunning = true;
  }

  private stopEngine(fadeSec = 0.5) {
    const bus = this.bus;
    if (!bus || !this.engineRunning) return;
    const now = bus.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    const stopAt = now + fadeSec + 0.05;
    try {
      this.engineOsc?.stop(stopAt);
      this.engineFifth?.stop(stopAt);
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      this.engineOsc = null;
      this.engineFifth = null;
      this.engineGain = null;
      this.engineFilter = null;
      this.engineRunning = false;
    }, (fadeSec + 0.1) * 1000);
  }
}
