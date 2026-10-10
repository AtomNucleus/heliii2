import { clamp, type FlightInput } from './flight';

export class FlightAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: GainNode | null = null;
  private turbine: OscillatorNode | null = null;
  private rotorRate: OscillatorNode | null = null;
  private wind: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rotorFilter: BiquadFilterNode | null = null;
  private stereo: StereoPannerNode | null = null;
  private volume = 0.7;
  private muted = false;
  private active = false;
  get available() {
    return this.context !== null;
  }
  async unlock(): Promise<boolean> {
    try {
      if (!this.context) this.create();
      if (this.context!.state !== 'running') await this.context!.resume();
      return this.context!.state === 'running';
    } catch {
      return false;
    }
  }
  private create() {
    const ctx = new AudioContext();
    this.context = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 5;
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * 0.7;
    this.master.connect(compressor);
    this.stereo = ctx.createStereoPanner();
    this.stereo.connect(this.master);
    this.engine = ctx.createGain();
    this.engine.gain.value = 0;
    this.engine.connect(this.stereo);
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.1) / 1.03;
      data[i] = last * 3;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.rotorFilter = ctx.createBiquadFilter();
    this.rotorFilter.type = 'lowpass';
    this.rotorFilter.frequency.value = 420;
    const rotorGain = ctx.createGain();
    rotorGain.gain.value = 0.24;
    noise.connect(this.rotorFilter);
    this.rotorFilter.connect(rotorGain);
    rotorGain.connect(this.engine);
    this.rotorRate = ctx.createOscillator();
    this.rotorRate.type = 'sine';
    this.rotorRate.frequency.value = 18;
    const modulation = ctx.createGain();
    modulation.gain.value = 0.2;
    this.rotorRate.connect(modulation);
    modulation.connect(rotorGain.gain);
    this.rotorRate.start();
    noise.start();
    for (const frequency of [54, 108]) {
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = frequency === 54 ? 0.15 : 0.04;
      tone.connect(gain);
      gain.connect(this.engine);
      tone.start();
    }
    this.turbine = ctx.createOscillator();
    this.turbine.type = 'triangle';
    this.turbine.frequency.value = 360;
    const turbineGain = ctx.createGain();
    turbineGain.gain.value = 0.018;
    this.turbine.connect(turbineGain);
    turbineGain.connect(this.engine);
    this.turbine.start();
    const windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windSource.playbackRate.value = 1.3;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 1100;
    this.windFilter.Q.value = 0.5;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    windSource.connect(this.windFilter);
    this.windFilter.connect(this.wind);
    this.wind.connect(this.master);
    windSource.start();
  }
  settings(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(muted ? 0 : volume * 0.7, this.context.currentTime, 0.05);
  }
  setActive(active: boolean) {
    this.active = active;
    if (this.context) {
      this.engine?.gain.setTargetAtTime(active ? 1 : 0, this.context.currentTime, 0.2);
      this.wind?.gain.setTargetAtTime(0, this.context.currentTime, 0.15);
    }
  }
  update(speed: number, altitude: number, input: FlightInput, turn: number, cockpit: boolean) {
    const ctx = this.context;
    if (!ctx || !this.active) return;
    const load =
      Math.abs(input.lift) * 0.15 + (input.boost ? 0.3 : 0) + Math.abs(input.forward) * 0.1;
    this.rotorRate?.frequency.setTargetAtTime(18 + load * 8, ctx.currentTime, 0.18);
    this.turbine?.frequency.setTargetAtTime(340 + speed * 3 + load * 170, ctx.currentTime, 0.2);
    this.rotorFilter?.frequency.setTargetAtTime(
      (cockpit ? 240 : 410) + load * 250,
      ctx.currentTime,
      0.2,
    );
    this.engine?.gain.setTargetAtTime(
      (cockpit ? 0.65 : 0.85) + load * 0.25 + Math.max(0, 12 - altitude) * 0.012,
      ctx.currentTime,
      0.12,
    );
    this.wind?.gain.setTargetAtTime(
      clamp(speed / 80, 0, 1) ** 2 * (cockpit ? 0.12 : 0.3),
      ctx.currentTime,
      0.2,
    );
    this.windFilter?.frequency.setTargetAtTime(550 + speed * 22, ctx.currentTime, 0.2);
    this.stereo?.pan.setTargetAtTime(clamp(turn * 0.16, -0.25, 0.25), ctx.currentTime, 0.15);
  }
  cue(kind: 'start' | 'checkpoint' | 'complete' | 'impact' | 'warning') {
    const ctx = this.context;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const notes =
      kind === 'complete'
        ? [523, 659, 784, 1047]
        : kind === 'checkpoint'
          ? [660, 880]
          : kind === 'start'
            ? [330, 440, 660]
            : kind === 'warning'
              ? [220, 220]
              : [65];
    notes.forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.105;
      const tone = ctx.createOscillator(),
        gain = ctx.createGain();
      tone.type = kind === 'impact' ? 'triangle' : 'sine';
      tone.frequency.setValueAtTime(frequency, start);
      if (kind === 'impact') tone.frequency.exponentialRampToValueAtTime(25, start + 0.25);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(kind === 'impact' ? 0.25 : 0.09, start + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      tone.connect(gain);
      gain.connect(this.master!);
      tone.start(start);
      tone.stop(start + 0.32);
      tone.onended = () => {
        tone.disconnect();
        gain.disconnect();
      };
    });
  }
}
