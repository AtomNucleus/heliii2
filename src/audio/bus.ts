/**
 * Mix bus: master + category gains with soft ducking and a safety limiter.
 * Music/ambience duck under combat SFX and warnings.
 */

export type BusChannel = 'sfx' | 'music' | 'ambience' | 'radio' | 'warn';

export class AudioBus {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly sfx: GainNode;
  readonly music: GainNode;
  readonly ambience: GainNode;
  readonly radio: GainNode;
  readonly warn: GainNode;
  readonly limiter: DynamicsCompressorNode;

  private muted = false;
  private masterTarget = 0.88;
  private duckUntil = 0;
  private duckAmount = 0;
  private musicBase = 0.42;
  private ambienceBase = 0.55;
  private channelLevels: Record<BusChannel, number> = {
    sfx: 0.95,
    music: 0.42,
    ambience: 0.55,
    radio: 0.72,
    warn: 0.88,
  };

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.masterTarget;
    this.master.connect(this.limiter);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.channelLevels.sfx;
    this.sfx.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = this.channelLevels.music;
    this.music.connect(this.master);

    this.ambience = ctx.createGain();
    this.ambience.gain.value = this.channelLevels.ambience;
    this.ambience.connect(this.master);

    this.radio = ctx.createGain();
    this.radio.gain.value = this.channelLevels.radio;
    this.radio.connect(this.master);

    this.warn = ctx.createGain();
    this.warn.gain.value = this.channelLevels.warn;
    this.warn.connect(this.master);

    this.musicBase = this.channelLevels.music;
    this.ambienceBase = this.channelLevels.ambience;
  }

  channel(name: BusChannel): GainNode {
    switch (name) {
      case 'sfx':
        return this.sfx;
      case 'music':
        return this.music;
      case 'ambience':
        return this.ambience;
      case 'radio':
        return this.radio;
      case 'warn':
        return this.warn;
    }
  }

  /** Per-channel user volume 0…1 (pre-duck). */
  setChannelLevel(name: BusChannel, level: number) {
    const v = Math.max(0, Math.min(1, level));
    this.channelLevels[name] = v;
    if (name === 'music') {
      this.musicBase = v;
      this.applyDuck(this.ctx.currentTime);
      return;
    }
    if (name === 'ambience') {
      this.ambienceBase = v;
      this.applyDuck(this.ctx.currentTime);
      return;
    }
    const now = this.ctx.currentTime;
    this.channel(name).gain.setTargetAtTime(v, now, 0.04);
  }

  getChannelLevel(name: BusChannel): number {
    return this.channelLevels[name];
  }

  setMasterLevel(level: number) {
    this.masterTarget = Math.max(0, Math.min(1, level));
    if (!this.muted) {
      const now = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.masterTarget, now, 0.04);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : this.masterTarget, now, 0.03);
  }

  get isMuted() {
    return this.muted;
  }

  /**
   * Duck music + ambience briefly so impacts / warnings punch through.
   * amount 0…1, duration seconds.
   */
  duck(amount = 0.55, duration = 0.35) {
    const now = this.ctx.currentTime;
    this.duckAmount = Math.max(this.duckAmount, Math.min(0.85, amount));
    this.duckUntil = Math.max(this.duckUntil, now + duration);
    this.applyDuck(now);
  }

  /** Call ~each frame or when scheduling duck. */
  tick() {
    const now = this.ctx.currentTime;
    if (this.duckAmount > 0 && now >= this.duckUntil) {
      this.duckAmount = 0;
      this.applyDuck(now);
    }
  }

  setMusicBase(level: number) {
    this.musicBase = level;
    this.channelLevels.music = level;
    this.applyDuck(this.ctx.currentTime);
  }

  setAmbienceBase(level: number) {
    this.ambienceBase = level;
    this.channelLevels.ambience = level;
    this.applyDuck(this.ctx.currentTime);
  }

  private applyDuck(now: number) {
    const mul = 1 - this.duckAmount;
    this.music.gain.cancelScheduledValues(now);
    this.ambience.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(this.musicBase * mul, now, 0.05);
    this.ambience.gain.setTargetAtTime(this.ambienceBase * mul, now, 0.06);
  }
}
