/** Shared audio types for HELI SUNSET procedural soundscape. */

export type ImpactKind = 'soft' | 'hard' | 'explosion' | 'ring' | 'damage';

export type MusicIntensity = 'idle' | 'patrol' | 'combat' | 'critical' | 'victory' | 'defeat';

export type WarningKind = 'hull' | 'lock' | 'altitude' | 'incoming' | 'stall';

export type RadioCue =
  | 'mission-start'
  | 'weapons-free'
  | 'target-down'
  | 'depot-down'
  | 'hull-critical'
  | 'near-miss'
  | 'bingo'
  | 'mission-complete'
  | 'mayday';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface FlightAudioParams {
  /** 0 idle hover … 1 full throttle */
  throttle?: number;
  /** World speed, typically 0–80 */
  speed?: number;
  /** Altitude above ground */
  altitude?: number;
  /** Boost engaged */
  boosting?: boolean;
  /** Vertical velocity (load on rotor) */
  verticalSpeed?: number;
  /** Collective / lift intent −1…1 */
  lift?: number;
  /** Hull health 0…1 */
  healthRatio?: number;
  /** Combat heat 0…1 (recent fire/hits) */
  combatHeat?: number;
  /** Aim lock active */
  aimLocked?: boolean;
  /** Listener / heli world position */
  position?: Vec3Like;
  /** Listener velocity for Doppler */
  velocity?: Vec3Like;
}

export interface SpatialPoint {
  x: number;
  y: number;
  z: number;
  /** Optional world velocity for Doppler */
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface FlybyCandidate {
  id: number | string;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface WorldAudioFrame {
  dt: number;
  listener: Vec3Like;
  listenerVelocity?: Vec3Like;
  /** Nearby hostiles for flybys / proximity hum */
  hostiles?: FlybyCandidate[];
  /** Enemy bolts for incoming whoosh */
  inbound?: SpatialPoint[];
}
