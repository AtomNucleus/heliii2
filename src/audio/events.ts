/**
 * Clean narrative / combat event API for GameAudio.
 * Gameplay can emit these without knowing mix routing.
 */

import type { ImpactKind, RadioCue, SpatialPoint, WarningKind } from './types';

/** Lightweight mission events mirrored from combat without importing combat types. */
export type AudioMissionEvent =
  | { type: 'fire' }
  | { type: 'hit'; at?: SpatialPoint }
  | {
      type: 'kill';
      at?: SpatialPoint;
      primary?: boolean;
      combo?: number;
      points?: number;
    }
  | { type: 'damage'; amount?: number; remaining?: number }
  | { type: 'ring'; points?: number }
  | { type: 'nearMiss'; points?: number }
  | { type: 'toast'; message: string }
  | { type: 'impact'; intensity?: number; kind?: ImpactKind }
  | { type: 'boost' }
  | { type: 'weapon-ready'; ready: boolean }
  | { type: 'aa-fire'; at: SpatialPoint }
  | { type: 'radio'; cue: RadioCue; text?: string }
  | { type: 'warning'; kind: WarningKind }
  | { type: 'mission-start' }
  | { type: 'mission-complete' }
  | { type: 'mission-failed' };

/** Caption payload for HUD / text-radio overlays. */
export interface RadioCaption {
  text: string;
  cue: RadioCue | 'text';
  atMs: number;
}

export type RadioCaptionListener = (caption: RadioCaption) => void;
