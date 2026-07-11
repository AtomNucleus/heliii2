import type { AudioBus } from './bus';
import type { RadioCue } from './types';
import { createNoiseBuffer, hashString } from './util';
import { playTone } from './synth';

/**
 * Synthesized radio chatter — band-limited noise bursts + formant beeps.
 * Optional text seed drives syllable rhythm (nonverbal / text-driven cues).
 */
export class RadioChatter {
  private bus: AudioBus | null = null;
  private lastCueAt = 0;
  private hiss: AudioBufferSourceNode | null = null;
  private hissGain: GainNode | null = null;
  private hissFilter: BiquadFilterNode | null = null;

  attach(bus: AudioBus) {
    this.bus = bus;
  }

  /** Soft carrier hiss while flight is active. */
  startCarrier() {
    const bus = this.bus;
    if (!bus || this.hiss) return;
    const ctx = bus.ctx;
    const buffer = createNoiseBuffer(ctx, 1.5, 'pink');
    this.hissFilter = ctx.createBiquadFilter();
    this.hissFilter.type = 'bandpass';
    this.hissFilter.frequency.value = 1800;
    this.hissFilter.Q.value = 0.7;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.0001;
    this.hiss = ctx.createBufferSource();
    this.hiss.buffer = buffer;
    this.hiss.loop = true;
    this.hiss.connect(this.hissFilter);
    this.hissFilter.connect(this.hissGain);
    this.hissGain.connect(bus.radio);
    this.hiss.start();
    this.hissGain.gain.setTargetAtTime(0.012, ctx.currentTime, 0.8);
  }

  stopCarrier(fadeSec = 0.3) {
    const bus = this.bus;
    if (!bus || !this.hiss) return;
    const now = bus.ctx.currentTime;
    this.hissGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    const src = this.hiss;
    window.setTimeout(() => {
      try {
        src.stop();
      } catch {
        // ignore
      }
      this.hiss = null;
      this.hissGain = null;
      this.hissFilter = null;
    }, (fadeSec + 0.1) * 1000);
  }

  playCue(cue: RadioCue, textHint?: string) {
    const bus = this.bus;
    if (!bus) return;
    const now = bus.ctx.currentTime;
    if (now - this.lastCueAt < 0.35) return;
    this.lastCueAt = now;

    // Key-up click
    playTone(bus, {
      type: 'square',
      freq: 2400,
      freqEnd: 900,
      gain: 0.04,
      duration: 0.03,
      channel: 'radio',
    });

    const seed = hashString(textHint ?? cue);
    const pattern = this.patternFor(cue, seed);
    this.speakPattern(pattern, seed);

    // Tail static
    this.staticBurst(0.08 + (seed % 5) * 0.01, 0.05, 0.12 + pattern.length * 0.05);
  }

  /** Speak arbitrary short text as syllable beeps (callsigns, toasts). */
  playText(text: string) {
    const cleaned = text.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 48);
    if (!cleaned) return;
    this.playCue('weapons-free', cleaned);
  }

  private patternFor(cue: RadioCue, seed: number): number[] {
    // Relative syllable lengths / emphasis
    switch (cue) {
      case 'mission-start':
        return [1, 1, 1.4, 0.8, 1.2];
      case 'weapons-free':
        return [1.2, 0.7, 1.5];
      case 'target-down':
        return [0.8, 0.8, 1.6];
      case 'depot-down':
        return [1, 1, 1, 1.8];
      case 'hull-critical':
        return [1.6, 1.6, 1.6];
      case 'near-miss':
        return [0.5, 1.2];
      case 'bingo':
        return [1.4, 1.4];
      case 'mission-complete':
        return [1, 1.2, 1.4, 1.8];
      case 'mayday':
        return [2, 2, 2];
      default:
        return [1, 0.8 + (seed % 3) * 0.2, 1.2];
    }
  }

  private speakPattern(pattern: number[], seed: number) {
    const bus = this.bus;
    if (!bus) return;
    let t = 0.04;
    const base = 420 + (seed % 7) * 35;
    pattern.forEach((len, i) => {
      const formant = base + (i % 3) * 90 + ((seed >> (i + 1)) % 5) * 18;
      const dur = 0.05 + len * 0.055;
      // Noise syllable
      this.syllable(formant, dur, t, 0.07 + len * 0.02);
      // Tone carrier
      playTone(bus, {
        type: i % 2 === 0 ? 'sawtooth' : 'square',
        freq: formant,
        freqEnd: formant * (0.92 + (seed % 4) * 0.02),
        gain: 0.045,
        duration: dur,
        delay: t,
        channel: 'radio',
      });
      // Second formant
      playTone(bus, {
        type: 'sine',
        freq: formant * 1.6,
        gain: 0.025,
        duration: dur * 0.85,
        delay: t + 0.01,
        channel: 'radio',
      });
      t += dur + 0.035;
    });
    // Unkey click
    playTone(bus, {
      type: 'square',
      freq: 1800,
      freqEnd: 400,
      gain: 0.03,
      duration: 0.025,
      delay: t,
      channel: 'radio',
    });
  }

  private syllable(centerFreq: number, duration: number, delay: number, gainPeak: number) {
    const bus = this.bus;
    if (!bus) return;
    const ctx = bus.ctx;
    const t0 = ctx.currentTime + delay;
    const buffer = createNoiseBuffer(ctx, duration, 'pink');
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = centerFreq;
    filter.Q.value = 4.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus.radio);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  private staticBurst(duration: number, gainPeak: number, delay: number) {
    const bus = this.bus;
    if (!bus) return;
    const ctx = bus.ctx;
    const t0 = ctx.currentTime + delay;
    const buffer = createNoiseBuffer(ctx, duration, 'white');
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus.radio);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }
}
