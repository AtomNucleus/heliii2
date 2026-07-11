import type { AudioBus } from './bus';
import type { MusicIntensity } from './types';
import { clamp } from './util';

/**
 * Adaptive layered score: dusk pad + pulse + tension ostinato + combat brass sting.
 * Intensity + combat heat crossfade layers; fully procedural.
 */
export class MusicLayers {
  private bus: AudioBus | null = null;
  private running = false;
  private intensity: MusicIntensity = 'idle';
  private heat = 0;
  private threat = 0;

  private padOscA: OscillatorNode | null = null;
  private padOscB: OscillatorNode | null = null;
  private padOscC: OscillatorNode | null = null;
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;

  private pulseOsc: OscillatorNode | null = null;
  private pulseGain: GainNode | null = null;
  private pulseLfo: OscillatorNode | null = null;
  private pulseLfoGain: GainNode | null = null;

  private ostinatoTimer: number | null = null;
  private ostinatoGain: GainNode | null = null;
  private ostinatoStep = 0;

  private brassGain: GainNode | null = null;
  private brassTimer: number | null = null;

  start(bus: AudioBus) {
    if (this.running) return;
    this.bus = bus;
    const ctx = bus.ctx;

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 520;
    this.padFilter.Q.value = 0.5;

    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(bus.music);

    this.padOscA = ctx.createOscillator();
    this.padOscA.type = 'sine';
    this.padOscA.frequency.value = 110; // A2
    this.padOscA.connect(this.padFilter);

    this.padOscB = ctx.createOscillator();
    this.padOscB.type = 'triangle';
    this.padOscB.frequency.value = 164.81; // E3
    this.padOscB.detune.value = 6;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.45;
    this.padOscB.connect(bGain);
    bGain.connect(this.padFilter);

    // Soft fifth for dusk color
    this.padOscC = ctx.createOscillator();
    this.padOscC.type = 'sine';
    this.padOscC.frequency.value = 82.41; // E2
    const cGain = ctx.createGain();
    cGain.gain.value = 0.28;
    this.padOscC.connect(cGain);
    cGain.connect(this.padFilter);

    this.pulseGain = ctx.createGain();
    this.pulseGain.gain.value = 0.0001;
    this.pulseGain.connect(bus.music);

    this.pulseOsc = ctx.createOscillator();
    this.pulseOsc.type = 'triangle';
    this.pulseOsc.frequency.value = 55;
    this.pulseOsc.connect(this.pulseGain);

    this.pulseLfoGain = ctx.createGain();
    this.pulseLfoGain.gain.value = 0.02;
    this.pulseLfo = ctx.createOscillator();
    this.pulseLfo.type = 'sine';
    this.pulseLfo.frequency.value = 1.6;
    this.pulseLfo.connect(this.pulseLfoGain);
    this.pulseLfoGain.connect(this.pulseGain.gain);

    this.ostinatoGain = ctx.createGain();
    this.ostinatoGain.gain.value = 0.0001;
    this.ostinatoGain.connect(bus.music);

    this.brassGain = ctx.createGain();
    this.brassGain.gain.value = 0.0001;
    this.brassGain.connect(bus.music);

    const now = ctx.currentTime;
    this.padOscA.start(now);
    this.padOscB.start(now);
    this.padOscC.start(now);
    this.pulseOsc.start(now);
    this.pulseLfo.start(now);
    this.running = true;
    this.applyIntensity(now);
    this.scheduleOstinato();
    this.scheduleBrass();
  }

  stop(fadeSec = 0.6) {
    const bus = this.bus;
    if (!bus || !this.running) return;
    const now = bus.ctx.currentTime;
    this.padGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    this.pulseGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    this.ostinatoGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    this.brassGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    if (this.ostinatoTimer != null) {
      window.clearTimeout(this.ostinatoTimer);
      this.ostinatoTimer = null;
    }
    if (this.brassTimer != null) {
      window.clearTimeout(this.brassTimer);
      this.brassTimer = null;
    }
    const stopAt = now + fadeSec + 0.05;
    try {
      this.padOscA?.stop(stopAt);
      this.padOscB?.stop(stopAt);
      this.padOscC?.stop(stopAt);
      this.pulseOsc?.stop(stopAt);
      this.pulseLfo?.stop(stopAt);
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      this.padOscA = null;
      this.padOscB = null;
      this.padOscC = null;
      this.padGain = null;
      this.padFilter = null;
      this.pulseOsc = null;
      this.pulseGain = null;
      this.pulseLfo = null;
      this.pulseLfoGain = null;
      this.ostinatoGain = null;
      this.brassGain = null;
      this.running = false;
    }, (fadeSec + 0.1) * 1000);
  }

  setIntensity(intensity: MusicIntensity) {
    this.intensity = intensity;
    if (!this.bus || !this.running) return;
    this.applyIntensity(this.bus.ctx.currentTime);
  }

  /** 0…1 recent combat activity — blends toward combat layers. */
  setCombatHeat(heat: number) {
    this.heat = clamp(heat, 0, 1);
    if (!this.bus || !this.running) return;
    this.applyIntensity(this.bus.ctx.currentTime);
  }

  /** 0…1 proximity threat from hostiles. */
  setThreat(threat: number) {
    this.threat = clamp(threat, 0, 1);
    if (!this.bus || !this.running) return;
    this.applyIntensity(this.bus.ctx.currentTime);
  }

  private applyIntensity(now: number) {
    const bus = this.bus;
    if (!bus || !this.padGain || !this.pulseGain || !this.ostinatoGain || !this.brassGain) return;

    let pad = 0.04;
    let pulse = 0.01;
    let ost = 0.0;
    let brass = 0.0;
    let pulseRate = 1.2;
    let filter = 480;
    let musicBase = 0.38;
    let rootA = 110;
    let rootB = 164.81;

    switch (this.intensity) {
      case 'idle':
        pad = 0.035;
        pulse = 0.008;
        ost = 0;
        musicBase = 0.32;
        break;
      case 'patrol':
        pad = 0.05;
        pulse = 0.018;
        ost = 0.012;
        pulseRate = 1.5;
        filter = 560;
        musicBase = 0.4;
        break;
      case 'combat':
        pad = 0.055;
        pulse = 0.032;
        ost = 0.03;
        brass = 0.018;
        pulseRate = 2.5;
        filter = 760;
        musicBase = 0.5;
        rootA = 116.54; // Bb2
        rootB = 174.61;
        break;
      case 'critical':
        pad = 0.062;
        pulse = 0.042;
        ost = 0.042;
        brass = 0.028;
        pulseRate = 3.4;
        filter = 980;
        musicBase = 0.54;
        rootA = 123.47; // B2
        rootB = 185;
        break;
      case 'victory':
        pad = 0.075;
        pulse = 0.022;
        ost = 0.024;
        brass = 0.02;
        pulseRate = 1.9;
        filter = 1200;
        musicBase = 0.58;
        rootA = 130.81; // C3
        rootB = 196;
        break;
      case 'defeat':
        pad = 0.042;
        pulse = 0.008;
        ost = 0;
        brass = 0;
        pulseRate = 0.65;
        filter = 280;
        musicBase = 0.34;
        rootA = 98;
        rootB = 146.83;
        break;
    }

    const h = this.heat;
    const th = this.threat;
    pad = pad + h * 0.012 + th * 0.008;
    pulse = pulse + h * 0.02 + th * 0.012;
    ost = ost + h * 0.02 + th * 0.015;
    brass = brass + h * 0.015 + th * 0.01;
    pulseRate = pulseRate + h * 1.1 + th * 0.8;
    filter = filter + h * 180 + th * 120;

    bus.setMusicBase(musicBase);
    this.padGain.gain.setTargetAtTime(pad, now, 0.35);
    this.pulseGain.gain.setTargetAtTime(Math.max(0.0001, pulse), now, 0.25);
    this.ostinatoGain.gain.setTargetAtTime(Math.max(0.0001, ost), now, 0.3);
    this.brassGain.gain.setTargetAtTime(Math.max(0.0001, brass), now, 0.4);
    this.pulseLfo?.frequency.setTargetAtTime(pulseRate, now, 0.2);
    this.padFilter?.frequency.setTargetAtTime(filter, now, 0.4);
    this.padOscA?.frequency.setTargetAtTime(rootA, now, 0.55);
    this.padOscB?.frequency.setTargetAtTime(rootB, now, 0.55);
    this.padOscC?.frequency.setTargetAtTime(rootA * 0.75, now, 0.55);
  }

  private scheduleOstinato() {
    if (!this.running || !this.bus || !this.ostinatoGain) return;
    const bus = this.bus;
    const ctx = bus.ctx;
    const notes = [220, 246.94, 261.63, 293.66, 329.63, 293.66, 246.94, 196];
    const combatNotes = [233.08, 277.18, 311.13, 349.23, 415.3, 349.23, 277.18, 207.65];
    const victoryNotes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 261.63];
    let scale = notes;
    if (this.intensity === 'victory') scale = victoryNotes;
    else if (
      this.intensity === 'combat' ||
      this.intensity === 'critical' ||
      this.heat > 0.4 ||
      this.threat > 0.5
    ) {
      scale = combatNotes;
    }
    const freq = scale[this.ostinatoStep % scale.length];
    this.ostinatoStep++;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.075, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g);
    g.connect(this.ostinatoGain);
    osc.start(now);
    osc.stop(now + 0.25);

    // Occasional octave sparkle under heat
    if ((this.heat > 0.5 || this.intensity === 'critical') && this.ostinatoStep % 4 === 0) {
      const spark = ctx.createOscillator();
      const sg = ctx.createGain();
      spark.type = 'sine';
      spark.frequency.value = freq * 2;
      sg.gain.setValueAtTime(0.0001, now);
      sg.gain.exponentialRampToValueAtTime(0.035, now + 0.015);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      spark.connect(sg);
      sg.connect(this.ostinatoGain);
      spark.start(now);
      spark.stop(now + 0.16);
    }

    const interval =
      this.intensity === 'critical'
        ? 160
        : this.intensity === 'combat'
          ? 240
          : this.intensity === 'victory'
            ? 300
            : 420 - this.threat * 80;
    this.ostinatoTimer = window.setTimeout(() => this.scheduleOstinato(), Math.max(140, interval));
  }

  private scheduleBrass() {
    if (!this.running || !this.bus || !this.brassGain) return;
    const active =
      this.intensity === 'combat' ||
      this.intensity === 'critical' ||
      this.intensity === 'victory' ||
      this.heat > 0.55;
    const interval = this.intensity === 'critical' ? 900 : 1400;
    if (active) {
      const ctx = this.bus.ctx;
      const now = ctx.currentTime;
      const freqs =
        this.intensity === 'victory'
          ? [392, 523.25, 659.25]
          : [311.13, 369.99, 466.16];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = i === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, now + i * 0.04);
        g.gain.exponentialRampToValueAtTime(0.05, now + i * 0.04 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.35);
        osc.connect(g);
        g.connect(this.brassGain!);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.4);
      });
    }
    this.brassTimer = window.setTimeout(() => this.scheduleBrass(), interval);
  }
}
