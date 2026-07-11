import type { AudioBus } from './bus';
import type { RadioCue } from './types';
import type { RadioCaptionListener } from './events';
import { createNoiseBuffer, hashString } from './util';
import { playTone } from './synth';

/**
 * Synthesized radio chatter — band-limited noise bursts + formant beeps.
 * Optional text seed drives syllable rhythm; captions emit for HUD text-radio.
 */
export class RadioChatter {
  private bus: AudioBus | null = null;
  private lastCueAt = 0;
  private hiss: AudioBufferSourceNode | null = null;
  private hissGain: GainNode | null = null;
  private hissFilter: BiquadFilterNode | null = null;
  private captionListeners: RadioCaptionListener[] = [];

  attach(bus: AudioBus) {
    this.bus = bus;
  }

  onCaption(listener: RadioCaptionListener) {
    this.captionListeners.push(listener);
    return () => {
      this.captionListeners = this.captionListeners.filter((l) => l !== listener);
    };
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
    if (now - this.lastCueAt < 0.32) return;
    this.lastCueAt = now;

    bus.duck(0.18, 0.25);

    // Key-up click
    playTone(bus, {
      type: 'square',
      freq: 2400,
      freqEnd: 900,
      gain: 0.045,
      duration: 0.03,
      channel: 'radio',
    });

    const caption = textHint ?? this.defaultCaption(cue);
    this.emitCaption(cue, caption);

    const seed = hashString(caption);
    const pattern = this.patternFor(cue, seed);
    this.speakPattern(pattern, seed);

    // Tail static
    this.staticBurst(0.08 + (seed % 5) * 0.01, 0.055, 0.12 + pattern.length * 0.05);
  }

  /** Speak arbitrary short text as syllable beeps (callsigns, toasts). */
  playText(text: string) {
    const cleaned = text.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 48);
    if (!cleaned) return;
    this.playCue('weapons-free', cleaned);
  }

  private emitCaption(cue: RadioCue | 'text', text: string) {
    const payload = { text, cue, atMs: performance.now() };
    for (const listener of this.captionListeners) {
      try {
        listener(payload);
      } catch {
        // ignore listener errors
      }
    }
  }

  private defaultCaption(cue: RadioCue): string {
    switch (cue) {
      case 'mission-start':
        return 'STRIKE RUN GO';
      case 'weapons-free':
        return 'WEAPONS FREE';
      case 'target-down':
        return 'SPLASH ONE';
      case 'depot-down':
        return 'DEPOT DOWN';
      case 'hull-critical':
        return 'HULL CRITICAL';
      case 'near-miss':
        return 'NEAR MISS';
      case 'bingo':
        return 'BINGO FUEL';
      case 'mission-complete':
        return 'MISSION COMPLETE';
      case 'mayday':
        return 'MAYDAY MAYDAY';
      default:
        return 'COPY';
    }
  }

  private patternFor(cue: RadioCue, seed: number): number[] {
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
      this.syllable(formant, dur, t, 0.075 + len * 0.02);
      playTone(bus, {
        type: i % 2 === 0 ? 'sawtooth' : 'square',
        freq: formant,
        freqEnd: formant * (0.92 + (seed % 4) * 0.02),
        gain: 0.048,
        duration: dur,
        delay: t,
        channel: 'radio',
      });
      playTone(bus, {
        type: 'sine',
        freq: formant * 1.6,
        gain: 0.028,
        duration: dur * 0.85,
        delay: t + 0.01,
        channel: 'radio',
      });
      // Soft third formant for radio grit
      playTone(bus, {
        type: 'triangle',
        freq: formant * 2.3,
        gain: 0.015,
        duration: dur * 0.6,
        delay: t + 0.015,
        channel: 'radio',
      });
      t += dur + 0.035;
    });
    playTone(bus, {
      type: 'square',
      freq: 1800,
      freqEnd: 400,
      gain: 0.032,
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
