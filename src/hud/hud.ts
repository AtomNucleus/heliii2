/** Neon HUD — flight telemetry, mission status, and combat feedback. */

export type CrosshairState = 'idle' | 'lock' | 'hit' | 'damage';

export interface HudCombatState {
  time: number;
  speed: number;
  altitude: number;
  health: number;
  healthMax: number;
  score: number;
  combo: number;
  multiplier: number;
  targetsLeft: number;
  targetsTotal: number;
  rings: number;
  ringsTotal: number;
  weaponReady: boolean;
}

export interface HUDMissionOptions {
  tag?: string;
  title: string;
  detail?: string;
  progress?: number;
  countLabel?: string;
  hidden?: boolean;
}

export interface CompleteStats {
  title?: string;
  subtitle?: string;
  score?: number | string;
  time: number | string;
  kills?: number | string;
  combo?: number | string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const whole = Math.floor(s);
  const tenth = Math.floor((s - whole) * 10);
  return `${m}:${whole.toString().padStart(2, '0')}.${tenth}`;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function requireEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = el<T>(id);
  if (!node) throw new Error(`HUD missing #${id}`);
  return node;
}

export class HUD {
  private readonly root: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly altEl: HTMLElement;
  private readonly ringsEl: HTMLElement;
  private readonly healthRoot: HTMLElement | null;
  private readonly healthText: HTMLElement | null;
  private readonly healthFill: HTMLElement | null;
  private readonly healthTrack: HTMLElement | null;
  private readonly scoreEl: HTMLElement | null;
  private readonly comboRoot: HTMLElement | null;
  private readonly comboValue: HTMLElement | null;
  private readonly weaponRoot: HTMLElement | null;
  private readonly weaponLabel: HTMLElement | null;
  private readonly missionRoot: HTMLElement | null;
  private readonly missionTag: HTMLElement | null;
  private readonly missionTitle: HTMLElement | null;
  private readonly missionDetail: HTMLElement | null;
  private readonly missionFill: HTMLElement | null;
  private readonly missionCount: HTMLElement | null;
  private readonly missionTrack: HTMLElement | null;
  private readonly toastEl: HTMLElement | null;
  private readonly scorePopup: HTMLElement | null;
  private readonly crosshair: HTMLElement | null;
  private readonly damageFlash: HTMLElement | null;
  private readonly muteBtn: HTMLButtonElement | null;
  private readonly completeOverlay: HTMLElement | null;
  private readonly endTitle: HTMLElement | null;
  private readonly endSubtitle: HTMLElement | null;
  private readonly finalScore: HTMLElement | null;
  private readonly finalTime: HTMLElement | null;
  private readonly finalKills: HTMLElement | null;
  private readonly finalCombo: HTMLElement | null;

  private totalRings: number;
  private toastTimer = 0;
  private lastScore = 0;
  private lastCombo = 0;
  private lastWeaponReady: boolean | null = null;
  private crosshairResetTimer = 0;
  private onMuteToggle: ((muted: boolean) => void) | null = null;
  private muted = false;
  private combatHudEnabled = false;

  /** Optional hook — integration can listen for weapon-ready transitions. */
  onWeaponReadyChange: ((ready: boolean) => void) | null = null;

  constructor(totalRings = 10) {
    this.totalRings = totalRings;
    this.root = requireEl('hud');
    this.timeEl = requireEl('hud-time');
    this.speedEl = requireEl('hud-speed');
    this.altEl = requireEl('hud-altitude');
    this.ringsEl = requireEl('hud-rings');

    this.healthRoot = el('hud-health');
    this.healthText = el('hud-health-text');
    this.healthFill = el('hud-health-fill');
    this.healthTrack = this.healthRoot?.querySelector('[role="progressbar"]') ?? null;
    this.scoreEl = el('hud-score');
    this.comboRoot = el('hud-combo');
    this.comboValue = el('hud-combo-value');
    this.weaponRoot = el('hud-weapon');
    this.weaponLabel = el('hud-weapon-label');
    this.missionRoot = el('hud-mission');
    this.missionTag = this.missionRoot?.querySelector('.hud-mission-tag') ?? null;
    this.missionTitle = el('hud-mission-title');
    this.missionDetail = el('hud-mission-detail');
    this.missionFill = el('hud-mission-fill');
    this.missionCount = el('hud-mission-count');
    this.missionTrack = this.missionRoot?.querySelector('[role="progressbar"]') ?? null;
    this.toastEl = el('hud-toast');
    this.scorePopup = el('hud-score-popup');
    this.crosshair = el('crosshair');
    this.damageFlash = el('damage-flash');
    this.muteBtn = el<HTMLButtonElement>('mute-btn');
    this.completeOverlay = el('complete-overlay');
    this.endTitle = el('end-title');
    this.endSubtitle = el('end-subtitle');
    this.finalScore = el('final-score');
    this.finalTime = el('final-time');
    this.finalKills = el('final-kills');
    this.finalCombo = el('final-combo');

    this.bindMute();
  }

  show() {
    this.root.classList.remove('hidden');
    this.crosshair?.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
    this.crosshair?.classList.add('hidden');
  }

  /** Reveal hull / score / weapon / mission panels for strike-run mode. */
  enableCombatHud(enabled = true) {
    this.combatHudEnabled = enabled;
    this.root.querySelectorAll('.is-combat-only').forEach((node) => {
      node.classList.toggle('is-hidden', !enabled);
    });
    // Combo stays hidden until setCombo sees activity
    if (enabled) this.comboRoot?.classList.remove('is-hidden');
    else this.comboRoot?.classList.remove('is-visible', 'is-fire');
  }

  setTotalRings(total: number) {
    this.totalRings = Math.max(0, total);
  }

  /**
   * Legacy flight telemetry: `update(time, speed, altitude, rings)`
   * Combat telemetry: `update(state: HudCombatState)`
   */
  update(
    timeOrState: number | HudCombatState,
    speed?: number,
    altitude?: number,
    rings?: number,
  ) {
    if (typeof timeOrState === 'object') {
      this.applyCombatState(timeOrState);
      return;
    }
    this.timeEl.textContent = formatTime(timeOrState);
    this.speedEl.textContent = `${Math.round(speed ?? 0)}`;
    this.altEl.textContent = `${Math.round(altitude ?? 0)}`;
    this.ringsEl.textContent = `${rings ?? 0}/${this.totalRings}`;
  }

  /** Explicit combat update for integration agents. */
  updateCombat(state: HudCombatState) {
    this.applyCombatState(state);
  }

  setMission(options: HUDMissionOptions) {
    if (!this.missionRoot) return;
    if (!this.combatHudEnabled) this.enableCombatHud(true);
    if (options.hidden) {
      this.missionRoot.classList.add('is-hidden');
      return;
    }
    this.missionRoot.classList.remove('is-hidden');
    if (options.tag && this.missionTag) this.missionTag.textContent = options.tag;
    if (this.missionTitle) this.missionTitle.textContent = options.title;
    if (options.detail != null && this.missionDetail) {
      this.missionDetail.textContent = options.detail;
    }
    if (options.progress != null && this.missionFill) {
      const p = Math.max(0, Math.min(1, options.progress));
      this.missionFill.style.transform = `scaleX(${p})`;
      if (this.missionTrack) {
        this.missionTrack.setAttribute('aria-valuenow', `${Math.round(p * 100)}`);
      }
    }
    if (options.countLabel != null && this.missionCount) {
      this.missionCount.textContent = options.countLabel;
    }
  }

  setWeaponReady(ready: boolean, label?: string) {
    if (!this.weaponRoot) return;
    this.weaponRoot.dataset.ready = ready ? 'true' : 'false';
    if (this.weaponLabel) {
      this.weaponLabel.textContent = label ?? (ready ? 'ROCKETS READY' : 'RELOADING…');
    }
    if (this.lastWeaponReady !== null && this.lastWeaponReady !== ready) {
      this.onWeaponReadyChange?.(ready);
    }
    this.lastWeaponReady = ready;
  }

  setHealth(health: number, healthMax = 100) {
    if (!this.healthRoot || !this.healthFill || !this.healthText) return;
    const max = Math.max(1, healthMax);
    const ratio = Math.max(0, Math.min(1, health / max));
    this.healthText.textContent = `${Math.ceil(health)}`;
    this.healthFill.style.transform = `scaleX(${ratio})`;
    const level = ratio <= 0.3 ? 'critical' : ratio <= 0.55 ? 'warn' : 'ok';
    this.healthRoot.dataset.level = level;
    if (this.healthTrack) {
      this.healthTrack.setAttribute('aria-valuenow', `${Math.round(ratio * 100)}`);
      this.healthTrack.setAttribute('aria-valuemax', '100');
    }
  }

  setScore(score: number) {
    if (!this.scoreEl) return;
    if (score !== this.lastScore) {
      if (score > this.lastScore) {
        this.scoreEl.classList.remove('is-bump');
        void this.scoreEl.offsetWidth;
        this.scoreEl.classList.add('is-bump');
        this.flashScorePopup(score - this.lastScore);
      }
      this.lastScore = score;
    }
    this.scoreEl.textContent = `${score}`;
  }

  setCombo(combo: number, multiplier = 1) {
    if (!this.comboRoot || !this.comboValue) return;
    if (combo > 0) {
      this.comboRoot.classList.remove('is-hidden');
      this.comboRoot.classList.add('is-visible');
      this.comboValue.textContent = `x${multiplier}`;
      if (combo > this.lastCombo) {
        this.comboRoot.classList.remove('is-fire');
        void this.comboRoot.offsetWidth;
        this.comboRoot.classList.add('is-fire');
      }
    } else {
      this.comboRoot.classList.remove('is-visible', 'is-fire');
      if (this.combatHudEnabled) {
        // keep in layout but invisible via opacity when combat hud on
        this.comboRoot.classList.remove('is-hidden');
      }
    }
    this.lastCombo = combo;
  }

  setCrosshairState(state: CrosshairState, autoResetMs = 0) {
    if (!this.crosshair) return;
    this.crosshair.dataset.state = state;
    if (this.crosshairResetTimer) {
      window.clearTimeout(this.crosshairResetTimer);
      this.crosshairResetTimer = 0;
    }
    if (autoResetMs > 0 && state !== 'idle') {
      this.crosshairResetTimer = window.setTimeout(() => {
        this.crosshair!.dataset.state = 'idle';
        this.crosshairResetTimer = 0;
      }, autoResetMs);
    }
  }

  /** Legacy + combat: intensity scales flash strength via CSS class. */
  flashDamage(intensity = 1) {
    if (this.damageFlash) {
      const strong = intensity >= 0.65;
      this.damageFlash.classList.remove('is-active', 'is-strong');
      void this.damageFlash.offsetWidth;
      this.damageFlash.classList.add('is-active');
      if (strong) this.damageFlash.classList.add('is-strong');
      window.setTimeout(() => {
        this.damageFlash?.classList.remove('is-active', 'is-strong');
      }, 320);
    }
    this.setCrosshairState('damage', 320);
  }

  /** Ring-collect pulse used by the current main loop. */
  pulseRingCollect() {
    this.ringsEl.classList.remove('is-pulse');
    void this.ringsEl.offsetWidth;
    this.ringsEl.classList.add('is-pulse');
    this.setCrosshairState('hit', 220);
    this.toast('RING SECURED', 1.1);
  }

  toast(message: string, duration = 1.6) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('is-visible');
    this.toastTimer = duration;
  }

  tick(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastEl?.classList.remove('is-visible');
      }
    }
  }

  /** Fill the complete overlay and reveal it. */
  showComplete(stats: CompleteStats) {
    if (this.endTitle && stats.title) this.endTitle.textContent = stats.title;
    if (this.endSubtitle && stats.subtitle) this.endSubtitle.textContent = stats.subtitle;
    if (this.finalScore && stats.score != null) this.finalScore.textContent = `${stats.score}`;
    if (this.finalTime) {
      this.finalTime.textContent =
        typeof stats.time === 'number' ? formatTime(stats.time) : stats.time;
    }
    if (this.finalKills && stats.kills != null) this.finalKills.textContent = `${stats.kills}`;
    if (this.finalCombo && stats.combo != null) this.finalCombo.textContent = `${stats.combo}`;
    this.completeOverlay?.classList.remove('hidden');
  }

  hideComplete() {
    this.completeOverlay?.classList.add('hidden');
  }

  /** Wire mute button / M key callback (audio module). */
  bindMuteHandler(handler: (muted: boolean) => void) {
    this.onMuteToggle = handler;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.muteBtn) {
      this.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      this.muteBtn.classList.toggle('is-muted', muted);
      this.muteBtn.textContent = muted ? 'MUTE' : 'AUD';
      this.muteBtn.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  resetVisuals() {
    this.lastScore = 0;
    this.lastCombo = 0;
    this.lastWeaponReady = null;
    this.toastTimer = 0;
    this.toastEl?.classList.remove('is-visible');
    this.scorePopup?.classList.remove('is-visible');
    this.ringsEl.classList.remove('is-pulse');
    this.setCrosshairState('idle');
    this.damageFlash?.classList.remove('is-active', 'is-strong');
    this.comboRoot?.classList.remove('is-visible', 'is-fire');
    this.setHealth(100, 100);
    this.setWeaponReady(true);
    if (this.scoreEl) this.scoreEl.textContent = '0';
  }

  formatTime(seconds: number): string {
    return formatTime(seconds);
  }

  private applyCombatState(state: HudCombatState) {
    if (!this.combatHudEnabled) this.enableCombatHud(true);
    this.totalRings = state.ringsTotal;
    this.timeEl.textContent = formatTime(state.time);
    this.speedEl.textContent = `${Math.round(state.speed)}`;
    this.altEl.textContent = `${Math.round(state.altitude)}`;
    this.ringsEl.textContent = `${state.rings}/${state.ringsTotal}`;

    this.setHealth(state.health, state.healthMax);
    this.setScore(state.score);
    this.setCombo(state.combo, state.multiplier);
    this.setWeaponReady(state.weaponReady);

    const destroyed = Math.max(0, state.targetsTotal - state.targetsLeft);
    const progress = state.targetsTotal > 0 ? destroyed / state.targetsTotal : 0;
    this.setMission({
      title: state.targetsLeft <= 0 ? 'ALL TARGETS DOWN' : 'DESTROY SUPPLY DEPOTS',
      detail:
        state.targetsLeft <= 0
          ? 'Strike complete'
          : `${state.targetsLeft} primary · ${state.rings} rings · ${
              state.combo > 0 ? `combo ${state.combo}` : 'build combo'
            }`,
      progress,
      countLabel: `${state.targetsLeft} LEFT`,
      hidden: false,
    });
  }

  private flashScorePopup(delta: number) {
    if (!this.scorePopup || delta <= 0) return;
    this.scorePopup.textContent = `+${delta}`;
    this.scorePopup.classList.remove('is-visible');
    void this.scorePopup.offsetWidth;
    this.scorePopup.classList.add('is-visible');
  }

  private bindMute() {
    this.muteBtn?.addEventListener('click', () => {
      this.setMuted(!this.muted);
      this.onMuteToggle?.(this.muted);
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyM' || event.repeat) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.setMuted(!this.muted);
      this.onMuteToggle?.(this.muted);
    });
  }
}
