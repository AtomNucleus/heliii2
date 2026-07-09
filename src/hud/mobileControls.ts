import type { InputState } from '../helicopter/controller';

type InputSetter = (input: Partial<InputState>) => void;

interface MobileControlsOptions {
  setInput: InputSetter;
  clearInput: () => void;
  onRestart: () => void;
}

const MOBILE_VIEWPORT_QUERY = '(max-width: 900px)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';

export class MobileControls {
  private readonly root: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly restartButton: HTMLElement;
  private readonly altitudeButtons: HTMLButtonElement[];
  private readonly mobileViewportQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  private readonly coarsePointerQuery = window.matchMedia(COARSE_POINTER_QUERY);
  private readonly activeAltitudePointers = new Map<number, keyof InputState>();
  private readonly setInput: InputSetter;
  private readonly clearInput: () => void;
  private readonly onRestart: () => void;

  private activeStickPointerId: number | null = null;
  private playing = false;

  constructor({ setInput, clearInput, onRestart }: MobileControlsOptions) {
    this.setInput = setInput;
    this.clearInput = clearInput;
    this.onRestart = onRestart;

    this.root = document.getElementById('mobile-controls')!;
    this.stick = document.getElementById('mobile-stick')!;
    this.restartButton = document.getElementById('mobile-restart')!;
    this.altitudeButtons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('[data-mobile-input]'),
    );

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
    this.mobileViewportQuery.addEventListener('change', () => this.updateVisibility());
    this.coarsePointerQuery.addEventListener('change', () => this.updateVisibility());
    window.addEventListener('resize', () => this.updateVisibility());

    this.root.addEventListener('touchstart', this.preventTouchDefault, { passive: false });
    this.root.addEventListener('touchmove', this.preventTouchDefault, { passive: false });
    this.root.addEventListener('contextmenu', (event) => event.preventDefault());

    this.stick.addEventListener('pointerdown', this.handleStickPointerDown);
    this.stick.addEventListener('pointermove', this.handleStickPointerMove);
    this.stick.addEventListener('pointerup', this.handleStickPointerEnd);
    this.stick.addEventListener('pointercancel', this.handleStickPointerEnd);
    this.stick.addEventListener('lostpointercapture', this.handleStickPointerEnd);

    for (const button of this.altitudeButtons) {
      button.addEventListener('pointerdown', this.handleAltitudePointerDown);
      button.addEventListener('pointerup', this.handleAltitudePointerEnd);
      button.addEventListener('pointercancel', this.handleAltitudePointerEnd);
      button.addEventListener('lostpointercapture', this.handleAltitudePointerEnd);
    }

    this.restartButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.isVisible()) {
        this.onRestart();
      }
    });
  }

  private updateVisibility() {
    const shouldShow = this.playing && this.supportsTouchControls();
    this.root.classList.toggle('hidden', !shouldShow);
    this.root.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');

    if (!shouldShow) {
      this.releaseAllInputs();
    }
  }

  private supportsTouchControls(): boolean {
    return (
      this.coarsePointerQuery.matches
      || this.mobileViewportQuery.matches
      || navigator.maxTouchPoints > 0
      || 'ontouchstart' in window
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

  private readonly handleAltitudePointerDown = (event: PointerEvent) => {
    if (!this.isVisible()) return;
    event.preventDefault();

    const button = event.currentTarget as HTMLButtonElement;
    const inputKey = button.dataset.mobileInput as keyof InputState | undefined;
    if (inputKey !== 'up' && inputKey !== 'down') return;

    this.activeAltitudePointers.set(event.pointerId, inputKey);
    this.capturePointer(button, event.pointerId);
    this.applyAltitudeInputs();
  };

  private readonly handleAltitudePointerEnd = (event: PointerEvent) => {
    if (!this.activeAltitudePointers.has(event.pointerId)) return;
    event.preventDefault();
    this.activeAltitudePointers.delete(event.pointerId);
    this.applyAltitudeInputs();
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

    this.stick.style.setProperty('--stick-x', `${x}px`);
    this.stick.style.setProperty('--stick-y', `${y}px`);
    this.setInput({
      forward: rawY < -threshold,
      back: rawY > threshold,
      left: rawX < -threshold,
      right: rawX > threshold,
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
    });
  }

  private applyAltitudeInputs() {
    let up = false;
    let down = false;

    for (const input of this.activeAltitudePointers.values()) {
      up ||= input === 'up';
      down ||= input === 'down';
    }

    this.setInput({ up, down });

    for (const button of this.altitudeButtons) {
      const inputKey = button.dataset.mobileInput;
      button.classList.toggle('is-active', inputKey === 'up' ? up : down);
    }
  }

  private releaseAllInputs() {
    this.activeStickPointerId = null;
    this.activeAltitudePointers.clear();
    this.resetStick();
    this.applyAltitudeInputs();
    this.clearInput();
  }

  private capturePointer(element: HTMLElement, pointerId: number) {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // The pointer may already be released on some mobile browsers.
    }
  }
}
