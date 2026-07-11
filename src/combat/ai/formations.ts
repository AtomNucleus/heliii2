/**
 * Formation slot layouts for drone wings (local XZ offsets, Y = height bias).
 */

import { type Vec3, v3 } from './vec';

export type FormationKind = 'wedge' | 'line' | 'diamond' | 'circle' | 'vic';

export interface FormationSlot {
  /** Local offset relative to formation anchor */
  offset: Vec3;
  /** Preferred facing bias along formation forward (0 = side, 1 = lead) */
  leadBias: number;
}

export interface FormationLayout {
  kind: FormationKind;
  slots: FormationSlot[];
  /** Spacing scale used to generate slots */
  spacing: number;
}

function slot(x: number, y: number, z: number, leadBias: number): FormationSlot {
  return { offset: v3(x, y, z), leadBias };
}

export function buildFormation(
  kind: FormationKind,
  count: number,
  spacing = 10,
): FormationLayout {
  const n = Math.max(1, count);
  const slots: FormationSlot[] = [];

  switch (kind) {
    case 'wedge': {
      // Lead at front (−Z), trailers fan left/right
      slots.push(slot(0, 0, -spacing * 0.35, 1));
      for (let i = 1; i < n; i++) {
        const row = Math.ceil(i / 2);
        const side = i % 2 === 1 ? -1 : 1;
        slots.push(
          slot(side * row * spacing * 0.55, row * 0.4, row * spacing * 0.7, 1 - row * 0.15),
        );
      }
      break;
    }
    case 'vic': {
      // Classic 3-ship V; extras trail
      slots.push(slot(0, 0, -spacing * 0.2, 1));
      if (n > 1) slots.push(slot(-spacing * 0.7, 0.2, spacing * 0.45, 0.7));
      if (n > 2) slots.push(slot(spacing * 0.7, 0.2, spacing * 0.45, 0.7));
      for (let i = 3; i < n; i++) {
        slots.push(slot(((i % 2) * 2 - 1) * spacing * 0.4, 0.3, spacing * (0.9 + (i - 3) * 0.5), 0.4));
      }
      break;
    }
    case 'line': {
      const start = -((n - 1) * spacing) * 0.5;
      for (let i = 0; i < n; i++) {
        slots.push(slot(start + i * spacing, 0, 0, 0.5));
      }
      break;
    }
    case 'diamond': {
      const ring = [
        slot(0, 0, -spacing, 1),
        slot(spacing, 0.2, 0, 0.6),
        slot(0, 0.1, spacing, 0.4),
        slot(-spacing, 0.2, 0, 0.6),
      ];
      for (let i = 0; i < n; i++) {
        if (i < 4) slots.push(ring[i]!);
        else {
          const a = ((i - 4) / Math.max(1, n - 4)) * Math.PI * 2;
          slots.push(
            slot(Math.cos(a) * spacing * 1.4, 0.3, Math.sin(a) * spacing * 1.4, 0.35),
          );
        }
      }
      break;
    }
    case 'circle':
    default: {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        slots.push(slot(Math.cos(a) * spacing, 0.15, Math.sin(a) * spacing, 0.5));
      }
      break;
    }
  }

  return { kind, slots: slots.slice(0, n), spacing };
}

/** World position for a slot given anchor + yaw (radians, Y-up). */
export function slotWorldPosition(
  anchor: Vec3,
  yaw: number,
  slotOffset: Vec3,
  out: Vec3 = v3(),
): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = slotOffset.x;
  const lz = slotOffset.z;
  out.x = anchor.x + lx * c - lz * s;
  out.y = anchor.y + slotOffset.y;
  out.z = anchor.z + lx * s + lz * c;
  return out;
}

export function formationKinds(): FormationKind[] {
  return ['wedge', 'vic', 'line', 'diamond', 'circle'];
}

/** Pick formation by index (deterministic). */
export function formationByIndex(index: number): FormationKind {
  const kinds = formationKinds();
  return kinds[((index % kinds.length) + kinds.length) % kinds.length]!;
}
