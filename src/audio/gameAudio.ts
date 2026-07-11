/**
 * HELI SUNSET cinematic procedural audio — Web Audio only, no downloads.
 *
 * Layers: rotor/load/ground-slap, turbine, wind + desert bed, adaptive score,
 * spatial combat, Doppler flybys, threat cues, warnings, radio chatter, mix ducking.
 * Call `resume()` (or any play* / handleEvent) after a user gesture.
 */

import { AudioBus, type BusChannel } from './bus';
import { SpatialAudio } from './spatial';
import { RotorBed } from './rotor';
import { EnvironmentAmbience } from './environment';
import { MusicLayers } from './music';
import { RadioChatter } from './radio';
import { WarningSystem } from './warnings';
import { CombatSfx } from './combatSfx';
import { FlybyEngine } from './flyby';
import { ThreatCues } from './threat';
import { playTone, playNoiseBurst } from './synth';
import { clamp } from './util';
import type {
  FlightAudioParams,
  ImpactKind,
  MusicIntensity,
  RadioCue,
  SpatialPoint,
  WarningKind,
  WorldAudioFrame,
} from './types';
import type {
  AudioMissionEvent,
  RadioCaptionListener,
} from './events';

export type { ImpactKind, FlightAudioParams, MusicIntensity, RadioCue, WarningKind, WorldAudioFrame };
export type { SpatialPoint, FlybyCandidate, Vec3Like } from './types';
export type { AudioMissionEvent, RadioCaption, RadioCaptionListener } from './events';
export type { BusChannel } from './bus';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private bus: AudioBus | null = null;
  private spatial: SpatialAudio | null = null;

  private rotor = new RotorBed();
  private environment = new EnvironmentAmbience();
  private music = new MusicLayers();
  private radio = new RadioChatter();
  private warnings = new WarningSystem();
  private combat = new CombatSfx();
  private flybys = new FlybyEngine();
  private threats = new ThreatCues();

  private muted = false;
  private flightActive = false;
  private lastWeaponReady = true;
  private combatHeat = 0;
  private hullCritical = false;
  private musicIntensity: MusicIntensity = 'idle';
  private lastBoosting = false;
  private visibilityBound = false;
  private disposed = false;

  /** Ensure AudioContext + bus exist (lazy). Safe to call repeatedly. */
  ensure(): AudioContext | null {
    if (this.disposed || typeof window === 'undefined') return null;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;

    if (!this.ctx) {
      this.ctx = new AC();
      this.bus = new AudioBus(this.ctx);
      this.spatial = new SpatialAudio(this.bus);
      this.radio.attach(this.bus);
      this.warnings.attach(this.bus);
      this.combat.attach(this.bus, this.spatial);
      this.flybys.attach(this.bus, this.spatial);
      this.threats.attach(this.bus, this.spatial);
      if (this.muted) this.bus.setMuted(true);
      this.bindLifecycle();
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
    this.ensure();
    this.bus?.setMuted(muted);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setChannelLevel(channel: BusChannel, level: number) {
    this.ensure();
    this.bus?.setChannelLevel(channel, level);
  }

  setMasterLevel(level: number) {
    this.ensure();
    this.bus?.setMasterLevel(level);
  }

  /** HUD / narrative text-radio captions. */
  onRadioCaption(listener: RadioCaptionListener) {
    return this.radio.onCaption(listener);
  }

  /**
   * Single entry for mission / UX narrative events.
   * Prefer this over scattering play* calls from main.
   */
  handleEvent(event: AudioMissionEvent) {
    void this.resume();
    switch (event.type) {
      case 'fire':
        this.playWeaponFire();
        break;
      case 'hit':
        this.playWeaponHit(event.at);
        break;
      case 'kill':
        this.playExplosion(event.primary ? 1.35 : 1, event.at);
        if (event.combo != null) this.playCombo(event.combo);
        if (event.primary) {
          this.playRadio('depot-down', 'DEPOT DOWN');
          this.setMusicIntensity('combat');
        } else {
          this.playRadio('target-down', 'SPLASH');
        }
        break;
      case 'damage':
        this.playDamage();
        if (event.remaining != null && event.remaining <= 30 && event.remaining > 0) {
          this.playRadio('hull-critical', 'HULL CRITICAL');
          this.setMusicIntensity('critical');
        }
        break;
      case 'ring':
        this.playRingCollect();
        break;
      case 'nearMiss':
        this.playRadio('near-miss', 'NEAR MISS');
        this.playWarning('incoming');
        break;
      case 'toast':
        // Narrative toast — soft radio syllable if short enough
        if (event.message && event.message.length <= 28) {
          this.playRadioText(event.message);
        }
        break;
      case 'impact':
        this.playImpact(event.intensity ?? 0.7, event.kind ?? 'hard');
        break;
      case 'boost':
        this.playBoost();
        break;
      case 'weapon-ready':
        this.notifyWeaponReady(event.ready);
        break;
      case 'aa-fire':
        this.playAaFire(event.at);
        break;
      case 'radio':
        this.playRadio(event.cue, event.text);
        break;
      case 'warning':
        this.playWarning(event.kind);
        break;
      case 'mission-start':
        this.playStart();
        break;
      case 'mission-complete':
        this.playMissionComplete();
        break;
      case 'mission-failed':
        this.playMissionFailed();
        break;
    }
  }

  // ---- Continuous flight layers ----

  /** Start full flight soundscape (rotor + engine + wind + music + radio carrier). */
  startFlightAmbience() {
    void this.resume();
    const bus = this.bus;
    if (!bus) return;
    this.flightActive = true;
    this.rotor.start(bus);
    this.environment.start(bus);
    this.music.start(bus);
    this.music.setIntensity(this.musicIntensity === 'idle' ? 'patrol' : this.musicIntensity);
    this.radio.startCarrier();
    this.threats.start();
    this.flybys.reset();
  }

  /** Stop flight soundscape. */
  stopFlightAmbience() {
    this.flightActive = false;
    this.rotor.stop();
    this.environment.stop();
    this.music.stop();
    this.radio.stopCarrier();
    this.threats.stop();
    this.warnings.stopAll();
    this.warnings.setHullCritical(false);
    this.warnings.setLowAltitude(false);
    this.hullCritical = false;
    this.lastBoosting = false;
  }

  startRotor() {
    void this.resume();
    if (this.bus) this.rotor.start(this.bus);
  }

  stopRotor(fadeSec = 0.35) {
    this.rotor.stop(fadeSec);
  }

  setRotorIntensity(t: number) {
    this.rotor.update(t, 0);
  }

  startEngine() {
    void this.resume();
    if (this.bus) this.rotor.start(this.bus);
  }

  stopEngine(fadeSec = 0.5) {
    this.rotor.stop(fadeSec);
  }

  /** Alias kept for earlier WIP naming. */
  startBed() {
    this.startEngine();
  }

  stopBed(fadeSec = 0.5) {
    this.stopEngine(fadeSec);
  }

  startWind() {
    void this.resume();
    if (this.bus) this.environment.start(this.bus);
  }

  stopWind(fadeSec = 0.4) {
    this.environment.stop(fadeSec);
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
    const vSpeed = params.verticalSpeed ?? 0;
    const lift = params.lift ?? 0;
    const healthRatio = params.healthRatio ?? 1;
    const heat = params.combatHeat ?? this.combatHeat;

    const intensity = clamp(
      throttle * 0.75 + (boosting ? 0.35 : 0) + speed / 120,
      0,
      1,
    );
    const load = clamp(
      Math.max(0, vSpeed) / 18 +
        Math.max(0, lift) * 0.45 +
        (boosting ? 0.35 : 0) +
        (speed < 8 ? 0.15 : 0),
      0,
      1,
    );

    this.rotor.update(intensity, load, { altitude, healthRatio, boosting });
    this.environment.update(speed, altitude, boosting);
    this.combatHeat = clamp(heat, 0, 1);
    this.music.setCombatHeat(this.combatHeat);

    if (boosting && !this.lastBoosting) {
      this.playBoost();
    }
    this.lastBoosting = boosting;

    const critical = healthRatio <= 0.3 && healthRatio > 0;
    if (critical !== this.hullCritical) {
      this.hullCritical = critical;
      this.warnings.setHullCritical(critical);
      if (critical) {
        this.setMusicIntensity('critical');
        this.playRadio('hull-critical', 'HULL CRITICAL');
      } else if (this.musicIntensity === 'critical') {
        this.setMusicIntensity(this.combatHeat > 0.35 ? 'combat' : 'patrol');
      }
    }
    this.warnings.setLowAltitude(altitude < 4.5 && speed > 6);
    this.warnings.setLock(!!params.aimLocked);

    if (params.position && this.spatial) {
      this.spatial.setListener(
        params.position,
        undefined,
        { x: 0, y: 1, z: 0 },
        params.velocity,
      );
      this.combat.setListener(params.position, params.velocity);
      this.flybys.setListener(params.position, params.velocity);
      this.threats.setListener(params.position);
    }

    this.bus?.tick();
  }

  /**
   * Per-frame world audio: flybys, inbound bolts, threat bed, listener pose.
   * Call from the game loop while playing.
   */
  updateWorld(frame: WorldAudioFrame) {
    this.ensure();
    if (!this.spatial || !this.ctx) return;
    this.spatial.setListener(
      frame.listener,
      undefined,
      { x: 0, y: 1, z: 0 },
      frame.listenerVelocity,
    );
    this.combat.setListener(frame.listener, frame.listenerVelocity);
    this.flybys.setListener(frame.listener, frame.listenerVelocity);
    this.threats.setListener(frame.listener);

    if (frame.hostiles?.length) {
      this.flybys.update(frame.hostiles, this.ctx.currentTime);
      const threat = this.threats.update(frame.hostiles, this.ctx.currentTime);
      this.music.setThreat(threat);
      if (threat > 0.55 && this.musicIntensity === 'patrol') {
        this.setMusicIntensity('combat');
      }
    } else {
      this.music.setThreat(0);
      this.threats.update([], this.ctx.currentTime);
    }

    if (frame.inbound?.length) {
      for (const bolt of frame.inbound) {
        const dx = bolt.x - frame.listener.x;
        const dy = bolt.y - frame.listener.y;
        const dz = bolt.z - frame.listener.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 18) {
          this.combat.playIncomingWhoosh(bolt);
          this.warnings.play('incoming');
        }
      }
    }

    this.combatHeat = Math.max(0, this.combatHeat - frame.dt * 0.12);
    this.music.setCombatHeat(this.combatHeat);
    this.bus?.tick();
  }

  setMusicIntensity(intensity: MusicIntensity) {
    this.musicIntensity = intensity;
    this.music.setIntensity(intensity);
  }

  bumpCombatHeat(amount = 0.25) {
    this.combatHeat = clamp(this.combatHeat + amount, 0, 1);
    this.music.setCombatHeat(this.combatHeat);
    if (this.combatHeat > 0.4 && this.musicIntensity === 'patrol') {
      this.setMusicIntensity('combat');
    }
  }

  playRadio(cue: RadioCue, textHint?: string) {
    void this.resume();
    this.radio.playCue(cue, textHint);
  }

  playRadioText(text: string) {
    void this.resume();
    this.radio.playText(text);
  }

  playWarning(kind: WarningKind) {
    void this.resume();
    this.warnings.play(kind);
  }

  // ---- One-shots (legacy + spatial) ----

  playWeaponFire() {
    void this.resume();
    this.combat.playWeaponFire();
    this.bumpCombatHeat(0.08);
  }

  playWeaponHit(at?: SpatialPoint) {
    void this.resume();
    this.combat.playWeaponHit(at);
    this.bumpCombatHeat(0.12);
  }

  playWeaponReady() {
    void this.resume();
    if (!this.bus) return;
    playTone(this.bus, { type: 'sine', freq: 740, gain: 0.1, duration: 0.08 });
    playTone(this.bus, {
      type: 'triangle',
      freq: 988,
      gain: 0.08,
      duration: 0.12,
      delay: 0.06,
    });
    playTone(this.bus, {
      type: 'sine',
      freq: 1174,
      gain: 0.05,
      duration: 0.14,
      delay: 0.12,
    });
  }

  notifyWeaponReady(ready: boolean) {
    if (ready && !this.lastWeaponReady) {
      this.playWeaponReady();
    }
    this.lastWeaponReady = ready;
  }

  playImpact(intensity = 0.7, kind: ImpactKind = 'hard') {
    void this.resume();
    const i = clamp(intensity, 0.15, 1.5);
    if (!this.bus) return;
    if (kind === 'soft') {
      playNoiseBurst(this.bus, 0.08 * i, 0.25 * i, 900, 200);
      playTone(this.bus, {
        type: 'sine',
        freq: 120,
        freqEnd: 60,
        gain: 0.12 * i,
        duration: 0.15,
      });
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
    this.bus.duck(0.4 * Math.min(1, i), 0.3);
    playNoiseBurst(this.bus, 0.12 * i, 0.45 * i, 1400, 180);
    playTone(this.bus, {
      type: 'sawtooth',
      freq: 70,
      freqEnd: 28,
      gain: 0.28 * i,
      duration: 0.22,
    });
    playTone(this.bus, {
      type: 'square',
      freq: 55,
      freqEnd: 30,
      gain: 0.15 * i,
      duration: 0.18,
      delay: 0.02,
    });
  }

  playExplosion(intensity = 1, at?: SpatialPoint) {
    void this.resume();
    this.combat.playExplosion(intensity, at);
    this.bumpCombatHeat(0.35);
  }

  playAaFire(at: SpatialPoint) {
    void this.resume();
    this.combat.playAaFire(at);
    this.bumpCombatHeat(0.1);
  }

  playRingCollect() {
    void this.resume();
    if (!this.bus) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      playTone(this.bus!, {
        type: 'sine',
        freq,
        freqEnd: freq * 1.02,
        gain: 0.14 - idx * 0.015,
        duration: 0.16,
        delay: idx * 0.045,
      });
      playTone(this.bus!, {
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
    this.combat.playDamage();
    this.bumpCombatHeat(0.3);
    this.playWarning('hull');
  }

  playCombo(level: number) {
    void this.resume();
    if (!this.bus) return;
    const n = clamp(Math.floor(level), 1, 12);
    const base = 440 + n * 40;
    playTone(this.bus, { type: 'sine', freq: base, gain: 0.12, duration: 0.1 });
    playTone(this.bus, {
      type: 'triangle',
      freq: base * 1.5,
      gain: 0.08,
      duration: 0.12,
      delay: 0.04,
    });
    if (n >= 4) {
      playTone(this.bus, {
        type: 'sine',
        freq: base * 2,
        gain: 0.06,
        duration: 0.14,
        delay: 0.08,
      });
    }
  }

  playBoost() {
    void this.resume();
    if (!this.bus) return;
    playNoiseBurst(this.bus, 0.18, 0.28, 2400, 600);
    playTone(this.bus, {
      type: 'sawtooth',
      freq: 110,
      freqEnd: 220,
      gain: 0.12,
      duration: 0.2,
    });
    playTone(this.bus, {
      type: 'triangle',
      freq: 55,
      freqEnd: 90,
      gain: 0.08,
      duration: 0.25,
    });
  }

  playUISelect() {
    void this.resume();
    if (!this.bus) return;
    playTone(this.bus, { type: 'sine', freq: 660, gain: 0.08, duration: 0.06 });
  }

  playUIConfirm() {
    void this.resume();
    if (!this.bus) return;
    playTone(this.bus, { type: 'sine', freq: 440, gain: 0.1, duration: 0.08 });
    playTone(this.bus, {
      type: 'sine',
      freq: 660,
      gain: 0.1,
      duration: 0.1,
      delay: 0.07,
    });
    playTone(this.bus, {
      type: 'triangle',
      freq: 880,
      gain: 0.07,
      duration: 0.12,
      delay: 0.14,
    });
  }

  playMissionComplete() {
    void this.resume();
    this.setMusicIntensity('victory');
    this.playRadio('mission-complete', 'MISSION COMPLETE');
    if (!this.bus) return;
    const fanfare = [392, 523.25, 659.25, 784, 1046.5];
    fanfare.forEach((freq, idx) => {
      playTone(this.bus!, {
        type: 'triangle',
        freq,
        gain: 0.14,
        duration: 0.28,
        delay: idx * 0.11,
      });
      playTone(this.bus!, {
        type: 'sine',
        freq: freq / 2,
        gain: 0.08,
        duration: 0.32,
        delay: idx * 0.11,
      });
    });
    playTone(this.bus, {
      type: 'sine',
      freq: 523.25,
      gain: 0.1,
      duration: 0.9,
      delay: 0.55,
    });
    playTone(this.bus, {
      type: 'sine',
      freq: 659.25,
      gain: 0.08,
      duration: 0.9,
      delay: 0.55,
    });
    playTone(this.bus, {
      type: 'sine',
      freq: 783.99,
      gain: 0.07,
      duration: 0.9,
      delay: 0.55,
    });
  }

  playMissionFailed() {
    void this.resume();
    this.setMusicIntensity('defeat');
    this.playRadio('mayday', 'MAYDAY MAYDAY');
    if (!this.bus) return;
    playTone(this.bus, {
      type: 'sawtooth',
      freq: 220,
      freqEnd: 90,
      gain: 0.16,
      duration: 0.45,
    });
    playTone(this.bus, {
      type: 'triangle',
      freq: 165,
      freqEnd: 70,
      gain: 0.12,
      duration: 0.55,
      delay: 0.08,
    });
    playNoiseBurst(this.bus, 0.3, 0.25, 500, 80);
  }

  playStart() {
    this.setMusicIntensity('patrol');
    this.playUIConfirm();
    this.playRadio('mission-start', 'STRIKE RUN GO');
    if (this.bus) playNoiseBurst(this.bus, 0.25, 0.2, 2000, 400);
  }

  get isFlightActive() {
    return this.flightActive;
  }

  /** Tear down context (rare — prefer stopFlightAmbience between missions). */
  dispose() {
    this.stopFlightAmbience();
    this.unbindLifecycle();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
    this.bus = null;
    this.spatial = null;
    this.disposed = true;
  }

  private bindLifecycle() {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  private unbindLifecycle() {
    if (!this.visibilityBound) return;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.visibilityBound = false;
  }

  private onVisibility = () => {
    if (document.hidden) {
      void this.suspend();
    } else if (this.flightActive) {
      void this.resume();
    }
  };

  private onPageHide = () => {
    void this.suspend();
  };
}

/** Shared singleton for convenience — gameplay may also `new GameAudio()`. */
let shared: GameAudio | null = null;

export function getGameAudio(): GameAudio {
  if (!shared) shared = new GameAudio();
  return shared;
}
