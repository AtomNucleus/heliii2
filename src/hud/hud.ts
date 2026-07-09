/** Green neon HUD overlay controller */

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const whole = Math.floor(s);
  const tenth = Math.floor((s - whole) * 10);
  return `${m}:${whole.toString().padStart(2, '0')}.${tenth}`;
}

export class HUD {
  private timeEl: HTMLElement;
  private speedEl: HTMLElement;
  private altEl: HTMLElement;
  private ringsEl: HTMLElement;
  private root: HTMLElement;
  private totalRings: number;

  constructor(totalRings = 10) {
    this.totalRings = totalRings;
    this.root = document.getElementById('hud')!;
    this.timeEl = document.getElementById('hud-time')!;
    this.speedEl = document.getElementById('hud-speed')!;
    this.altEl = document.getElementById('hud-altitude')!;
    this.ringsEl = document.getElementById('hud-rings')!;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  update(time: number, speed: number, altitude: number, rings: number) {
    this.timeEl.textContent = formatTime(time);
    this.speedEl.textContent = `${Math.round(speed)}`;
    this.altEl.textContent = `${Math.round(altitude)}`;
    this.ringsEl.textContent = `${rings}/${this.totalRings}`;
  }

  formatTime(seconds: number): string {
    return formatTime(seconds);
  }
}
