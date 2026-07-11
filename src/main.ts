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
  startOverlay.classList.add('hidden');
  completeOverlay.classList.add('hidden');
  hud.resetVisuals();
  hud.enableCombatHud(true);
  hud.show();
  syncHud();
  hud.toast('STRIKE RUN · DESTROY THE DEPOTS', 2.2);
  mobileControls.show();
  void audio.resume();
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
    syncHud();
    audio.updateFlight({
      speed,
      altitude,
      throttle: Math.min(1, speed / 55),
      boosting: controller.isBoosting(),
    });

    if (outcome !== 'playing' && mission.summary) {
      finishMission(mission.summary);
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
      controller.setWorldCollision(world.collision);
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
    hud = new HUD(checkpoints.total);
    hud.enableCombatHud(true);
    hud.bindMuteHandler((muted) => audio.setMuted(muted));
    hud.onWeaponReadyChange = (ready) => audio.notifyWeaponReady(ready);

    mission.onEvent((event) => {
      switch (event.type) {
        case 'fire':
          audio.playWeaponFire();
          break;
        case 'hit':
          hud.setCrosshairState('hit', 180);
          audio.playWeaponHit();
          break;
        case 'kill':
          hud.setCrosshairState('hit', 260);
          audio.playExplosion();
          audio.playCombo(event.combo);
          if (event.primary) hud.toast(`DEPOT DOWN · +${event.points}`, 1.5);
          break;
        case 'damage':
          hud.flashDamage(event.amount / 20);
          audio.playDamage();
          controller.addCameraShake(Math.min(0.8, event.amount / 30));
          if (event.remaining <= 30 && event.remaining > 0) {
            hud.toast('HULL CRITICAL', 1.2);
          }
          break;
        case 'ring':
          hud.pulseRingCollect();
          audio.playRingCollect();
          hud.toast(`RING · +${event.points} · HULL +8`, 1.2);
          break;
        case 'nearMiss':
          hud.toast(`NEAR MISS · +${event.points}`, 0.9);
          break;
        case 'toast':
          hud.toast(event.message);
          break;
      }
    });

    controller.onImpact = (intensity, damage, info) => {
      const source =
        info?.source === 'building'
          ? info.crash
            ? 'building-crash'
            : info.scrape
              ? 'building-scrape'
              : 'building-impact'
          : 'hard-landing';
      if (damage > 0) mission.applyExternalDamage(damage, source);
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
