# Mantle Heuristic Integration — Design Spec
Date: 2026-04-02

## Overview

Integrate a one-shot heuristic mantle heat field system into GeoForge. The heuristic runs once at supercontinent setup time, produces a thermal seed point (rift or subduction candidate), and biases the A* rift pathfinding cost function toward that seed. A React debug panel lets the user toggle visualization layers on the globe.

---

## 1. New File: `src/simulation/mantleHeuristic.js`

### Exported API
```js
computeMantleCandidate(plateCoords, cratonPolygons)
→ { lat, lon, type, confidence, reasoning, plumes, slabs }
```

### Inputs
- `plateCoords`: `[[lon, lat], ...]` — the committed supercontinent polygon (same format used by `generateRiftPath`)
- `cratonPolygons`: array of craton polygons in `[[lon, lat], ...]` format

### Algorithm
1. Build a bounding box from `plateCoords` with a 5° margin.
2. Sample candidate points on a 5° grid within the bounding box.
3. For each in-plate point (using existing `pointInPolygon` logic), compute a composite score from weighted criteria:
   - **mantle_temp** (0.0–1.0): latitude-based proxy; equatorial band peaks at 1.0, attenuates toward poles via cosine falloff with a ±15° thermal equator offset
   - **upwelling_flux** (0.0–1.0): derived from mantle_temp with slight angular perturbation to simulate asymmetric convection cells
   - **crust_type_bonus** (+0.20): applied if point is inside `plateCoords` (continental crust)
   - **craton_penalty** (−0.05 per craton within 4°): old stable cratons suppress rifting
   - **suture_proxy** (+0.05 if within 6° of plate centroid axis): pre-existing structural weakness
4. Composite score = `(mantle_temp * 0.35) + (upwelling_flux * 0.30) + crust_type_bonus + craton_penalty + suture_proxy`, clamped to [0, 1].
5. The highest-scoring in-plate point becomes the rift candidate. The lowest-scoring becomes the subduction candidate. The one with the higher absolute score wins.
6. Return the winner plus `plumes[]` (top 3 scoring points) and `slabs[]` (bottom 2 scoring points) for the debug panel.

### No side effects
Pure function. No module-level state.

---

## 2. `src/simulation/riftPathfinder.js` changes

### New option: `thermalSeed`
```js
generateRiftPath(plateCoords, cratonPolygons, {
  resolutionDeg: 1.0,
  zigzagAmplitude: 2.0,
  zigzagInterval: 4,
  thermalSeed: { lat, lon, radiusDeg: 8, costMultiplier: 0.4 }  // optional, default null
})
```

### Change: `getNeighbors` signature
`getNeighbors(cell, grid, rows, cols, goal, thermalSeed)` — `thermalSeed` threaded through from `generateRiftPath` → `astar` → `getNeighbors`.

### Change: cost calculation in `getNeighbors`
After the existing diagonal cost and goal-proximity checks, add:
```js
if (thermalSeed) {
  const dist = haversineKm(neighbor.lon, neighbor.lat, thermalSeed.lon, thermalSeed.lat)
  const radiusKm = thermalSeed.radiusDeg * 111.0
  if (dist < radiusKm) cost *= thermalSeed.costMultiplier
}
```

### Backwards compatibility
`thermalSeed` defaults to `null`. All existing call sites are unaffected.

---

## 3. `src/visualization/GlobeVisualization.js` additions

### Constructor change
Add `this.debugGroup = new THREE.Group()` to the scene. Add `this.debugMarkers = []`.  
`clear()` is NOT modified — debug markers persist across simulation resets.

### New methods

#### `addDebugMarker(lat, lon, type, strength, color)`
- Converts `(lat, lon)` to XYZ via existing `latLonToXYZ`, offset by `surfaceRadius + 0.018`.
- Sphere size: `clamp(0.025 + strength * 0.03, 0.025, 0.09)`.
- `color` is a hex string (e.g. `'#ff4422'`) — convert via `new THREE.Color(color)`.
- Pushes mesh to `this.debugMarkers[]` and adds to `this.debugGroup`.

#### `clearDebugMarkers()`
- Removes all children from `this.debugGroup`.
- Empties `this.debugMarkers = []`.

#### `renderHeatCostMap(plumes, slabs)`
- Calls `addDebugMarker` for each entry in `plumes` (color `'#ff4422'`) and `slabs` (color `'#2244ff'`).
- Convenience wrapper — no new logic.

---

## 4. `app/page.jsx` changes

### New state
```js
const [heatDebug, setHeatDebug] = useState({ plumes: false, slabs: false, candidate: false, costmap: false })
const [mantleCandidate, setMantleCandidate] = useState(null)
```

### Setup flow (around line 668)
Order of operations after polygon is committed:
1. Run `computeMantleCandidate(plateCoords, cratonCoords)` → store result in `setMantleCandidate` and a local `candidate` variable.
2. Pass `candidate` as `thermalSeed` to `generateRiftPath`.
3. Existing GPML export and status text remain unchanged.

### New debug panel
Inserted as a `<section className='panel debug-panel'>` inside the `right-stack` aside, below the Tectonic Data section. Only rendered when `mantleCandidate !== null`.

Structure:
```jsx
<section className='panel debug-panel'>
  <h2><Layers size={16} /> Mantle Debug</h2>
  <div className='hint'>{mantleCandidate.type} @ {mantleCandidate.lat.toFixed(1)}°, {mantleCandidate.lon.toFixed(1)}° — {(mantleCandidate.confidence * 100).toFixed(0)}%</div>
  <div className='btn-row'>
    <button className='btn' onClick={() => toggleDebugLayer('plumes')}>Plumes</button>
    <button className='btn' onClick={() => toggleDebugLayer('slabs')}>Slabs</button>
    <button className='btn' onClick={() => toggleDebugLayer('candidate')}>Candidate</button>
    <button className='btn' onClick={() => toggleDebugLayer('costmap')}>Cost Map</button>
  </div>
</section>
```

### `toggleDebugLayer(layer)` handler
```js
const toggleDebugLayer = (layer) => {
  const next = { ...heatDebug, [layer]: !heatDebug[layer] }
  setHeatDebug(next)
  const globe = globeRef.current
  if (!globe) return
  globe.clearDebugMarkers()
  if (next.plumes || next.costmap) globe.renderHeatCostMap(mantleCandidate.plumes, mantleCandidate.slabs)
  if (next.slabs && !next.costmap) mantleCandidate.slabs.forEach(s => globe.addDebugMarker(s.lat, s.lon, 'slab', s.strength, '#2244ff'))
  if (next.candidate) globe.addDebugMarker(mantleCandidate.lat, mantleCandidate.lon, 'candidate', mantleCandidate.confidence, '#88ff44')
}
```

---

## Data Flow Summary

```
User draws polygon → commitSetup()
  → computeMantleCandidate(plateCoords, cratonCoords)
      → heuristic scores 5° grid → returns { lat, lon, plumes, slabs, ... }
  → generateRiftPath(..., { thermalSeed: candidate })
      → A* getNeighbors() applies 0.4x cost within 8° of seed
  → setMantleCandidate(candidate)   ← enables debug panel
  → debug panel toggles call globe.addDebugMarker / clearDebugMarkers
```

---

## Out of Scope

- Re-running heuristic on each tick (static seed only)
- Saving heuristic output to GPML
- Multiple candidate points
- Navier-Stokes or full fluid dynamics
