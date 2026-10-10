import * as THREE from 'three';
import './style.css';
import { makeAircraft } from './aircraft';
import { FlightAudio } from './audio';
import { Controls, type FlightAction } from './controls';
import {
  clamp,
  course,
  createFlight,
  damp,
  formatTime,
  islands,
  segmentHitsRing,
  speedOf,
  STEP,
  stepFlight,
  terrainHeight,
} from './flight';
import { loadPreferences, savePreferences } from './preferences';
import { createWorld } from './world';

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const app = element('app'),
  canvas = element<HTMLCanvasElement>('world');
const home = element('home'),
  hud = element('hud');
const pauseDialog = element<HTMLDialogElement>('pause-dialog');
const resultDialog = element<HTMLDialogElement>('result-dialog');
const settingsDialog = element<HTMLDialogElement>('settings-dialog');
const guideDialog = element<HTMLDialogElement>('guide-dialog');
const preferences = loadPreferences();
const audio = new FlightAudio();
type Phase = 'loading' | 'home' | 'flying' | 'paused' | 'result' | 'error';
type Mode = 'course' | 'free';
let phase: Phase = 'loading',
  mode: Mode = 'course',
  state = createFlight();
let checkpoint = 0,
  elapsed = 0,
  accumulator = 0,
  cameraMode = 0,
  toastUntil = 0,
  cameraShake = 0;
let world: ReturnType<typeof createWorld>, aircraft: ReturnType<typeof makeAircraft>;
let renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9baea6, 0.0015);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.15, 2600);
const cameraAim = new THREE.Vector3(),
  desiredCamera = new THREE.Vector3(),
  desiredAim = new THREE.Vector3();
const controls = new Controls(handleAction);
const radar = element<HTMLCanvasElement>('radar').getContext('2d');
const progress = element('course-progress');
progress.innerHTML = course.map(() => '<i></i>').join('');
const instrument = {
  speed: element('speed'),
  altitude: element('altitude'),
  heading: element('heading'),
  clock: element('flight-clock'),
  speedBar: element('speed-bar'),
  altitudeBar: element('altitude-bar'),
  hullBar: element('hull-bar'),
  hullLabel: element('hull-label'),
  objectiveLabel: element('objective-label'),
  objectiveTitle: element('objective-title'),
  distance: element('objective-distance'),
  arrow: element('target-arrow'),
  assist: element('assist-label'),
};

function setPhase(next: Phase) {
  phase = next;
  app.dataset.phase = next;
  controls.setEnabled(next === 'flying');
  audio.setActive(next === 'flying');
}
function toast(message: string, seconds = 3) {
  element('toast').textContent = message;
  element('toast').classList.add('visible');
  toastUntil = performance.now() + seconds * 1000;
}
function applySettings() {
  audio.settings(preferences.volume, preferences.muted);
  element('sound-label').textContent = preferences.muted ? 'SOUND OFF' : 'SOUND ON';
  element('sound-btn').classList.toggle('muted', preferences.muted);
  element('sound-btn').setAttribute(
    'aria-label',
    preferences.muted ? 'Unmute sound' : 'Mute sound',
  );
  document.body.classList.toggle('reduced-motion', preferences.reducedMotion);
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, preferences.quality === 'high' ? 1.75 : 1));
    renderer.shadowMap.enabled = preferences.quality === 'high';
    renderer.setSize(innerWidth, innerHeight);
  }
  savePreferences(preferences);
}
function pause() {
  if (phase !== 'flying') return;
  setPhase('paused');
  pauseDialog.showModal();
}
function resume() {
  if (phase !== 'paused') return;
  pauseDialog.close();
  setPhase('flying');
  void audio.unlock();
  accumulator = 0;
}
function closeDialogs() {
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((dialog) => dialog.close());
}
function launch() {
  if (!renderer || phase === 'error' || phase === 'loading') return;
  closeDialogs();
  state = createFlight();
  checkpoint = 0;
  elapsed = 0;
  accumulator = 0;
  cameraShake = 0;
  cameraMode = 0;
  home.hidden = true;
  hud.hidden = false;
  document.body.classList.add('flying');
  camera.clearViewOffset();
  camera.fov = 52;
  camera.updateProjectionMatrix();
  camera.position.set(0, state.position.y + 5, state.position.z + 17);
  cameraAim.set(0, state.position.y, state.position.z - 8);
  setPhase('flying');
  element('mode-label').textContent = mode === 'course' ? 'COASTAL RUN' : 'FREE FLIGHT';
  void audio.unlock().then((enabled) => {
    if (enabled && phase === 'flying') {
      audio.setActive(true);
      audio.cue('start');
    } else if (!enabled) toast('Audio unavailable — you can still fly.');
  });
  toast(
    mode === 'course'
      ? 'You have the controls. First ring straight ahead.'
      : 'No destination needed. Enjoy the coast.',
    5,
  );
  updateHud();
}
function returnHome() {
  closeDialogs();
  home.hidden = false;
  hud.hidden = true;
  document.body.classList.remove('flying');
  setPhase('home');
  state = createFlight();
  cameraMode = 0;
  setMenuCamera();
  element('toast').classList.remove('visible');
  element<HTMLButtonElement>('launch-btn').focus();
}
function finish(success: boolean) {
  setPhase('result');
  if (success && (preferences.bestTime === null || elapsed < preferences.bestTime)) {
    preferences.bestTime = elapsed;
    savePreferences(preferences);
  }
  element('result-eyebrow').textContent = success ? 'COASTAL RUN COMPLETE' : 'FLIGHT ENDED';
  element('result-title').textContent = success ? 'Beautifully flown.' : 'A little too close.';
  element('result-copy').textContent = success
    ? 'Eight checkpoints. One unforgettable coast.'
    : 'Even good pilots have rough landings. Take another flight.';
  element('result-time').textContent = formatTime(elapsed);
  element('result-hull').textContent = `${Math.round(state.integrity)}%`;
  element('result-best').textContent =
    preferences.bestTime === null ? '—' : formatTime(preferences.bestTime);
  audio.cue(success ? 'complete' : 'impact');
  resultDialog.showModal();
}
function handleAction(action: FlightAction) {
  if (action === 'mute') {
    preferences.muted = !preferences.muted;
    applySettings();
    if (!preferences.muted) void audio.unlock();
  }
  if (action === 'pause') {
    if (settingsDialog.open) settingsDialog.close();
    else if (guideDialog.open) guideDialog.close();
    else if (phase === 'paused') resume();
    else pause();
  }
  if (action === 'restart' && (phase === 'flying' || phase === 'paused' || phase === 'result'))
    launch();
  if (action === 'camera' && phase === 'flying') {
    cameraMode = (cameraMode + 1) % 3;
    toast(['Chase camera', 'Cockpit view', 'Wide camera'][cameraMode], 1.5);
  }
}
function openPanel(dialog: HTMLDialogElement) {
  if (phase === 'flying') pause();
  if (!dialog.open) dialog.showModal();
}
element('launch-btn').addEventListener('click', launch);
element('pause-btn').addEventListener('click', pause);
element('resume-btn').addEventListener('click', resume);
element('restart-btn').addEventListener('click', launch);
element('again-btn').addEventListener('click', launch);
element('home-btn').addEventListener('click', returnHome);
element('result-home-btn').addEventListener('click', returnHome);
element('sound-btn').addEventListener('click', () => handleAction('mute'));
element('guide-btn').addEventListener('click', () => openPanel(guideDialog));
element('settings-btn').addEventListener('click', () => openPanel(settingsDialog));
element('pause-settings-btn').addEventListener('click', () => openPanel(settingsDialog));
element('retry-btn').addEventListener('click', () => location.reload());
pauseDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  resume();
});
resultDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  returnHome();
});
document
  .querySelectorAll<HTMLButtonElement>('.dialog-close')
  .forEach((button) => button.addEventListener('click', () => button.closest('dialog')!.close()));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) =>
  button.addEventListener('click', () => {
    mode = button.dataset.mode as Mode;
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((card) => {
      const selected = card === button;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }),
);
const volume = element<HTMLInputElement>('volume'),
  sensitivity = element<HTMLInputElement>('sensitivity'),
  quality = element<HTMLSelectElement>('quality'),
  reduced = element<HTMLInputElement>('reduced-motion');
volume.value = String(preferences.volume * 100);
sensitivity.value = String(preferences.sensitivity * 100);
quality.value = preferences.quality;
reduced.checked = preferences.reducedMotion;
volume.addEventListener('input', () => {
  preferences.volume = Number(volume.value) / 100;
  applySettings();
});
sensitivity.addEventListener('input', () => {
  preferences.sensitivity = Number(sensitivity.value) / 100;
  applySettings();
});
quality.addEventListener('change', () => {
  preferences.quality = quality.value as 'high' | 'low';
  applySettings();
});
reduced.addEventListener('change', () => {
  preferences.reducedMotion = reduced.checked;
  applySettings();
});
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function setMenuCamera() {
  camera.fov = innerWidth < 600 ? 53 : 40;
  camera.setViewOffset(
    innerWidth,
    innerHeight,
    -innerWidth * (innerWidth < 800 ? 0.12 : 0.22),
    0,
    innerWidth,
    innerHeight,
  );
  camera.updateProjectionMatrix();
  camera.position.set(12, state.position.y + 6, 26);
  cameraAim.set(0, state.position.y, 45);
}
window.addEventListener('resize', () => {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  renderer.setSize(innerWidth, innerHeight);
  if (phase === 'home') setMenuCamera();
  else camera.updateProjectionMatrix();
});

function updateHud() {
  const speed = speedOf(state),
    altitude = Math.max(0, state.position.y - terrainHeight(state.position.x, state.position.z));
  instrument.speed.textContent = String(Math.round(speed * 3.6)).padStart(3, '0');
  instrument.altitude.textContent = String(Math.round(altitude)).padStart(3, '0');
  instrument.clock.textContent = formatTime(elapsed);
  const heading = ((((-state.yaw * 180) / Math.PI) % 360) + 360) % 360;
  instrument.heading.textContent = `${Math.round(heading).toString().padStart(3, '0')}° ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(heading / 45) % 8]}`;
  instrument.speedBar.style.width = `${Math.min(100, (speed / 70) * 100)}%`;
  instrument.altitudeBar.style.width = `${Math.min(100, (altitude / 160) * 100)}%`;
  instrument.hullLabel.textContent = `${Math.round(state.integrity)}%`;
  instrument.hullBar.style.width = `${state.integrity}%`;
  instrument.hullBar.style.background = state.integrity < 35 ? '#ff9e7e' : '';
  const ring = course[checkpoint];
  if (mode === 'course' && ring) {
    instrument.objectiveLabel.textContent = `CHECKPOINT ${String(checkpoint + 1).padStart(2, '0')} / 08`;
    instrument.objectiveTitle.textContent = ring.name;
    const distance = Math.hypot(ring.x - state.position.x, ring.z - state.position.z);
    const heightDifference = ring.y - state.position.y;
    instrument.distance.textContent = `${Math.round(distance)} m away · ${heightDifference > 3 ? `climb ${Math.round(heightDifference)} m` : heightDifference < -3 ? `descend ${Math.round(-heightDifference)} m` : 'altitude on target'}`;
    let bearing =
      Math.atan2(-(ring.x - state.position.x), -(ring.z - state.position.z)) - state.yaw;
    bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
    instrument.arrow.hidden = false;
    instrument.arrow.style.transform = `translateX(-50%) rotate(${(-bearing * 180) / Math.PI}deg)`;
    progress.hidden = false;
    progress.querySelectorAll('i').forEach((dot, i) => {
      dot.className = i < checkpoint ? 'done' : i === checkpoint ? 'active' : '';
    });
  } else {
    instrument.objectiveLabel.textContent = 'THE HORIZON IS YOURS';
    instrument.objectiveTitle.textContent = 'Stay a little longer.';
    instrument.distance.textContent = 'Explore freely · R to start fresh';
    instrument.arrow.hidden = true;
    progress.hidden = true;
  }
  const input = controls.read();
  instrument.assist.textContent = input.boost
    ? '● BOOST ACTIVE'
    : Math.abs(input.lift) > 0.1
      ? '● COLLECTIVE'
      : '● HOVER ASSIST';
  if (radar) {
    const ctx = radar;
    ctx.clearRect(0, 0, 240, 240);
    ctx.save();
    ctx.translate(120, 120);
    ctx.strokeStyle = '#cfe8c025';
    ctx.lineWidth = 1;
    for (const radius of [38, 76, 112]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-112, 0);
    ctx.lineTo(112, 0);
    ctx.moveTo(0, -112);
    ctx.lineTo(0, 112);
    ctx.stroke();
    ctx.save();
    ctx.rotate(-state.yaw);
    ctx.scale(0.25, 0.25);
    ctx.translate(-state.position.x, -state.position.z);
    ctx.fillStyle = '#c2d4b433';
    islands.forEach((island) => {
      ctx.beginPath();
      ctx.ellipse(island.x, island.z, island.rx, island.rz, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    if (mode === 'course') {
      ctx.strokeStyle = '#d6f58c40';
      ctx.lineWidth = 3;
      ctx.beginPath();
      course.forEach((point, i) =>
        i ? ctx.lineTo(point.x, point.z) : ctx.moveTo(point.x, point.z),
      );
      ctx.stroke();
      course.forEach((point, i) => {
        if (i < checkpoint) return;
        ctx.fillStyle = i === checkpoint ? '#d6f58c' : '#eff5da66';
        ctx.beginPath();
        ctx.arc(point.x, point.z, i === checkpoint ? 15 : 9, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
    ctx.fillStyle = '#f3f5e5';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function graphicsFailure(message?: string) {
  closeDialogs();
  setPhase('error');
  home.hidden = hud.hidden = true;
  element('error-screen').hidden = false;
  if (message) element('error-copy').textContent = message;
}
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  graphicsFailure(
    'The graphics connection was interrupted. Close other GPU-heavy tabs, then try again.',
  );
});

function initialize() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.debug.onShaderError = () =>
    graphicsFailure(
      'The graphics could not render on this device. Try a current browser with hardware acceleration enabled.',
    );
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  applySettings();
  scene.add(new THREE.HemisphereLight(0xc7e4dc, 0x526951, 2.2));
  sun = new THREE.DirectionalLight(0xffdfb0, 3.5);
  sun.position.set(-90, 150, -130);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -90;
  sun.shadow.camera.right = sun.shadow.camera.top = 90;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  world = createWorld(scene);
  aircraft = makeAircraft();
  scene.add(aircraft.craft);
  setMenuCamera();
  setPhase('home');
  element<HTMLButtonElement>('launch-btn').disabled = false;
  element('launch-label').textContent = 'Take flight';
  requestAnimationFrame(frame);
}
let lastTime = 0,
  visualTime = 0,
  hudTime = 0;
function frame(time: number) {
  if (phase === 'error') return;
  const dt = Math.min(0.1, lastTime ? (time - lastTime) / 1000 : 1 / 60);
  lastTime = time;
  visualTime += dt;
  controls.pollGamepad();
  const input = controls.read();
  if (phase === 'flying') {
    accumulator += dt;
    while (accumulator >= STEP && phase === 'flying') {
      const previous = { ...state.position };
      const damage = stepFlight(state, input, STEP, world.obstacles, preferences.sensitivity);
      elapsed += STEP;
      accumulator -= STEP;
      if (damage > 0) {
        audio.cue('impact');
        cameraShake = 0.65;
        toast(
          state.integrity < 35
            ? 'Airframe critical. Slow down and gain altitude.'
            : 'Close call. Give the terrain a little room.',
        );
      }
      if (state.integrity <= 0) {
        finish(false);
        break;
      }
      if (mode === 'course' && segmentHitsRing(previous, state.position, checkpoint)) {
        checkpoint++;
        audio.cue('checkpoint');
        toast(`Checkpoint ${checkpoint} / 8 · nicely done.`, 2);
        if (checkpoint === course.length) finish(true);
      }
    }
    audio.update(
      speedOf(state),
      state.position.y - terrainHeight(state.position.x, state.position.z),
      input,
      state.yawRate,
      cameraMode === 1,
    );
  }
  const craft = aircraft.craft;
  craft.position.set(state.position.x, state.position.y, state.position.z);
  craft.rotation.set(state.pitch, state.yaw, state.bank, 'YXZ');
  if (phase === 'home') {
    craft.rotation.y = -0.35;
    craft.position.y += Math.sin(visualTime * 1.1) * (preferences.reducedMotion ? 0 : 0.16);
  }
  craft.visible = cameraMode !== 1 || phase === 'home';
  aircraft.update(visualTime, phase === 'home' ? 24 : input.boost ? 42 : 34);
  if (phase === 'home') {
    const drift = preferences.reducedMotion ? 0 : Math.sin(visualTime * 0.13) * 0.7;
    camera.position.set(12 + drift, state.position.y + 6, 26);
    camera.lookAt(cameraAim);
  } else {
    const sin = Math.sin(state.yaw),
      cos = Math.cos(state.yaw),
      speed = speedOf(state);
    if (cameraMode === 1) {
      desiredCamera.copy(craft.position).add(new THREE.Vector3(-sin * 1.55, 0.45, -cos * 1.55));
      desiredAim
        .copy(craft.position)
        .add(new THREE.Vector3(-sin * 80, 0.2 - state.pitch * 30, -cos * 80));
      camera.position.copy(desiredCamera);
      cameraAim.copy(desiredAim);
    } else {
      const distance = cameraMode === 2 ? 31 : 16 + (preferences.reducedMotion ? 0 : speed * 0.055);
      desiredCamera.set(
        state.position.x + sin * distance,
        state.position.y + (cameraMode === 2 ? 18 : 6),
        state.position.z + cos * distance,
      );
      desiredCamera.y = Math.max(
        desiredCamera.y,
        terrainHeight(desiredCamera.x, desiredCamera.z) + 4,
      );
      desiredAim.set(
        state.position.x - sin * 10,
        state.position.y + 1,
        state.position.z - cos * 10,
      );
      camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 4));
      cameraAim.lerp(desiredAim, 1 - Math.exp(-dt * 5));
    }
    cameraShake = damp(cameraShake, 0, 5, dt);
    if (!preferences.reducedMotion && cameraShake > 0.01) {
      camera.position.x += Math.sin(time * 0.04) * cameraShake * 0.2;
      camera.position.y += Math.sin(time * 0.063) * cameraShake * 0.12;
    }
    camera.lookAt(cameraAim);
    camera.fov = damp(
      camera.fov,
      cameraMode === 1 ? 65 : 52 + (preferences.reducedMotion ? 0 : clamp(speed / 8, 0, 8)),
      3,
      dt,
    );
    camera.updateProjectionMatrix();
  }
  sun.position.set(craft.position.x - 90, craft.position.y + 150, craft.position.z - 130);
  sun.target.position.copy(craft.position);
  world.update(
    visualTime,
    camera,
    craft.position,
    checkpoint,
    phase !== 'home' && mode === 'course',
  );
  renderer.render(scene, camera);
  hudTime += dt;
  if (hudTime > 0.08 && phase !== 'home') {
    updateHud();
    hudTime = 0;
  }
  if (time > toastUntil) element('toast').classList.remove('visible');
  app.dataset.checkpoint = String(checkpoint);
  app.dataset.altitude = state.position.y.toFixed(2);
  app.dataset.speed = speedOf(state).toFixed(2);
  app.dataset.audio = audio.available ? 'ready' : 'locked';
  requestAnimationFrame(frame);
}

// Retire caches from the previous app instead of letting an obsolete worker serve the old game.
if ('serviceWorker' in navigator)
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations
          .filter((r) => r.scope === new URL('./', location.href).href)
          .map((r) => r.unregister()),
      ),
    )
    .catch(() => {});
try {
  initialize();
} catch (error) {
  console.error('Flight initialization failed:', error);
  graphicsFailure();
}
