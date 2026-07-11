/** In-memory session cache over the profile repository (single-tab). */

import { loadProfile, persistProfile } from './repository';
import { buildDailyChallenge } from './daily';
import { applyDocumentSettings, readSystemPrefersReducedMotion } from './settings';
import { applyRunToProgression, equipLoadout, equipSkin } from './progression';
import { patchSettings } from './settings';
import type {
  DailyChallenge,
  LoadoutId,
  PlayerProfile,
  SettingsState,
  SkinId,
} from './types';
import type { RunProgressInputWithRings, ProgressionApplyResult } from './progression';

let profile: PlayerProfile | null = null;
let daily: DailyChallenge | null = null;
let bootRecovered = false;
let bootMigrated = false;

export function initProfileSession(opts?: {
  prefersReducedMotion?: boolean;
}): {
  profile: PlayerProfile;
  daily: DailyChallenge;
  recovered: boolean;
  migrated: boolean;
} {
  const systemReduced =
    opts?.prefersReducedMotion ?? readSystemPrefersReducedMotion();
  const loaded = loadProfile({
    prefersReducedMotion: () => systemReduced,
  });
  profile = loaded.profile;
  bootRecovered = loaded.recovered;
  bootMigrated = loaded.migrated;
  daily = buildDailyChallenge();
  applyDocumentSettings(profile.settings, { systemPrefersReduced: systemReduced });
  return {
    profile,
    daily,
    recovered: loaded.recovered,
    migrated: loaded.migrated,
  };
}

export function getProfile(): PlayerProfile {
  if (!profile) initProfileSession();
  return profile!;
}

export function getDailyChallenge(): DailyChallenge {
  if (!daily) daily = buildDailyChallenge();
  return daily;
}

export function refreshDailyChallenge(date?: Date): DailyChallenge {
  daily = buildDailyChallenge(date);
  return daily;
}

export function saveProfile(): boolean {
  if (!profile) return false;
  return persistProfile(profile);
}

export function updateSettings(patch: Partial<SettingsState>): SettingsState {
  const p = getProfile();
  p.settings = patchSettings(p.settings, patch);
  p.updatedAt = new Date().toISOString();
  applyDocumentSettings(p.settings);
  saveProfile();
  return p.settings;
}

export function setEquippedSkin(skin: SkinId): boolean {
  const p = getProfile();
  const next = equipSkin(p.progression, skin);
  if (next.equippedSkin !== skin) return false;
  p.progression = next;
  saveProfile();
  return true;
}

export function setEquippedLoadout(loadout: LoadoutId): boolean {
  const p = getProfile();
  const next = equipLoadout(p.progression, loadout);
  if (next.equippedLoadout !== loadout) return false;
  p.progression = next;
  saveProfile();
  return true;
}

export function recordRun(run: RunProgressInputWithRings): ProgressionApplyResult {
  const p = getProfile();
  const d = getDailyChallenge();
  const result = applyRunToProgression(p, run, d);
  p.progression = result.progression;
  // Fold bonuses into best score display path
  if (run.outcome === 'won') {
    const total = Math.floor(run.score + result.daily.bonus + result.loadoutBonus);
    if (total > p.progression.bestScore) {
      p.progression.bestScore = total;
    }
  }
  saveProfile();
  return result;
}

export function getBestScore(): number {
  return getProfile().progression.bestScore;
}

export function noteBestScore(score: number): { best: number; isNewBest: boolean } {
  const p = getProfile();
  const prev = p.progression.bestScore;
  const best = Math.max(prev, Math.floor(score));
  const isNewBest = best > prev && score > 0;
  if (best !== prev) {
    p.progression.bestScore = best;
    saveProfile();
  }
  return { best, isNewBest };
}

export function getBootFlags() {
  return { recovered: bootRecovered, migrated: bootMigrated };
}
