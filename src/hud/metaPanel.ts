/**
 * Hangar / settings / pause panel — keyboard accessible, ARIA labeled.
 * Available before play and from pause; does not auto-open mid-flight.
 */

import {
  getProfile,
  getDailyChallenge,
  updateSettings,
  setEquippedSkin,
  setEquippedLoadout,
  SKIN_DEFS,
  LOADOUT_DEFS,
  type SkinId,
  type LoadoutId,
  type SettingsState,
  type QualityPreference,
  type ReducedMotionPreference,
} from '../profile';

export type MetaPanelMode = 'closed' | 'hangar' | 'settings' | 'pause';

export interface MetaPanelHandlers {
  onSettingsChanged: (settings: SettingsState) => void;
  onCosmeticsChanged: (skin: SkinId, loadout: LoadoutId) => void;
  onPauseChange: (paused: boolean) => void;
  /** Called when player requests resume from pause panel. */
  onResume?: () => void;
  playSelect?: () => void;
}

function qs<T extends HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector(sel) as T | null;
}

export class MetaPanel {
  private readonly root: HTMLElement;
  private readonly hangar: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly dailyEls: HTMLElement[];
  private mode: MetaPanelMode = 'closed';
  private lastFocus: HTMLElement | null = null;
  private readonly handlers: MetaPanelHandlers;

  constructor(handlers: MetaPanelHandlers) {
    this.handlers = handlers;
    this.root = document.getElementById('meta-root')!;
    this.hangar = document.getElementById('hangar-panel')!;
    this.settings = document.getElementById('settings-panel')!;
    this.pause = document.getElementById('pause-panel')!;
    this.dailyEls = [
      ...document.querySelectorAll<HTMLElement>('[data-daily-id]'),
    ];

    this.bindChrome();
    this.refresh();
  }

  get currentMode(): MetaPanelMode {
    return this.mode;
  }

  get isOpen(): boolean {
    return this.mode !== 'closed';
  }

  refresh() {
    const profile = getProfile();
    const daily = getDailyChallenge();
    for (const el of this.dailyEls) {
      el.textContent = `${daily.id} · ${daily.label}`;
      el.title = daily.description;
    }
    const dailyDesc = document.getElementById('daily-challenge-desc');
    if (dailyDesc) dailyDesc.textContent = daily.description;

    const best = document.getElementById('profile-best-score');
    if (best) best.textContent = String(profile.progression.bestScore);
    const grade = document.getElementById('profile-best-grade');
    if (grade) grade.textContent = profile.progression.bestGrade || '—';
    const runs = document.getElementById('profile-runs');
    if (runs) {
      runs.textContent = `${profile.progression.completedRuns}/${profile.progression.totalRuns}`;
    }

    this.renderSkins();
    this.renderLoadouts();
    this.syncSettingsControls(profile.settings);
    this.renderPhaseList();
  }

  openHangar() {
    this.open('hangar');
  }

  openSettings() {
    this.open('settings');
  }

  openPause() {
    this.open('pause');
    this.handlers.onPauseChange(true);
  }

  close() {
    const wasPause = this.mode === 'pause';
    this.mode = 'closed';
    this.hangar.hidden = true;
    this.settings.hidden = true;
    this.pause.hidden = true;
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.setAttribute('data-mode', 'closed');
    this.root.removeAttribute('data-from-pause');
    if (wasPause) {
      this.handlers.onPauseChange(false);
      this.handlers.onResume?.();
    }
    this.restoreFocus();
  }

  /** Toggle pause only when playing is allowed by caller. */
  togglePause() {
    if (this.mode === 'pause') this.close();
    else this.openPause();
  }

  private open(mode: Exclude<MetaPanelMode, 'closed'>) {
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.mode = mode;
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.root.setAttribute('data-mode', mode);
    this.hangar.hidden = mode !== 'hangar';
    this.settings.hidden = mode !== 'settings';
    this.pause.hidden = mode !== 'pause';
    this.refresh();

    const focusTarget =
      mode === 'hangar'
        ? qs<HTMLElement>(this.hangar, 'button, [href], input, select')
        : mode === 'settings'
          ? qs<HTMLElement>(this.settings, 'button, [href], input, select')
          : qs<HTMLElement>(this.pause, 'button, [href], input, select');
    focusTarget?.focus();
  }

  private restoreFocus() {
    if (this.lastFocus && typeof this.lastFocus.focus === 'function') {
      try {
        this.lastFocus.focus();
      } catch {
        /* ignore */
      }
    }
  }

  private bindChrome() {
    document.getElementById('open-hangar-btn')?.addEventListener('click', () => {
      this.handlers.playSelect?.();
      this.openHangar();
    });
    document.getElementById('open-settings-btn')?.addEventListener('click', () => {
      this.handlers.playSelect?.();
      this.openSettings();
    });
    document.getElementById('pause-settings-btn')?.addEventListener('click', () => {
      this.handlers.playSelect?.();
      this.open('settings');
      this.handlers.onPauseChange(true);
    });
    document.getElementById('pause-resume-btn')?.addEventListener('click', () => {
      this.handlers.playSelect?.();
      this.close();
    });

    for (const id of ['hangar-close-btn', 'settings-close-btn']) {
      document.getElementById(id)?.addEventListener('click', () => {
        try {
          this.handlers.playSelect?.();
        } catch {
          /* ignore UI audio failures */
        }
        // Closing settings opened from pause returns to pause
        if (id === 'settings-close-btn' && this.root.getAttribute('data-from-pause') === '1') {
          this.root.removeAttribute('data-from-pause');
          this.openPause();
          return;
        }
        this.mode = 'closed';
        this.hangar.hidden = true;
        this.settings.hidden = true;
        this.pause.hidden = true;
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        this.root.setAttribute('data-mode', 'closed');
        this.restoreFocus();
      });
    }

    document.getElementById('pause-settings-btn')?.addEventListener('click', () => {
      this.root.setAttribute('data-from-pause', '1');
    });

    this.settings.addEventListener('change', (e) => this.onSettingsEvent(e));
    this.settings.addEventListener('input', (e) => this.onSettingsEvent(e));

    // Focus trap lite: Tab cycles within open panel
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || this.mode === 'closed') return;
      const panel =
        this.mode === 'hangar'
          ? this.hangar
          : this.mode === 'settings'
            ? this.settings
            : this.pause;
      const focusables = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hidden && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  private onSettingsEvent(e: Event) {
    const t = e.target as HTMLInputElement | HTMLSelectElement | null;
    if (!t || !t.name) return;
    const patch: Partial<SettingsState> = {};
    switch (t.name) {
      case 'steeringSensitivity':
        patch.steeringSensitivity = Number(t.value);
        break;
      case 'masterVolume':
        patch.masterVolume = Number(t.value);
        break;
      case 'muted':
        patch.muted = (t as HTMLInputElement).checked;
        break;
      case 'quality':
        patch.quality = t.value as QualityPreference;
        break;
      case 'reducedMotion':
        patch.reducedMotion = t.value as ReducedMotionPreference;
        break;
      case 'highContrast':
        patch.highContrast = (t as HTMLInputElement).checked;
        break;
      case 'captions':
        patch.captions = (t as HTMLInputElement).checked;
        break;
      default:
        return;
    }
    const settings = updateSettings(patch);
    this.handlers.onSettingsChanged(settings);
    this.syncSettingsControls(settings);
  }

  private syncSettingsControls(settings: SettingsState) {
    const setVal = (name: string, value: string | number | boolean) => {
      const el = this.settings.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${name}"]`,
      );
      if (!el) return;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = Boolean(value);
      } else {
        el.value = String(value);
      }
    };
    setVal('steeringSensitivity', settings.steeringSensitivity);
    setVal('masterVolume', settings.masterVolume);
    setVal('muted', settings.muted);
    setVal('quality', settings.quality);
    setVal('reducedMotion', settings.reducedMotion);
    setVal('highContrast', settings.highContrast);
    setVal('captions', settings.captions);

    const sensLabel = document.getElementById('sensitivity-value');
    if (sensLabel) sensLabel.textContent = settings.steeringSensitivity.toFixed(2);
    const volLabel = document.getElementById('volume-value');
    if (volLabel) volLabel.textContent = `${Math.round(settings.masterVolume * 100)}%`;
  }

  private renderSkins() {
    const host = document.getElementById('skin-list');
    if (!host) return;
    const prog = getProfile().progression;
    host.innerHTML = '';
    for (const def of SKIN_DEFS) {
      const unlocked = prog.unlockedSkins.includes(def.id);
      const equipped = prog.equippedSkin === def.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'meta-choice';
      btn.dataset.skin = def.id;
      btn.disabled = !unlocked;
      btn.setAttribute('aria-pressed', equipped ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        `${def.name}${equipped ? ', equipped' : unlocked ? ', unlocked' : ', locked'}`,
      );
      btn.innerHTML = `<span class="meta-choice-name">${def.name}</span>
        <span class="meta-choice-state">${equipped ? 'EQUIPPED' : unlocked ? 'UNLOCKED' : 'LOCKED'}</span>
        <span class="meta-choice-blurb">${unlocked ? def.blurb : def.unlockHint}</span>`;
      btn.addEventListener('click', () => {
        if (!unlocked) return;
        this.handlers.playSelect?.();
        if (setEquippedSkin(def.id as SkinId)) {
          this.handlers.onCosmeticsChanged(
            getProfile().progression.equippedSkin,
            getProfile().progression.equippedLoadout,
          );
          this.renderSkins();
        }
      });
      host.appendChild(btn);
    }
  }

  private renderLoadouts() {
    const host = document.getElementById('loadout-list');
    if (!host) return;
    const prog = getProfile().progression;
    host.innerHTML = '';
    for (const def of LOADOUT_DEFS) {
      const unlocked = prog.unlockedLoadouts.includes(def.id);
      const equipped = prog.equippedLoadout === def.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'meta-choice';
      btn.dataset.loadout = def.id;
      btn.disabled = !unlocked;
      btn.setAttribute('aria-pressed', equipped ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        `${def.name}${equipped ? ', equipped' : unlocked ? ', unlocked' : ', locked'}`,
      );
      btn.innerHTML = `<span class="meta-choice-name">${def.name}</span>
        <span class="meta-choice-state">${equipped ? 'EQUIPPED' : unlocked ? 'UNLOCKED' : 'LOCKED'}</span>
        <span class="meta-choice-blurb">${unlocked ? def.blurb : def.unlockHint}</span>`;
      btn.addEventListener('click', () => {
        if (!unlocked) return;
        this.handlers.playSelect?.();
        if (setEquippedLoadout(def.id as LoadoutId)) {
          this.handlers.onCosmeticsChanged(
            getProfile().progression.equippedSkin,
            getProfile().progression.equippedLoadout,
          );
          this.renderLoadouts();
        }
      });
      host.appendChild(btn);
    }
  }

  private renderPhaseList() {
    const host = document.getElementById('phase-progress-list');
    if (!host) return;
    const prog = getProfile().progression;
    host.innerHTML = '';
    for (const [id, slot] of Object.entries(prog.phases)) {
      const li = document.createElement('li');
      li.className = slot.completed ? 'is-done' : 'is-locked';
      li.innerHTML = `<span class="phase-id">${id}</span>
        <span class="phase-state">${slot.completed ? slot.label ?? 'Cleared' : 'Not cleared'}</span>
        <span class="phase-count">${slot.completions}×</span>`;
      host.appendChild(li);
    }
  }
}
