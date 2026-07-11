/** Versioned localStorage profile repository with corruption / migration fallback. */

import { createDefaultProfile } from './defaults';
import { parseAndMigrateProfile } from './validate';
import type { PlayerProfile, StorageLike } from './types';
import { LEGACY_BEST_SCORE_KEY, PROFILE_STORAGE_KEY } from './types';

export interface ProfileRepositoryOptions {
  storage?: StorageLike | null;
  storageKey?: string;
  legacyBestScoreKey?: string;
  now?: () => Date;
  prefersReducedMotion?: () => boolean;
}

export interface LoadProfileResult {
  profile: PlayerProfile;
  recovered: boolean;
  migrated: boolean;
  /** True when write failed (quota / private mode) — gameplay continues. */
  saveFailed: boolean;
}

function readLegacyBest(storage: StorageLike | null, key: string): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(key);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

function safeParseJson(raw: string | null): unknown {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined; // distinguish corrupt from missing
  }
}

/**
 * Load a validated profile. Corrupt / unreadable blobs fall back to defaults
 * while preserving the legacy best-score key when possible. Storage failures
 * are non-fatal.
 */
export function loadProfile(opts: ProfileRepositoryOptions = {}): LoadProfileResult {
  const storage = opts.storage ?? defaultStorage();
  const key = opts.storageKey ?? PROFILE_STORAGE_KEY;
  const legacyKey = opts.legacyBestScoreKey ?? LEGACY_BEST_SCORE_KEY;
  const now = opts.now?.() ?? new Date();
  const prefersReducedMotion = opts.prefersReducedMotion?.() ?? false;
  const importedBest = readLegacyBest(storage, legacyKey);

  let rawText: string | null;
  try {
    rawText = storage?.getItem(key) ?? null;
  } catch {
    const profile = createDefaultProfile({
      now,
      importedBestScore: importedBest,
      prefersReducedMotion,
    });
    return { profile, recovered: true, migrated: false, saveFailed: false };
  }

  const parsed = safeParseJson(rawText);
  if (parsed === undefined) {
    // Corrupt JSON — recover.
    const profile = createDefaultProfile({
      now,
      importedBestScore: importedBest,
      prefersReducedMotion,
    });
    const saveFailed = !persistProfile(profile, { storage, storageKey: key, legacyBestScoreKey: legacyKey });
    return { profile, recovered: true, migrated: true, saveFailed };
  }

  const { profile, recovered, migrated } = parseAndMigrateProfile(parsed, {
    now,
    importedBestScore: importedBest,
    prefersReducedMotion,
  });

  let saveFailed = false;
  if (recovered || migrated) {
    saveFailed = !persistProfile(profile, { storage, storageKey: key, legacyBestScoreKey: legacyKey });
  }

  return { profile, recovered, migrated, saveFailed };
}

/**
 * Persist profile. Also mirrors bestScore to the legacy key so older readers
 * and mid-migration paths stay consistent. Returns false on storage failure
 * (never throws).
 */
export function persistProfile(
  profile: PlayerProfile,
  opts: ProfileRepositoryOptions = {},
): boolean {
  const storage = opts.storage ?? defaultStorage();
  if (!storage) return false;
  const key = opts.storageKey ?? PROFILE_STORAGE_KEY;
  const legacyKey = opts.legacyBestScoreKey ?? LEGACY_BEST_SCORE_KEY;
  const next: PlayerProfile = {
    ...profile,
    updatedAt: (opts.now?.() ?? new Date()).toISOString(),
  };

  try {
    storage.setItem(key, JSON.stringify(next));
  } catch {
    return false;
  }

  try {
    storage.setItem(legacyKey, String(Math.max(0, Math.floor(next.progression.bestScore))));
  } catch {
    // Profile write succeeded; legacy mirror failure is non-fatal.
  }
  return true;
}

export function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** In-memory StorageLike for unit tests. */
export function createMemoryStorage(initial?: Record<string, string>): StorageLike {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}
