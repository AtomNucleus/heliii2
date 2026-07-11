import type { InputState } from '../helicopter/controller';

/** Touch payload — extends baseline InputState with optional analog / boost. */
export type TouchInputPayload = Partial<InputState> & {
  boost?: boolean;
  /** -1 left … +1 right */
  steerX?: number;
  /** -1 back … +1 forward */
  steerY?: number;
};

type InputSetter = (input: TouchInputPayload) => void;

export interface MobileControlsOptions {
  setInput: InputSetter;
  clearInput: () => void;
  onRestart: () => void;
  /** Optional fire hold callback for combat integration. */
  onFireChange?: (held: boolean) => void;
  /** Optional UI click feedback (audio). */
  onUiTap?: () => void;
}

const MOBILE_VIEWPORT_QUERY = '(max-width: 900px)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';

type ActionKey = 'up' | 'down' | 'boost';

export class MobileControls {
  private readonly root: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly restartButton: HTMLElement;
  private readonly actionButtons: HTMLButtonElement[];
  private readonly fireButton: HTMLButtonElement | null;
  private readonly mobileViewportQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  private readonly coarsePointerQuery = window.matchMedia(COARSE_POINTER_QUERY);
  private readonly activeActionPointers = new Map<number, ActionKey>();
  private readonly activeFirePointers = new Set<number>();
  private readonly setInput: InputSetter;
  private readonly clearInput: () => void;
  private readonly onRestart: () => void;
  private readonly onFireChange: ((held: boolean) => void) | null;
  private readonly onUiTap: (() => void) | null;

  private activeStickPointerId: number | null = null;
  private playing = false;

  constructor({ setInput, clearInput, onRestart, onFireChange, onUiTap }: MobileControlsOptions) {
    this.setInput = setInput;
    this.clearInput = clearInput;
    this.onRestart = onRestart;
    this.onFireChange = onFireChange ?? null;
    this.onUiTap = onUiTap ?? null;

    this.root = document.getElementById('mobile-controls')!;
    this.stick = document.getElementById('mobile-stick')!;
    this.restartButton = document.getElementById('mobile-restart')!;
    this.actionButtons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('[data-mobile-input]'),
    );
    this.fireButton = document.getElementById('mobile-fire') as HTMLButtonElement | null;

    this.bindEvents();
    this.updateVisibility();
  }

  show() {
    this.playing = true;
    this.updateVisibility();
  }

  hide() {
    this.playing = false;
    this.releaseAllInputs();
    this.updateVisibility();
  }

  private bindEvents() {
    const onViewportChange = () => this.updateVisibility();
    this.mobileViewportQuery.addEventListener('change', onViewportChange);
    this.coarsePointerQuery.addEventListener('change', onViewportChange);
    if ('addListener' in this.mobileViewportQuery) {
      (this.mobileViewportQuery as MediaQueryList).addListener(onViewportChange);
      (this.coarsePointerQuery as MediaQueryList).addListener(onViewportChange);
    }
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);

    this.root.addEventListener('touchstart', this.preventTouchDefault, { passive: false });
    this.root.addEventListener('touchmove', this.preventTouchDefault, { passive: false });
    this.root.addEventListener('contextmenu', (event) => event.preventDefault());

    this.stick.addEventListener('pointerdown', this.handleStickPointerDown);
    this.stick.addEventListener('pointermove', this.handleStickPointerMove);
    this.stick.addEventListener('pointerup', this.handleStickPointerEnd);
    this.stick.addEventListener('pointercancel', this.handleStickPointerEnd);
    this.stick.addEventListener('lostpointercapture', this.handleStickPointerEnd);

    for (const button of this.actionButtons) {
      button.addEventListener('pointerdown', this.handleActionPointerDown);
      button.addEventListener('pointerup', this.handleActionPointerEnd);
      button.addEventListener('pointercancel', this.handleActionPointerEnd);
      button.addEventListener('lostpointercapture', this.handleActionPointerEnd);
    }

    if (this.fireButton) {
      this.fireButton.addEventListener('pointerdown', this.handleFirePointerDown);
      this.fireButton.addEventListener('pointerup', this.handleFirePointerEnd);
      this.fireButton.addEventListener('pointercancel', this.handleFirePointerEnd);
      this.fireButton.addEventListener('lostpointercapture', this.handleFirePointerEnd);
    }

    this.restartButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (!this.isVisible()) return;
      this.onUiTap?.();
      this.onRestart();
    });
  }

  private updateVisibility() {
    const shouldShow = this.playing && this.supportsTouchControls();
    this.root.classList.toggle('hidden', !shouldShow);
    this.root.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    if (!shouldShow) this.releaseAllInputs();
  }

  private supportsTouchControls(): boolean {
    const hasTouchPoints =
      typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
    const narrowViewport = window.innerWidth <= 900;
    return (
      this.coarsePointerQuery.matches
      || this.mobileViewportQuery.matches
      || hasTouchPoints
      || narrowViewport
    );
  }

  private isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private readonly preventTouchDefault = (event: TouchEvent) => {
    event.preventDefault();
  };

  private readonly handleStickPointerDown = (event: PointerEvent) => {
    if (!this.isVisible()) return;
    event.preventDefault();
    this.activeStickPointerId = event.pointerId;
    this.capturePointer(this.stick, event.pointerId);
    this.updateStickInput(event);
  };

  private readonly handleStickPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.activeStickPointerId) return;
    event.preventDefault();
    this.updateStickInput(event);
  };

  private readonly handleStickPointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== this.activeStickPointerId) return;
    event.preventDefault();
    this.activeStickPointerId = null;
    this.resetStick();
  };

  private readonly handleActionPointerDown = (event: PointerEvent) => {
    if (!this.isVisible()) return;
    event.preventDefault();

    const button = event.currentTarget as HTMLButtonElement;
    const inputKey = button.dataset.mobileInput as ActionKey | undefined;
    if (inputKey !== 'up' && inputKey !== 'down' && inputKey !== 'boost') return;

    this.activeActionPointers.set(event.pointerId, inputKey);
    this.capturePointer(button, event.pointerId);
    this.applyActionInputs();
  };

  private readonly handleActionPointerEnd = (event: PointerEvent) => {
    if (!this.activeActionPointers.has(event.pointerId)) return;
    event.preventDefault();
    this.activeActionPointers.delete(event.pointerId);
    this.applyActionInputs();
  };

  private readonly handleFirePointerDown = (event: PointerEvent) => {
    if (!this.isVisible() || !this.fireButton) return;
    event.preventDefault();
    this.activeFirePointers.add(event.pointerId);
    this.capturePointer(this.fireButton, event.pointerId);
    this.fireButton.classList.add('is-active');
    this.onUiTap?.();
    this.onFireChange?.(true);
  };

  private readonly handleFirePointerEnd = (event: PointerEvent) => {
    if (!this.activeFirePointers.has(event.pointerId)) return;
    event.preventDefault();
    this.activeFirePointers.delete(event.pointerId);
    const held = this.activeFirePointers.size > 0;
    this.fireButton?.classList.toggle('is-active', held);
    this.onFireChange?.(held);
  };

  private updateStickInput(event: PointerEvent) {
    const rect = this.stick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const maxDistance = rect.width * 0.36;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxDistance ? maxDistance / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    const threshold = rect.width * 0.12;
    const normX = Math.max(-1, Math.min(1, rawX / maxDistance));
    const normY = Math.max(-1, Math.min(1, -rawY / maxDistance));

    this.stick.style.setProperty('--stick-x', `${x}px`);
    this.stick.style.setProperty('--stick-y', `${y}px`);
    this.setInput({
      forward: rawY < -threshold,
      back: rawY > threshold,
      left: rawX < -threshold,
      right: rawX > threshold,
      steerX: Math.abs(normX) > 0.12 ? normX : 0,
      steerY: Math.abs(normY) > 0.12 ? normY : 0,
    });
  }

  private resetStick() {
    this.stick.style.setProperty('--stick-x', '0px');
    this.stick.style.setProperty('--stick-y', '0px');
    this.setInput({
      forward: false,
      back: false,
      left: false,
      right: false,
      steerX: 0,
      steerY: 0,
    });
  }

  private applyActionInputs() {
    let up = false;
    let down = false;
    let boost = false;

    for (const input of this.activeActionPointers.values()) {
      up ||= input === 'up';
      down ||= input === 'down';
      boost ||= input === 'boost';
    }

    this.setInput({ up, down, boost });

    for (const button of this.actionButtons) {
      const key = button.dataset.mobileInput;
      const active =
        key === 'up' ? up : key === 'down' ? down : key === 'boost' ? boost : false;
      button.classList.toggle('is-active', active);
    }
  }

  private releaseAllInputs() {
    this.activeStickPointerId = null;
    this.activeActionPointers.clear();
    this.activeFirePointers.clear();
    this.resetStick();
    this.applyActionInputs();
    this.fireButton?.classList.remove('is-active');
    this.onFireChange?.(false);
    this.clearInput();
  }

  private capturePointer(element: HTMLElement, pointerId: number) {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Pointer may already be released on some mobile browsers.
    }
  }
}
