# HELIOS — Flight Lab

A ground-up helicopter flight experience for the browser, built with TypeScript, Three.js, and Vite. All world geometry, aircraft details, ocean shaders, and audio are generated locally. No downloaded models, WASM physics boot, or asset-loading screens.

## Run

Requires Node.js 22 or later.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

```sh
npm run lint
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run smoke-test
```

`npm run preview` serves the production build. The existing Netlify configuration builds and publishes `dist`. Nothing is automatically deployed or merged.

## The experience

- **Coastal run:** an eight-ring circuit through the Aster archipelago. Swept ring-plane detection prevents missed checkpoints at high speed. Finish with the fastest time you can while protecting your airframe; the best completed time stays on your device.
- **Free flight:** explore the islands, headlands, fishing boats, lighthouse, and hangar without a course or time limit.
- **H-01 Kestrel:** a procedural twin-turbine helicopter with cockpit glazing, skids, tail boom, four-blade main rotor, tail rotor, and navigation lights.
- **Atmosphere:** animated water with shallow-water coloring, Fresnel reflections and sun highlights, vertex-colored coastal terrain, instanced vegetation, shoreline foam, moving birds, and rotor-wash dust/spray.
- **Sound:** synthesized rotor pulses, turbine harmonics, filtered wind, stereo response, collective/boost load, cockpit filtering, and flight cues. Sound starts only after a user gesture. Pause and backgrounding fade out engine/wind; mute and volume are persistent.

## Controls

| Input          | Action                        |
| -------------- | ----------------------------- |
| W / S or ↑ / ↓ | Forward / brake and reverse   |
| A / D or ← / → | Turn left / right             |
| Space / Ctrl   | Climb / descend               |
| Shift          | Boost                         |
| C              | Chase / cockpit / wide camera |
| Esc or P       | Pause / resume                |
| R              | Restart flight                |
| M              | Mute / unmute                 |

Touch: left thumb pad steers and moves; right pad controls altitude. Boost and camera buttons sit between them. Pads handle pointer capture, release, and cancellation.

Standard-mapped gamepad: left stick flies, right stick Y controls altitude, right trigger boosts, Y changes camera, Start pauses/resumes. Stick deadzones reject controller drift. Physical gamepad behavior requires hardware verification.

## Flight model

The simulation uses a fixed **120 Hz** timestep with a capped render accumulator. Rotor thrust tilts with cyclic pitch and bank to create forward and lateral motion, while the AFCS holds altitude and flares toward a stop when controls are released. Ground effect boosts lift near the surface, translational lift builds in forward flight, and deterministic coastal wind adds drift and weathercock response. This remains an approachable flight game, not an aeronautical simulator.

Terrain uses the same height function for rendered geometry and collision. Static structures have hull-expanded colliders with separation, rebound, impact-speed damage, and a cooldown. Gentle landings preserve the airframe. Flight altitude and world distance are bounded. Losing focus automatically pauses and clears held inputs.

## Device settings and accessibility

Volume/mute, steering sensitivity, high/performance graphics, reduced motion, and the best course time are validated and persisted under `helios-flight-v1`. Storage failures never block flight. System reduced-motion preference initializes the setting. Reduced motion disables camera shake, menu bob/drift, and speed-based zoom. Performance mode disables shadows and limits pixel ratio.

Semantic buttons, visible keyboard focus, native modal focus management, a flight manual, textual instruments, and live-status toasts accompany the 3D view. WebGL2 is required; initialization/context-loss failures present a retry screen rather than an endless loader. Fonts have system fallbacks.

## Scope of the reset

This replaces the old game code, imported assets, combat, map loader, PWA/offline worker, old progression system, and outdated tests/documentation. Existing service-worker registrations for this app scope are retired on first load. The repo history, CI workflow, lint tooling, and Netlify build configuration are retained. PWA installation/offline precaching and combat are not part of this rebuild.

## Source layout

- `src/main.ts`: lifecycle, cameras, HUD, dialogs, and render loop
- `src/flight.ts`: pure flight dynamics, terrain, course, and checkpoint math
- `src/world.ts`: procedural coastal world and water/sky shaders
- `src/aircraft.ts`: Kestrel geometry and rotor animation
- `src/controls.ts`: keyboard, touch, and gamepad input
- `src/audio.ts`: Web Audio synthesis and mixer
- `src/preferences.ts`: validated local settings
- `src/flight.test.ts`: physics, route, controller, and persistence tests
- `e2e/`: desktop and touch-enabled Chromium regressions
