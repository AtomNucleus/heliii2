import * as THREE from 'three';
import { createSceneSetup } from './scene/setup';
import { loadMapWorld, buildFigureEightRingLayout, type WorldObjects } from './world/mapLoader';
import { updateWater } from './world/generate';
import { createHelicopter } from './models/helicopter';
import { HelicopterController } from './helicopter/controller';
import { CheckpointSystem } from './rings/checkpoints';
import { HUD } from './hud/hud';
import { createPostProcessing, ExhaustParticles } from './effects/postprocessing';

type GamePhase = 'loading' | 'start' | 'playing' | 'complete';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const startOverlay = document.getElementById('start-overlay')!;
const completeOverlay = document.getElementById('complete-overlay')!;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn')!;
const finalTimeEl = document.getElementById('final-time')!;
const loadingStatus = document.getElementById('loading-status');

const { scene, camera, renderer, sunLight } = createSceneSetup(canvas);

let world: WorldObjects;
let controller: HelicopterController;
let checkpoints: CheckpointSystem;
let hud: HUD;
let heli: THREE.Group;
let exhaust: ExhaustParticles;
const { composer } = createPostProcessing(renderer, scene, camera);

let phase: GamePhase = 'loading';
let elapsed = 0;
let clock = new THREE.Clock();
let ready = false;

function setLoadingText(msg: string) {
  if (loadingStatus) loadingStatus.textContent = msg;
}

function startGame() {
  if (!ready || phase === 'loading') return;
  phase = 'playing';
  elapsed = 0;
  checkpoints.reset();
  controller.reset(world.spawnPosition);
  controller.enabled = true;
  startOverlay.classList.add('hidden');
  completeOverlay.classList.add('hidden');
  hud.show();
  hud.update(0, 0, controller.getAltitude(), 0);
  clock.start();
}

function completeGame() {
  phase = 'complete';
  controller.enabled = false;
  finalTimeEl.textContent = hud.formatTime(elapsed);
  completeOverlay.classList.remove('hidden');
}

function restartGame() {
  completeOverlay.classList.add('hidden');
  startGame();
}

startBtn.disabled = true;
startBtn.addEventListener('click', () => {
  if (phase === 'start') startGame();
});
restartBtn.addEventListener('click', () => restartGame());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && phase === 'start') {
    startGame();
  }
  if (e.code === 'KeyR' && (phase === 'playing' || phase === 'complete')) {
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
    composer.render();
    return;
  }

  controller.update(dt);
  checkpoints.update(time);
  if (world.water) updateWater(world.water, time);
  exhaust.update(dt, heli.position, heli.quaternion, controller.getSpeed());

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
    elapsed += dt;
    checkpoints.tryCollect(heli.position);
    hud.update(elapsed, controller.getSpeed(), controller.getAltitude(), checkpoints.collectedCount);

    if (checkpoints.complete) {
      completeGame();
    }
  }

  composer.render();
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

    heli = createHelicopter();
    scene.add(heli);

    controller = new HelicopterController(heli, camera, world.getGroundHeight);
    controller.setWorldBound(world.mapHalfExtent + 8);
    controller.reset(world.spawnPosition);

    const ringLayout = buildFigureEightRingLayout(
      world.getGroundHeight,
      world.mapHalfExtent,
      10,
    );
    checkpoints = new CheckpointSystem(scene, ringLayout);
    hud = new HUD(checkpoints.total);
    exhaust = new ExhaustParticles(scene);

    ready = true;
    phase = 'start';
    setLoadingText('');
    startBtn.disabled = false;
    startBtn.textContent = 'START FLIGHT';
  } catch (err) {
    console.error(err);
    setLoadingText('Failed to load map. Check console / refresh.');
    startBtn.textContent = 'LOAD FAILED';
  }
}

boot();
