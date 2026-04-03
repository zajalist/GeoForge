# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm start            # Start production server
npm run build-wasm   # Compile C++ physics engine to WebAssembly (runs build-wasm.sh or build-wasm.bat)
```

No linting or test runner is configured.

## Architecture

GeoForge is a **Wilson Cycle plate tectonics simulator** — users draw supercontinents on a 3D globe and watch geological cycles (breakup, spreading, collision) unfold over geological time.

### Technology Stack

- **Next.js 16 / React 19** — web framework and UI
- **Three.js 0.128** — 3D globe rendering
- **C++ physics engine** (in `archive/tectonics/`) compiled to WebAssembly via Emscripten, outputs `public/sim.js` + `public/sim.wasm`
- **Pyodide** — Python runtime in browser (for GPlates Python integration)

### Key Files

| File | Role |
|------|------|
| `app/page.jsx` | Main React UI — state management, drawing controls, timeline, phase detection |
| `src/visualization/GlobeVisualization.js` | Three.js globe — renders continents, rifts, subduction zones, collisions; handles camera/mouse |
| `src/index.js` | Legacy vanilla JS orchestrator (predates the Next.js migration; may still be referenced) |
| `src/simulation/riftPathfinder.js` | JS rift path generation algorithm |
| `app/api/gpml/save/route.js` | Next.js API route — saves simulation state as GPML files to `public/gpml/` |
| `archive/tectonics/src/cpp/` | C++ physics engine source (not built automatically; needs Emscripten) |

### Data Flow

1. User draws a supercontinent polygon on the globe (`app/page.jsx` → `GlobeVisualization.js`)
2. Simulation is initialized via the WebAssembly module (`public/sim.js`) using `simulation.initSupercontinent(lats, lons)`
3. Each tick calls `simulation.step(dt)` which runs the C++ physics pipeline
4. Results are pulled from WASM and rendered back to Three.js via `GlobeVisualization.js` methods
5. State can be exported as GPML via the `/api/gpml/save` endpoint

### C++ Physics Pipeline (archive/tectonics)

`TectonicSimulation::step(Δt)` runs in order:
1. `updatePlateMotion()` — Euler pole rotation via Rodrigues' formula
2. `detectSubductionZones()` — old oceanic crust (>20 Myr) touching continental edge → creates `SubductionZone`
3. `detectRifting()` — continent >200 Myr old with no active rift → creates `RiftZone`
4. `processRifting()` — after ~50 Myr, splits plate into two
5. `detectCollisions()` — polygon overlap between continental plates → creates `CollisionZone`
6. `processCollisions()` — builds orogeny height, welds plates after ~100 Myr

Core C++ types: `Vec3` (unit sphere point), `LatLon`, `EulerPole`, `Plate`, `SubductionZone`, `RiftZone`, `Craton`, `CollisionZone` — all defined in `archive/tectonics/src/cpp/include/GeoTypes.hpp`.

### WebAssembly Build

The WASM module must be built separately with Emscripten before the simulation works:
```bash
# macOS/Linux
./build-wasm.sh
# Windows
build-wasm.bat
```
Outputs land in `public/sim.js` and `public/sim.wasm`. The C++ source is in `archive/tectonics/` and is **not** compiled by `npm run build`.

### GPML Export

GPML (GPlates Markup Language) files are saved via `POST /api/gpml/save` with `{ filename, content }`. Files are written to `public/gpml/` and served statically.
