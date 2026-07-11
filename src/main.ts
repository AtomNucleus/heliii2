import * as THREE from 'three';
import { createSceneSetup } from './scene/setup';
import { loadMapWorld, buildFigureEightRingLayout, type WorldObjects } from './world/mapLoader';
import { updateWater } from './world/generate';
import { loadHelicopter, updateHelicopterVisuals } from './models/helicopter';
import { HelicopterController } from './helicopter/controller';
import { CheckpointSystem } from './rings/checkpoints';
import { HUD } from './hud/hud';
import { MobileControls } from './hud/mobileControls';
import { VisualEffects } from './effects/visualEffects';
import { getGameAudio } from './audio';
import { CombatMission, type MissionEndSummary } from './combat';

type GamePhase = 'loading' | 'start' | 'playing' | 'complete' | 'failed';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const startOverlay = document.getElementById('start-overlay')!;
const completeOverlay = document.getElementById('complete-overlay')!;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn')!;
const loadingStatus = document.getElementById('loading-status');

const sceneSetup = createSceneSetup(canvas);
const { scene, camera, sunLight } = sceneSetup;
const fx = new VisualEffects(sceneSetup);
const audio = getGameAudio();

let world: WorldObjects;
let controller: HelicopterController;
let checkpoints: CheckpointSystem;
let mission: CombatMission;
let hud: HUD;
let heli: THREE.Group;
let mobileControls: MobileControls;

let phase: GamePhase = 'loading';
let clock = new THREE.Clock();
let ready = false;
/** Projectile mesh UUIDs that already played spawn crack. */
const heardBolts = new Set<string>();
/** Throttle inbound whoosh per bolt. */
const whooshBolts = new Set<string>();

function setLoadingText(msg: string) {
  if (loadingStatus) loadingStatus.textContent = msg;
}

function syncHud() {
  const state = mission.getHudState();
  hud.updateCombat({
    time: state.time,
    speed: controller.getSpeed(),
    altitude: controller.getAltitude(),
    health: state.health,
    healthMax: state.healthMax,
    score: state.score,
    combo: state.combo,
    multiplier: state.multiplier,
    targetsLeft: state.targetsLeft,
    targetsTotal: state.targetsTotal,
    rings: state.rings,
    ringsTotal: state.ringsTotal,
    weaponReady: state.weaponReady,
  });
  hud.setCrosshairState(state.aimLocked ? 'lock' : 'idle');
}

function startGame() {
  if (!ready || phase === 'loading') return;
  phase = 'playing';
  mission.reset();
  controller.reset(world.spawnPosition);
  controller.enabled = true;
  fx.resetTrail();
  heardBolts.clear();
  whooshBolts.clear();
  startOverlay.classList.add('hidden');
  completeOverlay.classList.add('hidden');
  hud.resetVisuals();
  hud.enableCombatHud(true);
  hud.show();
  syncHud();
  hud.toast('STRIKE RUN · DESTROY THE DEPOTS', 2.2);
  mobileControls.show();
  void audio.resume();
  audio.setMusicIntensity('patrol');
  audio.playStart();
  audio.startFlightAmbience();
  clock.start();
}

function finishMission(summary: MissionEndSummary) {
  const won = summary.outcome === 'won';
  phase = won ? 'complete' : 'failed';
  controller.enabled = false;
  mobileControls.hide();
  audio.stopFlightAmbience();
  if (won) audio.playMissionComplete();
  else audio.playMissionFailed();
  hud.showComplete({
    title: won ? 'MISSION COMPLETE' : 'HULL DESTROYED',
    subtitle: won ? 'Fruzer strike successful' : 'Ejected over hostile territory',
    score: summary.score,
    time: summary.time,
    kills: summary.kills,
    combo: summary.bestCombo,
  });
}

function restartGame() {
  completeOverlay.classList.add('hidden');
  startGame();
}

startBtn.disabled = true;
startBtn.addEventListener('click', () => {
  if (phase === 'start') {
    audio.playUIConfirm();
    startGame();
  }
});
restartBtn.addEventListener('click', () => {
  audio.playUISelect();
  restartGame();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && phase === 'start') {
    audio.playUIConfirm();
    startGame();
  }
  if (
    e.code === 'KeyR'
    && (phase === 'playing' || phase === 'complete' || phase === 'failed')
  ) {
    restartGame();
  }
});

sunLight.target.position.set(0, 0, 0);
scene.add(sunLight.target);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (!ready) {
    fx.render();
    return;
  }

  controller.update(dt);
  checkpoints.update(time);
  if (world.water) updateWater(world.water, time);
  world.environment?.update(dt, time);

  const speed = controller.getSpeed();
  const altitude = controller.getAltitude();

  // Current-gen heli presentation: nav blink, rotor blur, exhaust, damage look.
  const missionHud = phase === 'playing' || phase === 'complete' || phase === 'failed'
    ? mission.getHudState()
    : null;
  updateHelicopterVisuals(heli, {
    dt,
    time,
    speed,
    boosting: controller.isBoosting(),
    health: missionHud?.health ?? controller.getHealth(),
    healthMax: missionHud?.healthMax ?? 100,
    cameraPosition: camera.position,
  });

  fx.update({
    dt,
    heliPos: heli.position,
    heliQuat: heli.quaternion,
    speed,
    altitude,
    getGroundHeight: world.getGroundHeight,
  });
  // Keep env density in sync with adaptive quality tier
  world.environment?.applyQuality(fx.quality.current);
  hud.tick(dt);

  // Soft follow shadow camera on heli — wider frustum for Fruzer map
  const shadowReach = Math.max(120, world.mapHalfExtent * 0.9);
  sunLight.position.set(
    heli.position.x + 80,
    55,
    heli.position.z - 60,
  );
  sunLight.target.position.copy(heli.position);
  sunLight.target.updateMatrixWorld();
  sunLight.shadow.camera.left = -shadowReach;
  sunLight.shadow.camera.right = shadowReach;
  sunLight.shadow.camera.top = shadowReach;
  sunLight.shadow.camera.bottom = -shadowReach;
  sunLight.shadow.camera.far = 350;
  sunLight.shadow.camera.updateProjectionMatrix();

  if (phase === 'playing') {
    const state = controller.getState();
    const outcome = mission.update(dt, time, heli, state.yaw, state.velocity);
    const impulse = mission.effects.consumeCameraImpulse(dt);
    if (impulse.trauma > 0.02) {
      controller.addCameraShake(impulse.trauma);
    }
    syncHud();
    const hudState = mission.getHudState();
    audio.updateFlight({
      speed,
      altitude,
      throttle: Math.min(1, speed / 55),
      boosting: controller.isBoosting(),
      verticalSpeed: state.velocity.y,
      healthRatio: hudState.health / Math.max(1, hudState.healthMax),
      aimLocked: hudState.aimLocked,
      position: { x: heli.position.x, y: heli.position.y, z: heli.position.z },
      velocity: {
        x: state.velocity.x,
        y: state.velocity.y,
        z: state.velocity.z,
      },
    });

    // Spatial world: drone flybys + inbound AA whoosh / cracks
    const hostiles = mission.enemies.enemies
      .filter((e) => e.alive && e.kind === 'drone')
      .map((e) => ({
        id: e.id,
        x: e.position.x,
        y: e.position.y,
        z: e.position.z,
      }));
    const inbound = [];
    for (const p of mission.weapons.activeProjectiles) {
      if (!p.alive || p.fromPlayer) continue;
      const id = p.mesh.uuid;
      const pt = {
        x: p.mesh.position.x,
        y: p.mesh.position.y,
        z: p.mesh.position.z,
        vx: p.velocity.x,
        vy: p.velocity.y,
        vz: p.velocity.z,
      };
      if (!heardBolts.has(id)) {
        heardBolts.add(id);
        audio.playAaFire(pt);
      }
      const dx = pt.x - heli.position.x;
      const dy = pt.y - heli.position.y;
      const dz = pt.z - heli.position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 18 * 18 && !whooshBolts.has(id)) {
        whooshBolts.add(id);
        inbound.push(pt);
      }
    }
    // Prune dead bolt ids occasionally
    if (heardBolts.size > 64) {
      const live = new Set(
        mission.weapons.activeProjectiles.map((p) => p.mesh.uuid),
      );
      for (const id of [...heardBolts]) {
        if (!live.has(id)) heardBolts.delete(id);
      }
      for (const id of [...whooshBolts]) {
        if (!live.has(id)) whooshBolts.delete(id);
      }
    }
    audio.updateWorld({
      dt,
      listener: { x: heli.position.x, y: heli.position.y, z: heli.position.z },
      listenerVelocity: {
        x: state.velocity.x,
        y: state.velocity.y,
        z: state.velocity.z,
      },
      hostiles,
      inbound,
    });

    if (outcome !== 'playing' && mission.summary) {
      finishMission(mission.summary);
    }
  } else if (phase === 'complete' || phase === 'failed') {
    // Drain residual combat FX / finale after mission ends
    mission.update(dt, time, heli, 0);
    const impulse = mission.effects.consumeCameraImpulse(dt);
    if (impulse.trauma > 0.02) {
      controller.addCameraShake(impulse.trauma);
    }
  }

  fx.render();
}

clock.start();
animate();

async function boot() {
  setLoadingText('Loading Fruzer Polygon map…');
  startBtn.textContent = 'LOADING…';

  try {
    world = await loadMapWorld(scene, (ratio) => {
      const pct = Math.round(ratio * 100);
      setLoadingText(`Loading Fruzer Polygon map… ${pct}%`);
    });

    sceneSetup.attachSky(world.sky);
    sceneSetup.attachSunDisc(world.sunDisc);

    setLoadingText('Loading helicopter…');
    heli = await loadHelicopter();
    scene.add(heli);

    controller = new HelicopterController(heli, camera, world.getGroundHeight);
    controller.setWorldBound(world.mapHalfExtent + 8);
    if (typeof controller.setMaxAltitude === 'function') {
      controller.setMaxAltitude(Math.max(200, world.bounds.max.y + 80));
    }
    if (world.collision) {
      world.collision.attachDebug(scene);
      world.collision.setGroundHeightSampler(world.getGroundHeight);
      controller.setWorldCollision(world.collision);

      world.collision.onProximity = (warning) => {
        if (phase !== 'playing') return;
        if (warning.level >= 3) {
          hud.toast('TERRAIN ALERT', 0.7);
        } else if (warning.level === 2 && warning.ahead) {
          hud.toast('OBSTACLE AHEAD', 0.65);
        }
      };
      world.collision.onPropDestroyed = () => {
        if (phase !== 'playing') return;
        hud.toast('PROP DESTROYED', 0.9);
        audio.playImpact(0.45, 'soft');
        controller.addCameraShake(0.22);
      };
    }
    controller.reset(world.spawnPosition);

    const ringLayout = buildFigureEightRingLayout(
      world.getGroundHeight,
      world.mapHalfExtent,
      10,
    );
    checkpoints = new CheckpointSystem(scene, ringLayout);
    mission = new CombatMission(
      scene,
      {
        getGroundHeight: world.getGroundHeight,
        mapHalfExtent: world.mapHalfExtent,
        spawn: world.spawnPosition.clone(),
        combatSpaces: world.environment?.combatSpaces,
      },
      checkpoints,
    );
    world.environment?.applyQuality(fx.quality.current);
    mission.setEffectsCamera(camera);
    mission.applyQuality(fx.quality.current);
    fx.quality.onChange((q) => mission.applyQuality(q));
    hud = new HUD(checkpoints.total);
    hud.enableCombatHud(true);
    hud.bindMuteHandler((muted) => audio.setMuted(muted));
    hud.onWeaponReadyChange = (ready) => audio.notifyWeaponReady(ready);

    mission.onEvent((event) => {
      switch (event.type) {
        case 'fire':
          audio.playWeaponFire();
          break;
        case 'hit': {
          hud.setCrosshairState('hit', 180);
          const hp = event.enemy.position;
          audio.playWeaponHit({ x: hp.x, y: hp.y, z: hp.z });
          break;
        }
        case 'kill': {
          hud.setCrosshairState('hit', 260);
          const kp = event.enemy.position;
          audio.playExplosion(event.primary ? 1.35 : 1, {
            x: kp.x,
            y: kp.y,
            z: kp.z,
          });
          audio.playCombo(event.combo);
          if (event.primary) {
            hud.toast(`DEPOT DOWN · +${event.points}`, 1.5);
            audio.playRadio('depot-down', 'DEPOT DOWN');
            audio.setMusicIntensity('combat');
          } else {
            audio.playRadio('target-down', 'SPLASH');
          }
          break;
        }
        case 'damage':
          hud.flashDamage(event.amount / 20);
          audio.playDamage();
          controller.addCameraShake(Math.min(0.8, event.amount / 30));
          if (event.remaining <= 30 && event.remaining > 0) {
            hud.toast('HULL CRITICAL', 1.2);
            audio.playRadio('hull-critical', 'HULL CRITICAL');
            audio.setMusicIntensity('critical');
          }
          break;
        case 'ring':
          hud.pulseRingCollect();
          audio.playRingCollect();
          hud.toast(`RING · +${event.points} · HULL +8`, 1.2);
          break;
        case 'nearMiss':
          hud.toast(`NEAR MISS · +${event.points}`, 0.9);
          audio.playRadio('near-miss', 'NEAR MISS');
          audio.playWarning('incoming');
          break;
        case 'toast':
          hud.toast(event.message);
          break;
      }
    });

    controller.onImpact = (intensity, damage, info) => {
      const source =
        info?.source === 'prop'
          ? info.destroyedProp
            ? 'prop-destroy'
            : 'prop-impact'
          : info?.source === 'building'
            ? info.crash
              ? 'building-crash'
              : info.scrape
                ? 'building-scrape'
                : 'building-impact'
            : 'hard-landing';
      if (damage > 0) mission.applyExternalDamage(damage, source);
      if (info?.destroyedProp) {
        audio.playImpact(Math.max(0.35, intensity), 'hard');
        return;
      }
      if (info?.scrape && !info.crash) {
        audio.playImpact(Math.max(0.25, intensity), damage > 0 ? 'soft' : 'soft');
      } else {
        audio.playImpact(
          intensity,
          damage > 8 || info?.crash ? 'damage' : 'hard',
        );
      }
    };

    // Collision debug: ?debugCollision=1 or press C
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyC' || e.repeat) return;
      if (!world.collision) return;
      const on = world.collision.toggleDebug();
      hud.toast(on ? 'COLLISION DEBUG ON' : 'COLLISION DEBUG OFF', 1.2);
      if (on) {
        const s = world.collision.getStats();
        console.info('[collision] debug', s);
      }
    });

    // V = dump collision coverage / cost snapshot
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyV' || e.repeat) return;
      if (!world.collision) return;
      const s = world.collision.getStats();
      console.info('[collision] coverage', s);
      hud.toast(
        `COL ${s.activeColliders}/${s.colliderCount} · Q${s.lastQueryCount} · ${s.lastResolveMs.toFixed(2)}ms`,
        1.6,
      );
    });

    mobileControls = new MobileControls({
      setInput: (input) => controller.setTouchInput(input),
      clearInput: () => controller.clearTouchInput(),
      onRestart: () => {
        if (phase === 'playing' || phase === 'complete' || phase === 'failed') {
          restartGame();
        }
      },
      onFireChange: (held) => mission.weapons.setFireHeld(held),
      onUiTap: () => audio.playUISelect(),
    });

    ready = true;
    phase = 'start';
    setLoadingText('');
    startBtn.disabled = false;
    startBtn.textContent = 'START STRIKE';
  } catch (err) {
    console.error(err);
    setLoadingText('Failed to load map. Check console / refresh.');
    startBtn.textContent = 'LOAD FAILED';
  }
}

boot();
