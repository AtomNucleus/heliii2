import { clamp, type FlightInput } from './flight';

export type FlightAction = 'pause' | 'restart' | 'mute' | 'camera';
const bindings: Record<string, FlightAction> = {
  Escape: 'pause',
  KeyP: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
  KeyC: 'camera',
};
const movement = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
]);
export const deadzone = (value: number) =>
  Math.abs(value) < 0.14 ? 0 : (Math.sign(value) * (Math.abs(value) - 0.14)) / 0.86;

export class Controls {
  private keys = new Set<string>();
  private touch = { forward: 0, turn: 0, lift: 0, boost: false };
  private padInput: FlightInput = { forward: 0, turn: 0, lift: 0, boost: false };
  private previousButtons = new Set<number>();
  private enabled = false;
  constructor(private action: (action: FlightAction) => void) {
    window.addEventListener('keydown', (event) => {
      if (
        (event.target as HTMLElement)?.matches('input, select, textarea') ||
        event.altKey ||
        event.metaKey
      )
        return;
      if (document.querySelector('dialog[open]')) {
        if (event.code === 'KeyM') this.action('mute');
        return;
      }
      if (bindings[event.code] && !event.repeat) {
        event.preventDefault();
        this.action(bindings[event.code]);
      }
      if (this.enabled && movement.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    this.bindPad('steer-pad', (x, y) => {
      this.touch.turn = x;
      this.touch.forward = -y;
    });
    this.bindPad('lift-pad', (_x, y) => {
      this.touch.lift = -y;
    });
    const boost = document.getElementById('touch-boost')!;
    boost.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      boost.setPointerCapture(event.pointerId);
      this.touch.boost = true;
      boost.classList.add('active');
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      boost.addEventListener(name, () => {
        this.touch.boost = false;
        boost.classList.remove('active');
      });
    document.getElementById('touch-camera')!.addEventListener('click', () => this.action('camera'));
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.clear();
  }
  clear() {
    this.keys.clear();
    this.touch = { forward: 0, turn: 0, lift: 0, boost: false };
    this.padInput = { forward: 0, turn: 0, lift: 0, boost: false };
    document
      .querySelectorAll<HTMLElement>('.touch-pad i')
      .forEach((knob) => (knob.style.transform = ''));
    document.getElementById('touch-boost')!.classList.remove('active');
  }
  private bindPad(id: string, change: (x: number, y: number) => void) {
    const pad = document.getElementById(id)!,
      knob = pad.querySelector<HTMLElement>('i')!;
    let pointer: number | null = null;
    const update = (event: PointerEvent) => {
      const rect = pad.getBoundingClientRect();
      const radius = rect.width * 0.33;
      let x = (event.clientX - rect.left - rect.width / 2) / radius,
        y = (event.clientY - rect.top - rect.height / 2) / radius;
      const length = Math.max(1, Math.hypot(x, y));
      x /= length;
      y /= length;
      knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
      change(deadzone(x), deadzone(y));
    };
    pad.addEventListener('pointerdown', (event) => {
      if (!this.enabled || pointer !== null) return;
      event.preventDefault();
      pointer = event.pointerId;
      pad.setPointerCapture(pointer);
      update(event);
    });
    pad.addEventListener('pointermove', (event) => {
      if (event.pointerId === pointer && this.enabled) update(event);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      knob.style.transform = '';
      change(0, 0);
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    pad.addEventListener('lostpointercapture', release);
  }
  pollGamepad() {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(
      (p) => p?.connected && p.mapping === 'standard',
    );
    if (!pad) {
      this.previousButtons.clear();
      this.padInput = { forward: 0, turn: 0, lift: 0, boost: false };
      return;
    }
    const pressed = new Set(pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
    for (const [button, action] of [
      [9, 'pause'],
      [3, 'camera'],
    ] as const)
      if (pressed.has(button) && !this.previousButtons.has(button)) this.action(action);
    this.previousButtons = pressed;
    this.padInput = {
      forward: -deadzone(pad.axes[1] ?? 0),
      turn: deadzone(pad.axes[0] ?? 0),
      lift: -deadzone(pad.axes[3] ?? 0),
      boost: (pad.buttons[7]?.value ?? 0) > 0.3,
    };
  }
  read(): FlightInput {
    if (!this.enabled) return { forward: 0, turn: 0, lift: 0, boost: false };
    const any = (...codes: string[]) => (codes.some((code) => this.keys.has(code)) ? 1 : 0);
    return {
      forward: clamp(
        any('KeyW', 'ArrowUp') -
          any('KeyS', 'ArrowDown') +
          this.touch.forward +
          this.padInput.forward,
        -1,
        1,
      ),
      turn: clamp(
        any('KeyD', 'ArrowRight') - any('KeyA', 'ArrowLeft') + this.touch.turn + this.padInput.turn,
        -1,
        1,
      ),
      lift: clamp(
        any('Space') - any('ControlLeft', 'ControlRight') + this.touch.lift + this.padInput.lift,
        -1,
        1,
      ),
      boost: !!any('ShiftLeft', 'ShiftRight') || this.touch.boost || this.padInput.boost,
    };
  }
}
