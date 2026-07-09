import * as THREE from 'three';
import { createSceneSetup } from './scene/setup';
import { generateWorld, updateWater } from './world/generate';
import { loadHelicopter } from './models/helicopter';
import { HelicopterController } from './helicopter/controller';
import { CheckpointSystem } from './rings/checkpoints';
import { HUD } from './hud/hud';
import { createPostProcessing, ExhaustParticles } from './effects/postprocessing';

type GamePhase = 'start' | 'playing' | 'complete';

async function init() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const startOverlay = document.getElementById('start-overlay')!;
  const completeOverlay = document.getElementById('complete-overlay')!;
  const startBtn = document.getElementById('start-btn')!;
  const restartBtn = document.getElementById('restart-btn')!;
  const finalTimeEl = document.getElementById('final-time')!;

  // Optional loading hint on the start overlay
  const loadingHint = document.createElement('p');
  loadingHint.textContent = 'Loading helicopter…';
  loadingHint.style.opacity = '0.7';
  startOverlay.appendChild(loadingHint);
  startBtn.setAttribute('disabled', 'true');

  const { scene, camera, renderer, sunLight } = createSceneSetup(canvas);
  const world = generateWorld(scene);

  const heli = await loadHelicopter();
  scene.add(heli);

  loadingHint.remove();
  startBtn.removeAttribute('disabled');

  const controller = new HelicopterController(heli, camera, world.getGroundHeight);
  controller.reset(world.spawnPosition);

  const checkpoints = new CheckpointSystem(scene);
  const hud = new HUD(checkpoints.total);
  const { composer } = createPostProcessing(renderer, scene, camera);
  const exhaust = new ExhaustParticles(scene);

  let phase: GamePhase = 'start';
  let elapsed = 0;
  let clock = new THREE.Clock();

  function startGame() {
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

    controller.update(dt);
    checkpoints.update(time);
    updateWater(world.water, time);
    exhaust.update(dt, heli.position, heli.quaternion, controller.getSpeed());

    sunLight.position.set(
      heli.position.x + 80,
      45,
      heli.position.z - 60,
    );
    sunLight.target.position.copy(heli.position);
    sunLight.target.updateMatrixWorld();

    if (phase === 'playing') {
      elapsed += dt;
      if (checkpoints.tryCollect(heli.position)) {
        // brief visual feedback via bloom is enough
      }
      hud.update(elapsed, controller.getSpeed(), controller.getAltitude(), checkpoints.collectedCount);

      if (checkpoints.complete) {
        completeGame();
      }
    }

    composer.render();
  }

  clock.start();
  animate();
}

init().catch((err) => {
  console.error('Failed to init HELI SUNSET', err);
});
