/**
 * Mix bus: master + category gains with soft ducking.
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

  private muted = false;
  private masterTarget = 0.85;
  private duckUntil = 0;
  private duckAmount = 0;
  private musicBase = 0.42;
  private ambienceBase = 0.55;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.masterTarget;
    this.master.connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.95;
    this.sfx.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = this.musicBase;
    this.music.connect(this.master);

    this.ambience = ctx.createGain();
    this.ambience.gain.value = this.ambienceBase;
    this.ambience.connect(this.master);

    this.radio = ctx.createGain();
    this.radio.gain.value = 0.7;
    this.radio.connect(this.master);

    this.warn = ctx.createGain();
    this.warn.gain.value = 0.85;
    this.warn.connect(this.master);
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
    this.applyDuck(this.ctx.currentTime);
  }

  setAmbienceBase(level: number) {
    this.ambienceBase = level;
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
