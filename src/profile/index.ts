/** HELI SUNSET persistent progression / settings / daily challenge. */

export {
  PROFILE_VERSION,
  PROFILE_STORAGE_KEY,
  LEGACY_BEST_SCORE_KEY,
} from './types';
export type {
  PlayerProfile,
  ProgressionState,
  SettingsState,
  PhaseAccomplishment,
  SkinId,
  LoadoutId,
  QualityPreference,
  ReducedMotionPreference,
  DailyChallenge,
  DailyModifierKind,
  DailyBonusResult,
  RunProgressInput,
  StorageLike,
} from './types';

export {
  createDefaultProfile,
  defaultSettings,
  defaultProgression,
  defaultPhaseMap,
  SKIN_DEFS,
  LOADOUT_DEFS,
  skinDef,
  loadoutDef,
  gradeRank,
  isBetterGrade,
  ALL_PHASE_IDS,
} from './defaults';

export { parseAndMigrateProfile, mergeBestGrade } from './validate';
export {
  loadProfile,
  persistProfile,
  createMemoryStorage,
  defaultStorage,
} from './repository';
export type { LoadProfileResult, ProfileRepositoryOptions } from './repository';

export {
  buildDailyChallenge,
  evaluateDailyBonus,
  dailyGradePoints,
  utcDateKey,
  seedFromDateKey,
  mulberry32,
} from './daily';

export {
  applyRunToProgression,
  evaluateUnlocks,
  equipSkin,
  equipLoadout,
} from './progression';
export type {
  ProgressionApplyResult,
  UnlockEvent,
  RunProgressInputWithRings,
} from './progression';

export {
  resolveReducedMotionActive,
  readSystemPrefersReducedMotion,
  applyDocumentSettings,
  patchSettings,
  clampSensitivity,
  clampVolume,
  qualityPreferenceToTier,
} from './settings';

export { applyHeliCosmetics, getSkinPalette } from './cosmetics';

export {
  initProfileSession,
  getProfile,
  getDailyChallenge,
  refreshDailyChallenge,
  saveProfile,
  updateSettings,
  setEquippedSkin,
  setEquippedLoadout,
  recordRun,
  getBestScore,
  noteBestScore,
  getBootFlags,
} from './session';