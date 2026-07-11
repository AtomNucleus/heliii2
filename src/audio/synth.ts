import type { AudioBus, BusChannel } from './bus';
import { createNoiseBuffer } from './util';

export interface OscSpec {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  gain: number;
  gainEnd?: number;
  attack?: number;
  duration: number;
  delay?: number;
  detune?: number;
  channel?: BusChannel;
  /** Optional destination override (e.g. panner). */
  dest?: AudioNode;
}

export function playTone(bus: AudioBus, spec: OscSpec) {
  const ctx = bus.ctx;
  const dest = spec.dest ?? bus.channel(spec.channel ?? 'sfx');
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
  gain.connect(dest);
  osc.start(now);
  osc.stop(now + spec.duration + 0.02);
}

export function playNoiseBurst(
  bus: AudioBus,
  duration: number,
  gainPeak: number,
  startFreq: number,
  endFreq: number,
  opts?: { channel?: BusChannel; dest?: AudioNode; kind?: 'white' | 'pink' | 'brown'; delay?: number },
) {
  const ctx = bus.ctx;
  const dest = opts?.dest ?? bus.channel(opts?.channel ?? 'sfx');
  const t0 = ctx.currentTime + (opts?.delay ?? 0);
  const buffer = createNoiseBuffer(ctx, duration, opts?.kind ?? 'white');
  // Shape envelope into buffer copy for one-shot decay feel
  const shaped = ctx.createBuffer(1, buffer.length, ctx.sampleRate);
  const srcData = buffer.getChannelData(0);
  const dstData = shaped.getChannelData(0);
  for (let i = 0; i < srcData.length; i++) {
    dstData[i] = srcData[i] * (1 - i / srcData.length);
  }

  const src = ctx.createBufferSource();
  src.buffer = shaped;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(startFreq, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + duration);
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainPeak, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}
