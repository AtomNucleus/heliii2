import type { AudioBus } from './bus';
import { createNoiseBuffer, clamp } from './util';

/**
 * Environmental ambience: wind rush, dusk desert bed, distant heat shimmer hiss.
 */
export class EnvironmentAmbience {
  private bus: AudioBus | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windRunning = false;

  private bedSource: AudioBufferSourceNode | null = null;
  private bedGain: GainNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  private bedLfo: OscillatorNode | null = null;
  private bedLfoGain: GainNode | null = null;
  private bedRunning = false;

  start(bus: AudioBus) {
    this.bus = bus;
    this.startWind();
    this.startDesertBed();
  }

  stop(fadeSec = 0.45) {
    this.stopWind(fadeSec);
    this.stopDesertBed(fadeSec);
  }

  update(speed: number, altitude: number, boosting: boolean) {
    const bus = this.bus;
    if (!bus) return;
    const now = bus.ctx.currentTime;

    if (this.windRunning && this.windGain && this.windFilter) {
      const nearGround = clamp(1 - altitude / 40, 0, 1);
      const windLevel =
        0.012 + (speed / 90) * 0.09 + nearGround * 0.025 + (boosting ? 0.035 : 0);
      this.windGain.gain.setTargetAtTime(windLevel, now, 0.15);
      this.windFilter.frequency.setTargetAtTime(
        400 + speed * 12 + nearGround * 200,
        now,
        0.2,
      );
    }

    if (this.bedRunning && this.bedGain && this.bedFilter) {
      const dusk = 0.018 + clamp(altitude / 120, 0, 1) * 0.012;
      this.bedGain.gain.setTargetAtTime(dusk, now, 0.4);
      this.bedFilter.frequency.setTargetAtTime(280 + altitude * 1.5, now, 0.5);
    }
  }

  private startWind() {
    const bus = this.bus;
    if (!bus || this.windRunning) return;
    const ctx = bus.ctx;
    const buffer = createNoiseBuffer(ctx, 2.2, 'brown');

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
    this.windGain.connect(bus.ambience);
    this.windSource.start();
    this.windRunning = true;
  }

  private stopWind(fadeSec = 0.4) {
    const bus = this.bus;
    if (!bus || !this.windRunning) return;
    const now = bus.ctx.currentTime;
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

  private startDesertBed() {
    const bus = this.bus;
    if (!bus || this.bedRunning) return;
    const ctx = bus.ctx;
    const buffer = createNoiseBuffer(ctx, 3.5, 'pink');

    this.bedFilter = ctx.createBiquadFilter();
    this.bedFilter.type = 'lowpass';
    this.bedFilter.frequency.value = 320;
    this.bedFilter.Q.value = 0.4;

    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.0001;

    this.bedSource = ctx.createBufferSource();
    this.bedSource.buffer = buffer;
    this.bedSource.loop = true;
    this.bedSource.connect(this.bedFilter);
    this.bedFilter.connect(this.bedGain);

    // Slow amplitude shimmer
    this.bedLfoGain = ctx.createGain();
    this.bedLfoGain.gain.value = 0.006;
    this.bedLfo = ctx.createOscillator();
    this.bedLfo.type = 'sine';
    this.bedLfo.frequency.value = 0.07;
    this.bedLfo.connect(this.bedLfoGain);
    this.bedLfoGain.connect(this.bedGain.gain);

    this.bedGain.connect(bus.ambience);
    const now = ctx.currentTime;
    this.bedSource.start(now);
    this.bedLfo.start(now);
    this.bedGain.gain.setTargetAtTime(0.02, now, 1.2);
    this.bedRunning = true;
  }

  private stopDesertBed(fadeSec = 0.5) {
    const bus = this.bus;
    if (!bus || !this.bedRunning) return;
    const now = bus.ctx.currentTime;
    this.bedGain?.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    window.setTimeout(() => {
      try {
        this.bedSource?.stop();
        this.bedLfo?.stop();
      } catch {
        // ignore
      }
      this.bedSource = null;
      this.bedGain = null;
      this.bedFilter = null;
      this.bedLfo = null;
      this.bedLfoGain = null;
      this.bedRunning = false;
    }, (fadeSec + 0.1) * 1000);
  }
}
