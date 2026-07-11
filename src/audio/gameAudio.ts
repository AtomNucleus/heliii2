/**
 * Procedural arcade audio via Web Audio API — no external audio files.
 *
 * Layers: rotor blade thrum, turbine/engine bed, wind rush, one-shot SFX.
 * Call `resume()` (or any play* method) after a user gesture.
 */

export type ImpactKind = 'soft' | 'hard' | 'explosion' | 'ring' | 'damage';

export interface FlightAudioParams {
  /** 0 idle hover … 1 full throttle */
  throttle?: number;
  /** World speed, typically 0–80 */
  speed?: number;
  /** Altitude above ground */
  altitude?: number;
  /** Boost engaged */
  boosting?: boolean;
}

interface OscSpec {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  gain: number;
  gainEnd?: number;
  attack?: number;
  duration: number;
  delay?: number;
  detune?: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;

  private rotorGain: GainNode | null = null;
  private rotorOscA: OscillatorNode | null = null;
  private rotorOscB: OscillatorNode | null = null;
  private rotorLfo: OscillatorNode | null = null;
  private rotorLfoGain: GainNode | null = null;
  private rotorFilter: BiquadFilterNode | null = null;
  private rotorRunning = false;

  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineFifth: OscillatorNode | null = null;
  private engineRunning = false;

  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windRunning = false;

  private muted = false;
  private rotorIntensity = 0.35;
  private lastFireAt = 0;
  private lastWeaponReady = true;

  /** Ensure AudioContext exists (lazy). Safe to call repeatedly. */
  ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;

    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);

      this.music = this.ctx.createGain();
      this.music.gain.value = 0.55;
      this.music.connect(this.master);
    }
    return this.ctx;
  }

  /** Resume after a user gesture (required by browsers). */
  async resume(): Promise<void> {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ignore autoplay policy failures; next gesture can retry
      }
    }
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      try {
        await this.ctx.suspend();
      } catch {
        // ignore
      }
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.85, now, 0.03);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---- Continuous flight layers ----

  startRotor() {
    const ctx = this.ensure();
    if (!ctx || !this.music || this.rotorRunning) return;

    this.rotorFilter = ctx.createBiquadFilter();
    this.rotorFilter.type = 'lowpass';
    this.rotorFilter.frequency.value = 420;
    this.rotorFilter.Q.value = 0.7;

    this.rotorGain = ctx.createGain();
    this.rotorGain.gain.value = 0.0001;
    this.rotorFilter.connect(this.rotorGain);
    this.rotorGain.connect(this.music);

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
    this.rotorLfo.start(now);
    this.rotorRunning = true;
    this.setRotorIntensity(this.rotorIntensity);
  }

  stopRotor(fadeSec = 0.35) {
    const ctx = this.ctx;
    if (!ctx || !this.rotorRunning) return;
    const now = ctx.currentTime;
    if (this.rotorGain) {
      this.rotorGain.gain.cancelScheduledValues(now);
      this.rotorGain.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    }
    const stopAt = now + fadeSec + 0.05;
    try {
      this.rotorOscA?.stop(stopAt);
      this.rotorOscB?.stop(stopAt);
      this.rotorLfo?.stop(stopAt);
    } catch {
      // already stopped
    }
    window.setTimeout(() => {
      this.rotorOscA = null;
      this.rotorOscB = null;
      this.rotorLfo = null;
      this.rotorLfoGain = null;
      this.rotorFilter = null;
      this.rotorGain = null;
      this.rotorRunning = false;
    }, (fadeSec + 0.1) * 1000);
  }

  /** 0 = idle hover, 1 = full throttle scream. */
  setRotorIntensity(t: number) {
    this.rotorIntensity = clamp(t, 0, 1);
    const ctx = this.ctx;
    if (!ctx || !this.rotorRunning || !this.rotorGain || !this.rotorOscA || !this.rotorFilter) return;
    const now = ctx.currentTime;
    const i = this.rotorIntensity;
    const targetGain = 0.04 + i * 0.12;
    this.rotorGain.gain.setTargetAtTime(targetGain, now, 0.08);
    this.rotorOscA.frequency.setTargetAtTime(42 + i * 38, now, 0.1);
    if (this.rotorOscB) this.rotorOscB.frequency.setTargetAtTime(84 + i * 70, now, 0.1);
    if (this.rotorLfo) this.rotorLfo.frequency.setTargetAtTime(9 + i * 14, now, 0.1);
    this.rotorFilter.frequency.setTargetAtTime(320 + i * 900, now, 0.12);
  }

  startEngine() {
    const ctx = this.ensure();
    if (!ctx || !this.music || this.engineRunning) return;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 280;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0001;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.music);

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

  stopEngine(fadeSec = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.engineRunning) return;
    const now = ctx.currentTime;
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

  /** Alias kept for earlier WIP naming. */
  startBed() {
    this.startEngine();
  }

  stopBed(fadeSec = 0.5) {
    this.stopEngine(fadeSec);
  }

  startWind() {
    const ctx = this.ensure();
    if (!ctx || !this.music || this.windRunning) return;

    const seconds = 2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Soft brown-ish noise for wind
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.55;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0001;

    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.music);
    this.windSource.start();
    this.windRunning = true;
  }

  stopWind(fadeSec = 0.4) {
    const ctx = this.ctx;
    if (!ctx || !this.windRunning) return;
    const now = ctx.currentTime;
    this.windGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    window.setTimeout(() => {
      try {
        this.windSource?.stop();
      } catch {
        // ignore
      }
      this.windSource = null;
      this.windGain = null;
      this.windFilter = null;
      this.windRunning = false;
    }, (fadeSec + 0.1) * 1000);
  }

  /** Start full flight soundscape (rotor + engine + wind). */
  startFlightAmbience() {
    void this.resume();
    this.startEngine();
    this.startRotor();
    this.startWind();
  }

  /** Stop flight soundscape. */
  stopFlightAmbience() {
    this.stopRotor();
    this.stopEngine();
    this.stopWind();
  }

  /**
   * Drive continuous layers from flight state each frame (or ~10 Hz).
   * Safe no-op if ambience is not running.
   */
  updateFlight(params: FlightAudioParams) {
    const speed = params.speed ?? 0;
    const throttle = params.throttle ?? clamp(speed / 55, 0, 1);
    const boosting = params.boosting ?? false;
    const altitude = params.altitude ?? 20;
    const intensity = clamp(throttle * 0.75 + (boosting ? 0.35 : 0) + speed / 120, 0, 1);
    this.setRotorIntensity(intensity);

    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;

    if (this.engineRunning && this.engineGain && this.engineOsc) {
      const eg = 0.03 + intensity * 0.05 + (boosting ? 0.025 : 0);
      this.engineGain.gain.setTargetAtTime(eg, now, 0.12);
      this.engineOsc.frequency.setTargetAtTime(48 + intensity * 40, now, 0.15);
      if (this.engineFifth) {
        this.engineFifth.frequency.setTargetAtTime(72 + intensity * 55, now, 0.15);
      }
      if (this.engineFilter) {
        this.engineFilter.frequency.setTargetAtTime(220 + intensity * 480, now, 0.18);
      }
    }

    if (this.windRunning && this.windGain && this.windFilter) {
      const nearGround = clamp(1 - altitude / 40, 0, 1);
      const windLevel = 0.01 + (speed / 90) * 0.08 + nearGround * 0.02 + (boosting ? 0.03 : 0);
      this.windGain.gain.setTargetAtTime(windLevel, now, 0.15);
      this.windFilter.frequency.setTargetAtTime(400 + speed * 12 + nearGround * 200, now, 0.2);
    }
  }

  // ---- One-shots ----

  playWeaponFire() {
    const ctx = this.ensure();
    if (!ctx || !this.sfx) return;
    void this.resume();
    const now = ctx.currentTime;
    if (now - this.lastFireAt < 0.05) return;
    this.lastFireAt = now;

    this.noiseBurst(0.07, 0.55, 1800, 400);
    this.tone({
      type: 'square',
      freq: 220,
      freqEnd: 70,
      gain: 0.22,
      gainEnd: 0.0001,
      attack: 0.002,
      duration: 0.12,
    });
    this.tone({
      type: 'sawtooth',
      freq: 90,
      freqEnd: 40,
      gain: 0.18,
      duration: 0.1,
    });
  }

  playWeaponHit() {
    void this.resume();
    this.tone({
      type: 'triangle',
      freq: 880,
      freqEnd: 440,
      gain: 0.16,
      duration: 0.09,
    });
    this.tone({
      type: 'sine',
      freq: 1320,
      freqEnd: 660,
      gain: 0.1,
      duration: 0.08,
      delay: 0.02,
    });
  }

  /** Soft chime when rockets finish reloading. */
  playWeaponReady() {
    void this.resume();
    this.tone({ type: 'sine', freq: 740, gain: 0.1, duration: 0.08 });
    this.tone({ type: 'triangle', freq: 988, gain: 0.08, duration: 0.12, delay: 0.06 });
    this.tone({ type: 'sine', freq: 1174, gain: 0.05, duration: 0.14, delay: 0.12 });
  }

  /**
   * Call when weapon ready flag changes — plays ready chime on rising edge.
   */
  notifyWeaponReady(ready: boolean) {
    if (ready && !this.lastWeaponReady) {
      this.playWeaponReady();
    }
    this.lastWeaponReady = ready;
  }

  playImpact(intensity = 0.7, kind: ImpactKind = 'hard') {
    void this.resume();
    const i = clamp(intensity, 0.15, 1.5);
    if (kind === 'soft') {
      this.noiseBurst(0.08 * i, 0.25 * i, 900, 200);
      this.tone({ type: 'sine', freq: 120, freqEnd: 60, gain: 0.12 * i, duration: 0.15 });
      return;
    }
    if (kind === 'ring') {
      this.playRingCollect();
      return;
    }
    if (kind === 'damage') {
      this.playDamage();
      return;
    }
    if (kind === 'explosion') {
      this.playExplosion(i);
      return;
    }
    this.noiseBurst(0.12 * i, 0.45 * i, 1400, 180);
    this.tone({ type: 'sawtooth', freq: 70, freqEnd: 28, gain: 0.28 * i, duration: 0.22 });
    this.tone({ type: 'square', freq: 55, freqEnd: 30, gain: 0.15 * i, duration: 0.18, delay: 0.02 });
  }

  playExplosion(intensity = 1) {
    void this.resume();
    const i = clamp(intensity, 0.4, 1.6);
    this.noiseBurst(0.35 * i, 0.7 * i, 800, 60);
    this.tone({ type: 'sawtooth', freq: 48, freqEnd: 18, gain: 0.4 * i, duration: 0.55 });
    this.tone({ type: 'triangle', freq: 90, freqEnd: 30, gain: 0.2 * i, duration: 0.4, delay: 0.04 });
    this.tone({ type: 'sine', freq: 36, freqEnd: 20, gain: 0.25 * i, duration: 0.7 });
  }

  playRingCollect() {
    void this.resume();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.tone({
        type: 'sine',
        freq,
        freqEnd: freq * 1.02,
        gain: 0.14 - idx * 0.015,
        duration: 0.16,
        delay: idx * 0.045,
      });
      this.tone({
        type: 'triangle',
        freq: freq * 2,
        gain: 0.04,
        duration: 0.1,
        delay: idx * 0.045,
      });
    });
  }

  playDamage() {
    void this.resume();
    this.noiseBurst(0.15, 0.4, 1200, 150);
    this.tone({ type: 'sawtooth', freq: 160, freqEnd: 55, gain: 0.22, duration: 0.28 });
    this.tone({ type: 'square', freq: 90, freqEnd: 40, gain: 0.12, duration: 0.22, delay: 0.03 });
  }

  playCombo(level: number) {
    void this.resume();
    const n = clamp(Math.floor(level), 1, 12);
    const base = 440 + n * 40;
    this.tone({ type: 'sine', freq: base, gain: 0.12, duration: 0.1 });
    this.tone({ type: 'triangle', freq: base * 1.5, gain: 0.08, duration: 0.12, delay: 0.04 });
    if (n >= 4) {
      this.tone({ type: 'sine', freq: base * 2, gain: 0.06, duration: 0.14, delay: 0.08 });
    }
  }

  playBoost() {
    void this.resume();
    this.noiseBurst(0.18, 0.28, 2400, 600);
    this.tone({ type: 'sawtooth', freq: 110, freqEnd: 220, gain: 0.12, duration: 0.2 });
  }

  playUISelect() {
    void this.resume();
    this.tone({ type: 'sine', freq: 660, gain: 0.08, duration: 0.06 });
  }

  playUIConfirm() {
    void this.resume();
    this.tone({ type: 'sine', freq: 440, gain: 0.1, duration: 0.08 });
    this.tone({ type: 'sine', freq: 660, gain: 0.1, duration: 0.1, delay: 0.07 });
    this.tone({ type: 'triangle', freq: 880, gain: 0.07, duration: 0.12, delay: 0.14 });
  }

  playMissionComplete() {
    void this.resume();
    const fanfare = [392, 523.25, 659.25, 784, 1046.5];
    fanfare.forEach((freq, idx) => {
      this.tone({
        type: 'triangle',
        freq,
        gain: 0.14,
        duration: 0.28,
        delay: idx * 0.11,
      });
      this.tone({
        type: 'sine',
        freq: freq / 2,
        gain: 0.08,
        duration: 0.32,
        delay: idx * 0.11,
      });
    });
    this.tone({ type: 'sine', freq: 523.25, gain: 0.1, duration: 0.9, delay: 0.55 });
    this.tone({ type: 'sine', freq: 659.25, gain: 0.08, duration: 0.9, delay: 0.55 });
    this.tone({ type: 'sine', freq: 783.99, gain: 0.07, duration: 0.9, delay: 0.55 });
  }

  playMissionFailed() {
    void this.resume();
    this.tone({ type: 'sawtooth', freq: 220, freqEnd: 90, gain: 0.16, duration: 0.45 });
    this.tone({ type: 'triangle', freq: 165, freqEnd: 70, gain: 0.12, duration: 0.55, delay: 0.08 });
    this.noiseBurst(0.3, 0.25, 500, 80);
  }

  playStart() {
    this.playUIConfirm();
    this.noiseBurst(0.25, 0.2, 2000, 400);
  }

  // ---- Internals ----

  private tone(spec: OscSpec) {
    const ctx = this.ensure();
    if (!ctx || !this.sfx) return;
    const now = ctx.currentTime + (spec.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type ?? 'sine';
    osc.frequency.setValueAtTime(spec.freq, now);
    if (spec.freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), now + spec.duration);
    }
    if (spec.detune != null) osc.detune.value = spec.detune;

    const attack = spec.attack ?? 0.005;
    const peak = spec.gain;
    const end = spec.gainEnd ?? 0.0001;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, end), now + spec.duration);

    osc.connect(gain);
    gain.connect(this.sfx);
    osc.start(now);
    osc.stop(now + spec.duration + 0.02);
  }

  private noiseBurst(duration: number, gainPeak: number, startFreq: number, endFreq: number) {
    const ctx = this.ensure();
    if (!ctx || !this.sfx) return;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startFreq, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), ctx.currentTime + duration);
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  }
}

/** Shared singleton for convenience — gameplay may also `new GameAudio()`. */
let shared: GameAudio | null = null;

export function getGameAudio(): GameAudio {
  if (!shared) shared = new GameAudio();
  return shared;
}
