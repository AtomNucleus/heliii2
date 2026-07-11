# Physics & visual upgrade (practical slice)

This branch adds a **production-safe** Rapier debris subsystem and backend-compatible visual fidelity improvements. Authoritative helicopter / building collision remains the existing spatial-hash AABB path.

## Architecture

```
Combat / prop shatter events
        │
        ▼
┌───────────────────┐     optional      ┌──────────────────────────┐
│ CombatFx.debris   │──────────────────▶│ DebrisPhysicsWorld       │
│ Collision.debris  │  spawnAt/burst    │ (Rapier WASM or          │
└───────────────────┘                   │  kinematic fallback)     │
                                        └──────────────────────────┘
VisualEffects
  ├─ WaterResponse   (MeshStandard property animation + wake ring)
  ├─ LightShafts     (additive MeshBasic planes — not true volumetrics)
  └─ ContactShadow   (ground blob under craft)
```

- **Do not** replace `src/collision/resolve.ts` / spatial hash with Rapier for heli↔building.
- Rapier is **visual-only** for destructible fragments and combat explosion debris.
- If `@dimforge/rapier3d-compat` fails to init, the game boots with kinematic debris (same feel as before, plus soft ground bounce).

## Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@dimforge/rapier3d-compat` | `0.19.3` | Latest stable Rapier WASM (base64-inlined, bundler-friendly) |

## Files changed / added

### Physics
- `src/physics/budgets.ts` — tier caps, slot allocation (pure)
- `src/physics/fragments.ts` — deterministic fragment generation (pure)
- `src/physics/lifecycle.ts` — sleep / distance / lifetime cull policy (pure)
- `src/physics/rapierInit.ts` — one-shot init with graceful failure
- `src/physics/debrisWorld.ts` — Rapier world + mesh sync + kinematic fallback
- `src/physics/index.ts` — public exports
- `src/physics/physics.test.ts` — unit tests

### Integration
- `src/effects/combat/debris.ts` — prefers shared Rapier world
- `src/collision/destructible.ts` — prop shatter spawns into shared world
- `src/effects/combat/CombatFx.ts` / `src/combat/effects.ts` — `bindDebrisPhysics`
- `src/main.ts` — async physics boot, bind water + debris

### Visual fidelity
- `src/effects/waterResponse.ts` — richer water / wake (no SSR claim)
- `src/effects/lightShafts.ts` — sunset shafts (MeshBasic, dual-backend)
- `src/effects/contactShadow.ts` — soft contact blob
- `src/effects/visualEffects.ts` — wires new systems
- `src/effects/quality.ts` — tier flags / budgets
- `src/scene/setup.ts` — tighter shadow bias / radius by tier
- `src/world/oceanDressing.ts` / `environmentLayer.ts` — foam access for wake

## Performance budgets (debris)

| Tier | maxBodies | maxPerBurst | stepHz | notes |
|------|-----------|-------------|--------|-------|
| low | 12 | 4 | 30 | shafts off; contact shadow on |
| medium | 24 | 7 | 45 | 3 shafts |
| high | 40 | 10 | 60 | 5 shafts |

Cull policy: max lifetime, sleep/slow after min life, distance from follow target, excess drop on quality downshift.

## Validation

```bash
npm run lint
npm test          # includes src/physics/physics.test.ts
npm run build
npm run smoke-test
```

## Deferred (intentionally not claimed)

- **True SSR / TAA** — no reliable dual WebGPU+WebGL path in this stack without large backend-specific pipelines.
- **Rapier for authoritative heli/building collision** — would risk mission scrape/crash/destructible HP behavior.
- **Real volumetric god rays / fog volumes** — shafts are additive planes; fog remains `FogExp2` + haze mesh.
- **Screen-space contact shadows** — contact blob only.
- **Ocean mesh displacement / flow maps** — PBR property animation + wake ring only.
- **Multiplayer / PWA / progression UI** — out of scope for this slice.
