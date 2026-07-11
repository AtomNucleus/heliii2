import * as THREE from 'three';
import { HealthSystem } from '../combat/health';
import { ScoringSystem } from '../combat/scoring';
import { WeaponSystem } from '../combat/weapons';
import { EnemySystem, type EnemyLayoutOptions } from '../combat/enemies';
import { CombatEffects } from '../combat/effects';
import type { CheckpointSystem } from '../rings/checkpoints';
import type { MissionOutcome } from '../combat/mission';
import { getPhaseDef } from './phases';
import { MissionDirector, actForPhase } from './director';
import { RadioChatter, RADIO_SCRIPTS } from './radio';
import { ObjectiveMarkers } from './markers';
import type { QualitySettings } from '../effects/quality';
import {
  makeWaveContext,
  spawnAmbientThreats,
  spawnFirstStrikeDepots,
  spawnAaGauntlet,
  spawnConvoy,
  spawnRetaliationWave,
  spawnCommandBunker,
  bunkerHealthRatio,
  type WaveContext,
} from './waves';
import { gradeFromRun, loadBestScore, previewGrade } from './grade';
import { dailyGradePoints, getDailyChallenge } from '../profile';
import type {
  PhaseId,
  PhaseHudState,
  StrikeEndSummary,
  StrikeEventListener,
  StrikeHudState,
  StrikeMissionEvent,
} from './types';

const STARTING_LIVES = 3;
const RETALIATION_WAVES = 3;
const HOLD_SECONDS = 12;
const CRITICAL_RADIO_COOLDOWN = 18;

/**
 * Authored cinematic strike mission for Operation SUNSET.
 * Combat adapter over Health/Weapons/Enemies/Scoring; pacing & acts live in MissionDirector.
 */
export class StrikeMission {
  readonly health: HealthSystem;
  readonly scoring: ScoringSystem;
  readonly weapons: WeaponSystem;
  readonly enemies: EnemySystem;
  readonly effects: CombatEffects;
  readonly radio = new RadioChatter();
  readonly markers: ObjectiveMarkers;
  readonly director = new MissionDirector();

  /** Optional: main teleports heli on checkpoint respawn. */
  onRespawn: ((pos: THREE.Vector3) => void) | null = null;

  private elapsed = 0;
  private ramCooldown = 0;
  private nearMissCooldown = 0;
  private readonly layoutOpts: EnemyLayoutOptions;
  private readonly checkpoints: CheckpointSystem;
  private lastSummary: StrikeEndSummary | null = null;
  private damageFlash = 0;
  private aimLocked = false;
  private readonly listeners: StrikeEventListener[] = [];
  private readonly forward = new THREE.Vector3();
  private readonly muzzle = new THREE.Vector3();

  private holdProgress = 0;
  private lives = STARTING_LIVES;
  private checkpointsUsed = 0;
  private criticalRadioAt = -999;
  private reconRadioTier = 0;
  private convoyEscapeX = 0;
  private convoyEscaped = false;
  private convoyEscortCalled = false;
  private retaliationWave = 0;
  private bunkerStage = 0;
  private gauntletSetpieceFired = false;
  private lastActId = 0;
  private waveCtx: WaveContext;
  private checkpointPos = new THREE.Vector3();
  private checkpointLabel: string | null = null;
  private objectiveTargetsLeft = 0;
  private objectiveTargetsTotal = 0;
  private phaseDetail = '';
  private completedPhaseIds: PhaseId[] = [];
  private phaseEnterAt = 0;
  private phaseTimes: Partial<Record<PhaseId, number>> = {};

  constructor(
    scene: THREE.Scene,
    layoutOpts: EnemyLayoutOptions,
    checkpoints: CheckpointSystem,
  ) {
    this.layoutOpts = layoutOpts;
    this.checkpoints = checkpoints;
    this.waveCtx = makeWaveContext(layoutOpts);
    this.health = new HealthSystem(100, 0.5);
    this.scoring = new ScoringSystem();
    this.weapons = new WeaponSystem(scene, 0.24);
    this.effects = new CombatEffects(scene);
    this.enemies = new EnemySystem(scene, this.weapons, this.effects);
    this.markers = new ObjectiveMarkers(scene);
    // Start empty — phases spawn content
    this.enemies.clear();

    this.director.onTransition((ev) => {
      if (ev.type === 'phaseEnter') {
        this.phaseEnterAt = this.elapsed;
        this.applyPhaseEnter(ev.phaseId, ev.isMissionStart, ev.act.id);
      } else if (ev.type === 'softNudge') {
        this.radio.say(RADIO_SCRIPTS.softNudge(ev.phaseId));
      } else if (ev.type === 'phaseComplete') {
        this.scoring.addFlat(ev.bonus);
        this.completedPhaseIds.push(ev.phaseId);
        this.phaseTimes[ev.phaseId] = Math.max(0, this.elapsed - this.phaseEnterAt);
        this.emit({
          type: 'toast',
          message: `${ev.def.title} COMPLETE · +${ev.bonus}`,
        });
      } else if (ev.type === 'missionEnd') {
        this.finish(ev.outcome);
      }
    });

    this.health.onDamage((ev) => {
      this.emit({
        type: 'damage',
        amount: ev.amount,
        source: ev.source,
        remaining: ev.remaining,
      });
      if (
        ev.remaining <= 30 &&
        ev.remaining > 0 &&
        this.elapsed - this.criticalRadioAt > CRITICAL_RADIO_COOLDOWN
      ) {
        this.criticalRadioAt = this.elapsed;
        this.radio.say(RADIO_SCRIPTS.hullCritical);
      }
    });

    this.checkpointPos.copy(layoutOpts.spawn);
  }

  setEffectsCamera(camera: THREE.Camera | null) {
    this.effects.setCamera(camera);
  }

  applyQuality(settings: QualitySettings) {
    this.effects.applyQuality(settings);
  }

  onEvent(listener: StrikeEventListener) {
    this.listeners.push(listener);
  }

  private emit(event: StrikeMissionEvent) {
    for (const listener of this.listeners) listener(event);
  }

  get phase(): MissionOutcome {
    return this.director.missionOutcome;
  }

  get currentPhaseId(): PhaseId {
    return this.director.currentPhaseId;
  }

  get summary(): StrikeEndSummary | null {
    return this.lastSummary;
  }

  getDamageFlash(): number {
    return this.damageFlash;
  }

  getAimLocked(): boolean {
    return this.aimLocked;
  }

  get weaponReady(): boolean {
    return this.weapons.ready;
  }

  reset() {
    this.elapsed = 0;
    this.ramCooldown = 0;
    this.nearMissCooldown = 0;
    this.damageFlash = 0;
    this.aimLocked = false;
    this.lastSummary = null;
    this.lives = STARTING_LIVES;
    this.checkpointsUsed = 0;
    this.criticalRadioAt = -999;
    this.reconRadioTier = 0;
    this.convoyEscaped = false;
    this.convoyEscortCalled = false;
    this.retaliationWave = 0;
    this.bunkerStage = 0;
    this.gauntletSetpieceFired = false;
    this.holdProgress = 0;
    this.lastActId = 0;
    this.checkpointLabel = null;
    this.checkpointPos.copy(this.layoutOpts.spawn);
    this.completedPhaseIds = [];
    this.phaseEnterAt = 0;
    this.phaseTimes = {};
    this.waveCtx = makeWaveContext(this.layoutOpts);

    this.health.reset();
    this.scoring.reset();
    this.weapons.reset();
    this.effects.clear();
    this.enemies.clear();
    this.markers.clear();
    this.radio.reset();
    this.checkpoints.reset();

    this.director.reset();
  }

  getHudState(): StrikeHudState {
    const snap = this.scoring.getSnapshot();
    const def = this.director.currentPhase;
    const act = this.director.currentAct;
    const phaseHud: PhaseHudState = {
      phaseId: def.id,
      phaseIndex: def.index,
      phaseTotal: this.director.phaseTotal,
      code: def.code,
      title: def.title,
      verb: def.verb,
      detail: this.phaseDetail,
      progress: this.computePhaseProgress(),
      countLabel: this.phaseCountLabel(),
      actCode: act.code,
      actTitle: act.title,
      hudTag: this.director.hudTag(),
    };

    return {
      time: this.elapsed,
      health: this.health.value,
      healthMax: this.health.max,
      score: snap.score,
      combo: snap.combo,
      multiplier: snap.multiplier,
      targetsLeft: this.objectiveTargetsLeft,
      targetsTotal: this.objectiveTargetsTotal,
      rings: this.checkpoints.collectedCount,
      ringsTotal: this.checkpoints.total,
      kills: snap.kills,
      weaponReady: this.weapons.ready,
      aimLocked: this.aimLocked,
      phase: phaseHud,
      checkpointLabel: this.checkpointLabel,
      lives: this.lives,
      gradePreview: previewGrade(snap.score, this.elapsed, this.health.ratio),
    };
  }

  applyExternalDamage(amount: number, source = 'impact'): number {
    if (!this.director.isPlaying) return 0;
    const applied = this.health.takeDamage(amount, source);
    if (applied > 0) this.damageFlash = 1;
    return applied;
  }

  update(
    dt: number,
    time: number,
    heli: THREE.Object3D,
    yaw: number,
    heliVelocity?: THREE.Vector3,
  ): MissionOutcome {
    if (!this.director.isPlaying) return this.director.missionOutcome;

    this.elapsed += dt;
    this.director.tick(dt);
    this.health.update(dt);
    this.scoring.update(dt);
    this.effects.update(dt);
    this.markers.update(dt, time, heli.position);

    const radio = this.radio.update(dt);
    if (radio) {
      this.emit({ type: 'radio', callsign: radio.callsign, text: radio.text, hold: radio.hold });
    }

    const vel = heliVelocity ?? new THREE.Vector3();
    this.enemies.update(dt, time, heli.position, vel, this.health.alive);

    const homing = this.enemies.getHomingTargets();
    this.weapons.update(dt, homing);

    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);
    }
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
    if (this.nearMissCooldown > 0) this.nearMissCooldown -= dt;

    this.forward.set(Math.sin(yaw), -0.06, Math.cos(yaw)).normalize();
    this.muzzle
      .copy(heli.position)
      .add(new THREE.Vector3(0, -0.35, 0))
      .addScaledVector(this.forward, 3.4);

    const aim = this.enemies.findAimTarget(heli.position, this.forward);
    this.aimLocked = !!aim;

    if (this.weapons.tryPlayerFire(this.muzzle, this.forward)) {
      this.effects.spawnMuzzleFlash(this.muzzle, this.forward);
      this.emit({ type: 'fire' });
    }

    const hits = this.enemies.applyProjectileHits(this.weapons.activeProjectiles);
    for (const p of this.weapons.activeProjectiles) {
      if (!p.alive) this.weapons.despawn(p);
    }
    this.weapons.compact();

    const phaseId = this.director.currentPhaseId;
    for (const hit of hits) {
      if (hit.destroyed) {
        const points = this.scoring.addKill(hit.points);
        this.emit({
          type: 'kill',
          enemy: hit.enemy,
          points,
          combo: this.scoring.getSnapshot().combo,
          primary: hit.enemy.primary,
        });
        if (hit.enemy.primary) {
          const left = this.enemies.primaryAlive;
          if (left > 0 && (phaseId === 'firstStrike' || phaseId === 'aaGauntlet')) {
            this.emit({ type: 'toast', message: `TARGET DOWN · ${left} LEFT` });
          }
        } else if (
          this.scoring.getSnapshot().combo >= 4 &&
          this.scoring.getSnapshot().combo % 2 === 0
        ) {
          this.emit({
            type: 'toast',
            message: `COMBO x${this.scoring.getMultiplier()}`,
          });
        }

      } else {
        this.emit({ type: 'hit', enemy: hit.enemy });
      }
    }

    for (const p of this.weapons.activeProjectiles) {
      if (!p.alive || p.fromPlayer) continue;
      const dist = p.mesh.position.distanceTo(heli.position);
      if (dist < 2.5 + p.radius) {
        const applied = this.health.takeDamage(p.damage, 'aa-fire');
        this.weapons.despawn(p);
        if (applied > 0) this.damageFlash = 1;
      } else if (dist < 7.5 && this.nearMissCooldown <= 0 && this.health.alive) {
        const points = this.scoring.addNearMiss(80);
        this.nearMissCooldown = 0.55;
        this.emit({ type: 'nearMiss', points });
      }
    }
    this.weapons.compact();

    if (this.ramCooldown <= 0) {
      const ramDmg = this.enemies.checkRamming(heli.position);
      if (ramDmg > 0) {
        const applied = this.health.takeDamage(ramDmg, 'collision');
        if (applied > 0) {
          this.damageFlash = 1;
          this.ramCooldown = 0.85;
        }
      }
    }

    if (this.checkpoints.tryCollect(heli.position)) {
      const points = this.scoring.addRingBonus(300);
      this.health.heal(8);
      this.emit({ type: 'ring', points });
    }

    this.updatePhaseLogic(dt, heli.position);

    if (!this.health.alive) {
      this.handleDeath();
      return this.director.missionOutcome;
    }

    return this.director.missionOutcome;
  }

  private applyPhaseEnter(id: PhaseId, isMissionStart: boolean, actId: number) {
    this.holdProgress = 0;
    this.reconRadioTier = 0;
    const def = getPhaseDef(id);

    this.emit({ type: 'phase', phaseId: id, title: def.title });
    this.emit({ type: 'toast', message: `${def.code} · ${def.title}` });

    if (!isMissionStart && actId !== this.lastActId) {
      const act = actForPhase(id);
      this.radio.say(RADIO_SCRIPTS.actTransition(act.code, act.title));
      this.emit({ type: 'setpiece', name: `ACT_${actId}_${act.title}` });
    }
    this.lastActId = actId;

    switch (id) {
      case 'ingress':
        this.setupIngress(isMissionStart);
        break;
      case 'recon':
        this.setupRecon();
        break;
      case 'firstStrike':
        this.setupFirstStrike();
        break;
      case 'aaGauntlet':
        this.setupAaGauntlet();
        break;
      case 'convoy':
        this.setupConvoy();
        break;
      case 'retaliation':
        this.setupRetaliation();
        break;
      case 'commandBunker':
        this.setupBunker();
        break;
      case 'exfil':
        this.setupExfil();
        break;
    }

    this.refreshObjectiveCounts();
    this.phaseDetail = def.brief;
  }

  private setupIngress(isMissionStart: boolean) {
    const { half, spawn, getGroundHeight } = this.waveCtx;
    const tx = half * 0.48;
    const tz = half * 0.22;
    const pos = new THREE.Vector3(tx, getGroundHeight(tx, tz) + 10, tz);
    this.markers.setTargets([
      { id: 'ingress', position: pos, label: 'RECON GRID', radius: 16, color: 0x39ff9a },
    ]);
    this.objectiveTargetsTotal = 1;
    this.objectiveTargetsLeft = 1;
    if (isMissionStart) {
      this.radio.say(RADIO_SCRIPTS.missionStart);
      this.saveCheckpoint('Pad Alpha', spawn.clone().setY(spawn.y + 2));
    }
  }

  private setupRecon() {
    const primary = this.markers.getPrimaryPosition();
    const { half, getGroundHeight } = this.waveCtx;
    const tx = primary?.x ?? half * 0.48;
    const tz = primary?.z ?? half * 0.22;
    const pos = new THREE.Vector3(tx, getGroundHeight(tx, tz) + 12, tz);
    this.markers.setTargets([
      { id: 'recon', position: pos, label: 'SCAN VOLUME', radius: 18, color: 0x4ecdc4 },
    ]);
    this.holdProgress = 0;
    this.objectiveTargetsTotal = 1;
    this.objectiveTargetsLeft = 1;
    this.radio.say(RADIO_SCRIPTS.ingressComplete);
  }

  private setupFirstStrike() {
    this.markers.clear();
    spawnAmbientThreats(this.enemies, this.waveCtx);
    spawnFirstStrikeDepots(this.enemies, this.waveCtx);
    this.objectiveTargetsTotal = this.enemies.countAlive({ tag: 'first-strike' });
    this.objectiveTargetsLeft = this.objectiveTargetsTotal;
    this.radio.say(RADIO_SCRIPTS.firstStrikeStart);
    this.markPrimaryBeacons();
  }

  private setupAaGauntlet() {
    this.enemies.despawnByTag('ambient');
    // Clear leftover first-strike debris tags; keep map clean
    this.enemies.clear();
    spawnAaGauntlet(this.enemies, this.waveCtx);
    this.gauntletSetpieceFired = false;
    this.objectiveTargetsTotal = this.enemies.countAlive({ tag: 'gauntlet' });
    this.objectiveTargetsLeft = this.objectiveTargetsTotal;
    this.radio.say(RADIO_SCRIPTS.aaGauntletStart);
    this.emit({ type: 'setpiece', name: 'AA_GAUNTLET' });
    this.markPrimaryBeacons();
  }

  private setupConvoy() {
    this.enemies.clear();
    this.convoyEscaped = false;
    this.convoyEscortCalled = false;
    this.convoyEscapeX = spawnConvoy(this.enemies, this.waveCtx);
    this.radio.say(RADIO_SCRIPTS.convoyStart);
    this.markPrimaryBeacons();
  }

  private setupRetaliation() {
    this.enemies.clear();
    this.retaliationWave = 0;
    this.radio.say(RADIO_SCRIPTS.retaliationStart);
    this.spawnNextRetaliationWave();
  }

  private setupBunker() {
    this.enemies.clear();
    this.bunkerStage = 0;
    spawnCommandBunker(this.enemies, this.waveCtx);
    this.radio.say(RADIO_SCRIPTS.bunkerStart);
    this.emit({ type: 'setpiece', name: 'COMMAND_BUNKER' });
    this.markPrimaryBeacons();
  }

  private setupExfil() {
    this.enemies.despawnByTag('bunker-aa');
    this.enemies.despawnByTag('bunker-escort');
    const { spawn, getGroundHeight } = this.waveCtx;
    const pos = spawn.clone();
    pos.y = getGroundHeight(pos.x, pos.z) + 6;
    this.markers.setTargets([
      { id: 'exfil', position: pos, label: 'EXTRACT LZ', radius: 14, color: 0xff8c3a },
    ]);
    this.objectiveTargetsTotal = 1;
    this.objectiveTargetsLeft = 1;
    this.radio.say(RADIO_SCRIPTS.exfilStart);
  }

  private markPrimaryBeacons() {
    const primaries = this.enemies.getAlive({ primary: true });
    this.markers.setTargets(
      primaries.map((e, i) => ({
        id: `obj-${e.id}`,
        position: e.position.clone().setY(e.position.y + 2),
        label: e.tag ?? `T${i + 1}`,
        radius: 10,
        color: e.tag === 'bunker' ? 0xff6b20 : 0x39ff9a,
      })),
    );
  }

  private spawnNextRetaliationWave() {
    this.retaliationWave += 1;
    spawnRetaliationWave(this.enemies, this.waveCtx, this.retaliationWave);
    this.emit({
      type: 'wave',
      wave: this.retaliationWave,
      total: RETALIATION_WAVES,
    });
    this.radio.say(RADIO_SCRIPTS.retaliationWave(this.retaliationWave, RETALIATION_WAVES));
    this.markPrimaryBeacons();
    this.refreshObjectiveCounts();
  }

  private updatePhaseLogic(dt: number, heliPos: THREE.Vector3) {
    const phaseId = this.director.currentPhaseId;
    const def = this.director.currentPhase;
    const phaseElapsed = this.director.elapsedInPhase;

    switch (phaseId) {
      case 'ingress':
        this.refreshObjectiveCounts();
        if (this.markers.isInsideAny(heliPos)) {
          this.completePhase();
        } else {
          const d = this.markers.getNearestDistance(heliPos);
          this.phaseDetail =
            d != null ? `Grid ${Math.round(d)}m · hold for scan next` : def.brief;
        }
        break;

      case 'recon': {
        if (this.markers.isInsideAny(heliPos, 32)) {
          this.holdProgress += dt;
        } else {
          this.holdProgress = Math.max(0, this.holdProgress - dt * 0.45);
        }
        const ratio = Math.min(1, this.holdProgress / HOLD_SECONDS);
        this.objectiveTargetsLeft = ratio >= 1 ? 0 : 1;
        this.phaseDetail = `Scan ${Math.round(ratio * 100)}% · stay in volume`;
        if (ratio >= 0.5 && this.reconRadioTier < 1) {
          this.reconRadioTier = 1;
          this.radio.say(RADIO_SCRIPTS.reconProgress(0.5));
        } else if (ratio >= 0.85 && this.reconRadioTier < 2) {
          this.reconRadioTier = 2;
          this.radio.say(RADIO_SCRIPTS.reconProgress(0.85));
        }
        if (ratio >= 1) this.completePhase();
        break;
      }

      case 'firstStrike':
        this.refreshObjectiveCounts();
        this.markPrimaryBeacons();
        this.phaseDetail = `${this.objectiveTargetsLeft} depots remaining`;
        if (this.enemies.countAlive({ tag: 'first-strike' }) <= 0) {
          this.completePhase();
        }
        break;

      case 'aaGauntlet':
        this.refreshObjectiveCounts();
        this.markPrimaryBeacons();
        if (!this.gauntletSetpieceFired && phaseElapsed > 4) {
          this.gauntletSetpieceFired = true;
          this.radio.say(RADIO_SCRIPTS.aaGauntletSetpiece);
          // Flak spike: briefly faster fire on remaining turrets
          for (const e of this.enemies.getAlive({ tag: 'gauntlet' })) {
            e.fireCooldown = Math.max(0.7, e.fireCooldown * 0.75);
          }
        }
        this.phaseDetail = `${this.objectiveTargetsLeft} AA nests left`;
        if (this.enemies.countAlive({ tag: 'gauntlet' }) <= 0) {
          this.completePhase();
        }
        break;

      case 'convoy': {
        this.refreshObjectiveCounts();
        this.markPrimaryBeacons();
        const trucks = this.enemies.getAlive({ tag: 'convoy' });
        if (!this.convoyEscortCalled && phaseElapsed > 8) {
          this.convoyEscortCalled = true;
          this.radio.say(RADIO_SCRIPTS.convoyEscort);
          this.emit({ type: 'setpiece', name: 'CONVOY_ESCORT' });
        }
        // Escape check
        let escaped = 0;
        for (const t of trucks) {
          if (t.position.x <= this.convoyEscapeX) {
            t.alive = false;
            t.mesh.visible = false;
            escaped += 1;
          }
        }
        if (escaped > 0) this.convoyEscaped = true;
        this.phaseDetail = this.convoyEscaped
          ? `${trucks.length} trucks · some escaped`
          : `${trucks.length} trucks racing west`;
        if (trucks.length === 0) {
          this.completePhase();
        }
        break;
      }

      case 'retaliation':
        this.refreshObjectiveCounts();
        this.markPrimaryBeacons();
        this.phaseDetail = `Wave ${this.retaliationWave}/${RETALIATION_WAVES} · ${this.objectiveTargetsLeft} drones`;
        if (this.enemies.countAlive({ tag: 'retaliation' }) <= 0) {
          if (this.retaliationWave >= RETALIATION_WAVES) {
            this.completePhase();
          } else {
            this.spawnNextRetaliationWave();
          }
        }
        break;

      case 'commandBunker': {
        this.refreshObjectiveCounts();
        this.markPrimaryBeacons();
        const ratio = bunkerHealthRatio(this.enemies);
        if (ratio > 0 && ratio <= 0.66 && this.bunkerStage < 1) {
          this.bunkerStage = 1;
          this.radio.say(RADIO_SCRIPTS.bunkerStage(1));
          this.emit({ type: 'setpiece', name: 'BUNKER_STAGE_1' });
        } else if (ratio > 0 && ratio <= 0.33 && this.bunkerStage < 2) {
          this.bunkerStage = 2;
          this.radio.say(RADIO_SCRIPTS.bunkerStage(2));
          this.emit({ type: 'setpiece', name: 'BUNKER_STAGE_2' });
          // Reinforcement spike
          spawnRetaliationWave(this.enemies, this.waveCtx, 2);
          for (const e of this.enemies.getAlive({ tag: 'retaliation' })) {
            e.primary = false;
            e.tag = 'bunker-escort';
          }
        }
        this.phaseDetail =
          ratio <= 0
            ? 'Bunker destroyed'
            : `Bunker armor ${Math.round(ratio * 100)}% · stage ${this.bunkerStage + 1}/3`;
        if (this.enemies.countAlive({ tag: 'bunker' }) <= 0) {
          this.completePhase();
        }
        break;
      }

      case 'exfil':
        this.objectiveTargetsLeft = this.markers.isInsideAny(heliPos, 24) ? 0 : 1;
        this.phaseDetail = 'Reach extract LZ';
        if (this.markers.isInsideAny(heliPos, 24)) {
          this.completePhase();
        }
        break;
    }
  }

  private refreshObjectiveCounts() {
    switch (this.director.currentPhaseId) {
      case 'firstStrike':
        this.objectiveTargetsTotal = Math.max(
          this.objectiveTargetsTotal,
          this.enemies.countAlive({ tag: 'first-strike' }) +
            this.enemies.enemies.filter((e) => e.tag === 'first-strike' && !e.alive).length,
        );
        if (this.objectiveTargetsTotal <= 0) this.objectiveTargetsTotal = 2;
        this.objectiveTargetsLeft = this.enemies.countAlive({ tag: 'first-strike' });
        break;
      case 'aaGauntlet':
        this.objectiveTargetsLeft = this.enemies.countAlive({ tag: 'gauntlet' });
        this.objectiveTargetsTotal = Math.max(this.objectiveTargetsTotal, this.objectiveTargetsLeft);
        if (this.objectiveTargetsTotal <= 0) this.objectiveTargetsTotal = 7;
        break;
      case 'convoy':
        this.objectiveTargetsLeft = this.enemies.countAlive({ tag: 'convoy' });
        this.objectiveTargetsTotal = Math.max(4, this.objectiveTargetsLeft);
        break;
      case 'retaliation':
        this.objectiveTargetsLeft = this.enemies.countAlive({ tag: 'retaliation' });
        this.objectiveTargetsTotal = Math.max(this.objectiveTargetsLeft, 1);
        break;
      case 'commandBunker':
        this.objectiveTargetsLeft = this.enemies.countAlive({ tag: 'bunker' });
        this.objectiveTargetsTotal = 1;
        break;
      default:
        break;
    }
  }

  private computePhaseProgress(): number {
    const def = this.director.currentPhase;
    if (def.objective === 'hold') {
      return Math.min(1, this.holdProgress / HOLD_SECONDS);
    }
    if (def.objective === 'reach' || def.objective === 'extract') {
      return this.objectiveTargetsLeft <= 0 ? 1 : 0;
    }
    if (this.objectiveTargetsTotal <= 0) return 0;
    return 1 - this.objectiveTargetsLeft / this.objectiveTargetsTotal;
  }

  private phaseCountLabel(): string {
    const def = this.director.currentPhase;
    if (def.objective === 'hold') {
      return `${Math.min(100, Math.round((this.holdProgress / HOLD_SECONDS) * 100))}%`;
    }
    if (def.objective === 'surviveWaves') {
      return `W${this.retaliationWave}/${RETALIATION_WAVES}`;
    }
    if (def.objective === 'reach' || def.objective === 'extract') {
      return this.objectiveTargetsLeft <= 0 ? 'DONE' : 'GO';
    }
    return `${this.objectiveTargetsLeft} LEFT`;
  }

  private completePhase() {
    const phaseId = this.director.currentPhaseId;
    const def = getPhaseDef(phaseId);

    // Phase-complete radio before director advances
    switch (phaseId) {
      case 'ingress':
        break; // recon start lines handle this
      case 'recon':
        this.radio.say(RADIO_SCRIPTS.reconComplete);
        break;
      case 'firstStrike':
        this.radio.say(RADIO_SCRIPTS.firstStrikeDone);
        break;
      case 'aaGauntlet':
        this.radio.say(RADIO_SCRIPTS.aaGauntletDone);
        break;
      case 'convoy':
        this.radio.say(
          this.convoyEscaped ? RADIO_SCRIPTS.convoyFailed : RADIO_SCRIPTS.convoySuccess,
        );
        if (!this.convoyEscaped) this.scoring.addFlat(800);
        break;
      case 'retaliation':
        this.radio.say(RADIO_SCRIPTS.retaliationDone);
        break;
      case 'commandBunker':
        this.radio.say(RADIO_SCRIPTS.bunkerDone);
        break;
      case 'exfil':
        this.radio.say(RADIO_SCRIPTS.exfilDone);
        break;
    }

    // Save checkpoint at phase boundary
    const markerPos = this.markers.getPrimaryPosition();
    const savePos =
      markerPos ??
      this.enemies.getAlive({ primary: true })[0]?.position.clone() ??
      this.checkpointPos.clone();
    this.saveCheckpoint(`${def.code} ${def.title}`, savePos);

    // Director awards bonus, enters next phase, or ends mission (won)
    this.director.completeCurrentPhase();
  }

  private saveCheckpoint(label: string, pos: THREE.Vector3) {
    this.checkpointPos.copy(pos);
    if (pos.y < 2) this.checkpointPos.y = this.layoutOpts.getGroundHeight(pos.x, pos.z) + 8;
    this.checkpointLabel = label;
    this.emit({ type: 'checkpoint', label });
    // Quiet confirm — avoid stacking on phase-complete radio
    this.radio.say([
      {
        callsign: 'COMMAND',
        text: `Checkpoint · ${label}.`,
        hold: 1.8,
        delay: 0.4,
      },
    ]);
  }

  private handleDeath() {
    if (this.lives > 1 && this.checkpointLabel) {
      this.lives -= 1;
      this.checkpointsUsed += 1;
      this.scoring.addFlat(-400);
      this.health.reset();
      this.health.grantInvulnerability(2.8);
      // Clear inbound fire so recovery feels fair
      this.weapons.reset();
      this.damageFlash = 0;
      this.ramCooldown = 1.2;
      this.nearMissCooldown = 1.0;
      // Soft pressure relief: pause AA briefly by bumping fire timers
      for (const e of this.enemies.getAlive()) {
        e.fireTimer = Math.max(e.fireTimer, 1.8 + Math.random() * 0.6);
      }
      this.director.onCheckpointRecover();
      this.radio.interrupt(RADIO_SCRIPTS.phaseRestart(this.director.currentPhase.title)[0]!);
      this.emit({
        type: 'toast',
        message: `CHECKPOINT · ${this.lives} HULL${this.lives === 1 ? '' : 'S'} LEFT`,
      });
      this.onRespawn?.(this.checkpointPos.clone());
      return;
    }

    this.director.failMission();
  }

  private finish(outcome: 'won' | 'lost') {
    // Idempotent — director may already have set outcome
    if (this.lastSummary && this.lastSummary.outcome === outcome) return;

    const snap = this.scoring.getSnapshot();
    let timeBonus = 0;
    let healthBonus = 0;
    if (outcome === 'won') {
      timeBonus = this.scoring.applyTimeBonus(this.elapsed, this.director.parSeconds);
      healthBonus = this.scoring.applyHealthBonus(this.health.ratio);
      if (snap.rings >= this.checkpoints.total) {
        this.scoring.addFlat(1000);
      }
      if (this.checkpointsUsed === 0) {
        this.scoring.addFlat(1500);
      }
    }

    const finalScore = this.scoring.getSnapshot().score;
    const daily = getDailyChallenge();
    const dailyPoints = dailyGradePoints(daily, {
      outcome,
      score: finalScore,
      time: this.elapsed,
      bestCombo: snap.bestCombo,
      checkpointsUsed: this.checkpointsUsed,
    });
    const grade = gradeFromRun({
      outcome,
      score: finalScore,
      time: this.elapsed,
      healthRatio: this.health.ratio,
      bestCombo: snap.bestCombo,
      phasesCompleted: this.director.completedCount,
      phaseTotal: this.director.phaseTotal,
      checkpointsUsed: this.checkpointsUsed,
      dailyPoints,
    });
    // Best-score persistence (bonus-inclusive + NEW BEST) is owned by main.finishMission
    // via recordRun so daily/loadout bonuses are included. Mirror current stored best for HUD.
    const displayBest = loadBestScore();

    this.lastSummary = {
      outcome,
      score: finalScore,
      kills: snap.kills,
      rings: snap.rings,
      bestCombo: snap.bestCombo,
      time: this.elapsed,
      timeBonus,
      healthBonus,
      grade,
      phasesCompleted: this.director.completedCount,
      checkpointsUsed: this.checkpointsUsed,
      bestScore: displayBest,
      isNewBest: false,
      completedPhaseIds: [...this.completedPhaseIds],
      phaseTimes: { ...this.phaseTimes },
      dailyId: daily.id,
      dailyLabel: daily.label,
      dailyBonus: 0,
      loadoutBonus: 0,
    };
  }
}
