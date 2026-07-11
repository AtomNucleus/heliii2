import type { AudioBus } from './bus';
import type { MusicIntensity } from './types';
import { clamp } from './util';

/**
 * Dynamic layered music: drone pad + pulse + tension ostinato.
 * Intensity crossfades layers; no external samples.
 */
export class MusicLayers {
  private bus: AudioBus | null = null;
  private running = false;
  private intensity: MusicIntensity = 'idle';
  private heat = 0;

  private padOscA: OscillatorNode | null = null;
  private padOscB: OscillatorNode | null = null;
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;

  private pulseOsc: OscillatorNode | null = null;
  private pulseGain: GainNode | null = null;
  private pulseLfo: OscillatorNode | null = null;
  private pulseLfoGain: GainNode | null = null;

  private ostinatoTimer: number | null = null;
  private ostinatoGain: GainNode | null = null;
  private ostinatoStep = 0;

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

    const now = ctx.currentTime;
    this.padOscA.start(now);
    this.padOscB.start(now);
    this.pulseOsc.start(now);
    this.pulseLfo.start(now);
    this.running = true;
    this.applyIntensity(now);
    this.scheduleOstinato();
  }

  stop(fadeSec = 0.6) {
    const bus = this.bus;
    if (!bus || !this.running) return;
    const now = bus.ctx.currentTime;
    this.padGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    this.pulseGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    this.ostinatoGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    if (this.ostinatoTimer != null) {
      window.clearTimeout(this.ostinatoTimer);
      this.ostinatoTimer = null;
    }
    const stopAt = now + fadeSec + 0.05;
    try {
      this.padOscA?.stop(stopAt);
      this.padOscB?.stop(stopAt);
      this.pulseOsc?.stop(stopAt);
      this.pulseLfo?.stop(stopAt);
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      this.padOscA = null;
      this.padOscB = null;
      this.padGain = null;
      this.padFilter = null;
      this.pulseOsc = null;
      this.pulseGain = null;
      this.pulseLfo = null;
      this.pulseLfoGain = null;
      this.ostinatoGain = null;
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

  private applyIntensity(now: number) {
    const bus = this.bus;
    if (!bus || !this.padGain || !this.pulseGain || !this.ostinatoGain) return;

    let pad = 0.04;
    let pulse = 0.01;
    let ost = 0.0;
    let pulseRate = 1.2;
    let filter = 480;
    let musicBase = 0.38;

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
        pulse = 0.03;
        ost = 0.028;
        pulseRate = 2.4;
        filter = 720;
        musicBase = 0.48;
        break;
      case 'critical':
        pad = 0.06;
        pulse = 0.04;
        ost = 0.04;
        pulseRate = 3.2;
        filter = 900;
        musicBase = 0.52;
        break;
      case 'victory':
        pad = 0.07;
        pulse = 0.02;
        ost = 0.02;
        pulseRate = 1.8;
        filter = 1100;
        musicBase = 0.55;
        break;
      case 'defeat':
        pad = 0.045;
        pulse = 0.01;
        ost = 0;
        pulseRate = 0.7;
        filter = 300;
        musicBase = 0.35;
        break;
    }

    // Heat blends toward combat
    const h = this.heat;
    pad = pad + h * 0.015;
    pulse = pulse + h * 0.02;
    ost = ost + h * 0.02;
    pulseRate = pulseRate + h * 1.2;
    filter = filter + h * 200;

    bus.setMusicBase(musicBase);
    this.padGain.gain.setTargetAtTime(pad, now, 0.35);
    this.pulseGain.gain.setTargetAtTime(Math.max(0.0001, pulse), now, 0.25);
    this.ostinatoGain.gain.setTargetAtTime(Math.max(0.0001, ost), now, 0.3);
    this.pulseLfo?.frequency.setTargetAtTime(pulseRate, now, 0.2);
    this.padFilter?.frequency.setTargetAtTime(filter, now, 0.4);

    if (this.intensity === 'critical' && this.padOscB) {
      this.padOscB.frequency.setTargetAtTime(185, now, 0.5);
    } else if (this.padOscB) {
      this.padOscB.frequency.setTargetAtTime(164.81, now, 0.5);
    }
  }

  private scheduleOstinato() {
    if (!this.running || !this.bus || !this.ostinatoGain) return;
    const bus = this.bus;
    const ctx = bus.ctx;
    const notes = [220, 246.94, 261.63, 293.66, 329.63, 293.66, 246.94, 196];
    const combatNotes = [233.08, 277.18, 311.13, 349.23, 415.3, 349.23, 277.18, 207.65];
    const scale =
      this.intensity === 'combat' || this.intensity === 'critical' || this.heat > 0.45
        ? combatNotes
        : notes;
    const freq = scale[this.ostinatoStep % scale.length];
    this.ostinatoStep++;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g);
    g.connect(this.ostinatoGain);
    osc.start(now);
    osc.stop(now + 0.25);

    const interval =
      this.intensity === 'critical' ? 180 : this.intensity === 'combat' ? 260 : 420;
    this.ostinatoTimer = window.setTimeout(() => this.scheduleOstinato(), interval);
  }
}
