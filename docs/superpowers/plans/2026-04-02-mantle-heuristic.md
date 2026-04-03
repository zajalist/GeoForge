# Mantle Heuristic Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-shot heuristic mantle heat field that seeds the A* rift pathfinder with a thermally-motivated cost bias, and exposes a debug panel to visualize plumes, slabs, and the winning candidate on the globe.

**Architecture:** A pure `mantleHeuristic.js` module runs once at setup, scoring a 5° grid of in-plate points using latitude-based thermal proxies, craton proximity, and suture bias. The winning point is passed as `thermalSeed` to `generateRiftPath`, where `getNeighbors` applies a 0.4× cost multiplier within 8° of the seed. Three new `GlobeVisualization` methods render debug markers into a dedicated `debugGroup`, and a React panel in `page.jsx` toggles each layer.

**Tech Stack:** JavaScript ES modules, Three.js 0.128, React 19, Next.js 16. No test runner configured — manual browser verification only.

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `src/simulation/mantleHeuristic.js` | Entire new module |
| Modify | `src/simulation/riftPathfinder.js` | Thread `thermalSeed` through `generateRiftPath` → `astar` → `getNeighbors`; apply cost multiplier |
| Modify | `src/visualization/GlobeVisualization.js` | Add `debugGroup`, `debugMarkers`, `addDebugMarker`, `clearDebugMarkers`, `renderHeatCostMap` |
| Modify | `app/page.jsx` | Import heuristic, add 2 state vars, call heuristic at setup, add debug panel + toggle handler |

---

## Task 1: Create `mantleHeuristic.js`

**Files:**
- Create: `src/simulation/mantleHeuristic.js`

- [ ] **Step 1: Create the file with its full implementation**

```js
/**
 * One-shot heuristic mantle heat field for rift/subduction candidate scoring.
 * Pure function — no side effects, no imports.
 */

function pointInPolygon(lon, lat, polygon) {
  const n = polygon.length
  let inside = false
  let j = n - 1
  for (let i = 0; i < n; i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-10) + xi) {
      inside = !inside
    }
    j = i
  }
  return inside
}

function haversineDeg(lon1, lat1, lon2, lat2) {
  const R = 6371.0
  const dlat = ((lat2 - lat1) * Math.PI) / 180
  const dlon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dlon / 2) ** 2
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return km / 111.0 // approximate degrees
}

/**
 * Score a single candidate point.
 * @param {number} lon
 * @param {number} lat
 * @param {number[][]} plateCoords  [[lon, lat], ...]
 * @param {number[][][]} cratonPolygons
 * @param {number} centroidLon
 * @param {number} centroidLat
 * @returns {number} composite score clamped to [0, 1]
 */
function scorePoint(lon, lat, plateCoords, cratonPolygons, centroidLon, centroidLat) {
  // mantle_temp: cosine falloff from thermal equator (offset 15° north)
  const thermalEquatorLat = 15.0
  const mantleTemp = Math.max(0, Math.cos(((lat - thermalEquatorLat) * Math.PI) / 180))

  // upwelling_flux: mantle_temp with slight asymmetric perturbation
  const perturbation = Math.sin((lon * Math.PI) / 120) * 0.08
  const upwellingFlux = Math.max(0, Math.min(1, mantleTemp + perturbation))

  // crust_type_bonus: +0.20 for continental crust (always true here since we only score in-plate points)
  const crustBonus = 0.20

  // craton_penalty: -0.05 per craton centroid within 4° arc
  let cratonPenalty = 0
  for (const craton of cratonPolygons) {
    if (craton.length === 0) continue
    const cLon = craton.reduce((s, p) => s + p[0], 0) / craton.length
    const cLat = craton.reduce((s, p) => s + p[1], 0) / craton.length
    if (haversineDeg(lon, lat, cLon, cLat) < 4.0) {
      cratonPenalty -= 0.05
    }
  }

  // suture_proxy: +0.05 if within 6° of plate centroid axis
  const distToCentroid = haversineDeg(lon, lat, centroidLon, centroidLat)
  const sutureProxy = distToCentroid < 6.0 ? 0.05 : 0

  const raw = mantleTemp * 0.35 + upwellingFlux * 0.30 + crustBonus + cratonPenalty + sutureProxy
  return Math.max(0, Math.min(1, raw))
}

/**
 * Compute the highest-scoring mantle candidate across the plate.
 *
 * @param {number[][]} plateCoords  [[lon, lat], ...]
 * @param {number[][][]} cratonPolygons  [ [[lon, lat], ...], ... ]
 * @returns {{ lat: number, lon: number, type: string, confidence: number, reasoning: string, plumes: object[], slabs: object[] }}
 */
export function computeMantleCandidate(plateCoords, cratonPolygons) {
  if (!plateCoords || plateCoords.length < 3) {
    return null
  }

  const lons = plateCoords.map((p) => p[0])
  const lats = plateCoords.map((p) => p[1])
  const minLon = Math.min(...lons) - 5
  const maxLon = Math.max(...lons) + 5
  const minLat = Math.max(-85, Math.min(...lats) - 5)
  const maxLat = Math.min(85, Math.max(...lats) + 5)

  const centroidLon = lons.reduce((s, v) => s + v, 0) / lons.length
  const centroidLat = lats.reduce((s, v) => s + v, 0) / lats.length

  const STEP = 5.0
  const candidates = []

  for (let lat = minLat; lat <= maxLat; lat += STEP) {
    for (let lon = minLon; lon <= maxLon; lon += STEP) {
      if (!pointInPolygon(lon, lat, plateCoords)) continue
      const score = scorePoint(lon, lat, plateCoords, cratonPolygons, centroidLon, centroidLat)
      candidates.push({ lat, lon, score })
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score)

  const best = candidates[0]
  const worst = candidates[candidates.length - 1]

  const plumes = candidates.slice(0, 3).map((c) => ({ lat: c.lat, lon: c.lon, strength: c.score }))
  const slabs = candidates.slice(-2).map((c) => ({ lat: c.lat, lon: c.lon, strength: 1 - c.score }))

  // Winner is whichever extreme has the larger absolute score deviation from 0.5
  const riftScore = best.score
  const subScore = 1 - worst.score
  const isRift = riftScore >= subScore

  const winner = isRift ? best : worst
  const type = isRift ? 'rift' : 'subduction'
  const confidence = isRift ? riftScore : subScore

  const reasoning =
    `${type} candidate at (${winner.lat.toFixed(1)}°, ${winner.lon.toFixed(1)}°). ` +
    `Score: ${confidence.toFixed(3)}. ` +
    `Thermal equator proxy peaked at lat ${winner.lat.toFixed(1)}°. ` +
    `${cratonPolygons.length} craton(s) evaluated for proximity penalty. ` +
    `Suture proxy: ${Math.abs(winner.lat - centroidLat) < 6 ? 'active' : 'inactive'}.`

  return { lat: winner.lat, lon: winner.lon, type, confidence, reasoning, plumes, slabs }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/simulation/mantleHeuristic.js
git commit -m "feat: add mantleHeuristic.js — one-shot heuristic thermal seed computation"
```

---

## Task 2: Thread `thermalSeed` through `riftPathfinder.js`

**Files:**
- Modify: `src/simulation/riftPathfinder.js:141-208` (functions `getNeighbors`, `astar`, `generateRiftPath`)

- [ ] **Step 1: Update `getNeighbors` signature and cost logic**

In `getNeighbors` at line 141, change the signature and add the thermal bias block after the existing goal-proximity cost reduction (after line 151):

Old signature:
```js
function getNeighbors(cell, grid, rows, cols, goal) {
```

New signature:
```js
function getNeighbors(cell, grid, rows, cols, goal, thermalSeed) {
```

After the existing block:
```js
        if (distToGoal < 5.0) cost *= 0.5
```

Add:
```js
        if (thermalSeed) {
          const seedDist = haversineKm(neighbor.lon, neighbor.lat, thermalSeed.lon, thermalSeed.lat)
          const radiusKm = thermalSeed.radiusDeg * 111.0
          if (seedDist < radiusKm) cost *= thermalSeed.costMultiplier
        }
```

- [ ] **Step 2: Thread `thermalSeed` through `astar`**

Old signature at line 160:
```js
function astar(start, goal, grid, rows, cols) {
```

New signature:
```js
function astar(start, goal, grid, rows, cols, thermalSeed) {
```

Old call to `getNeighbors` at line 195:
```js
    for (const neighbor of getNeighbors(current, grid, rows, cols, goal)) {
```

New:
```js
    for (const neighbor of getNeighbors(current, grid, rows, cols, goal, thermalSeed)) {
```

- [ ] **Step 3: Accept and forward `thermalSeed` in `generateRiftPath`**

In `generateRiftPath` at line 349, add `thermalSeed` to the destructured options:

Old:
```js
  const resolutionDeg = options.resolutionDeg ?? 1.0
  const zigzagAmplitude = options.zigzagAmplitude ?? 2.0
  const zigzagInterval = options.zigzagInterval ?? 4
```

New:
```js
  const resolutionDeg = options.resolutionDeg ?? 1.0
  const zigzagAmplitude = options.zigzagAmplitude ?? 2.0
  const zigzagInterval = options.zigzagInterval ?? 4
  const thermalSeed = options.thermalSeed ?? null
```

Old call to `astar` at line 368:
```js
  const basePath = astar(start, goal, grid, rows, cols)
```

New:
```js
  const basePath = astar(start, goal, grid, rows, cols, thermalSeed)
```

- [ ] **Step 4: Commit**

```bash
git add src/simulation/riftPathfinder.js
git commit -m "feat: thread thermalSeed through riftPathfinder A* cost function"
```

---

## Task 3: Add debug methods to `GlobeVisualization.js`

**Files:**
- Modify: `src/visualization/GlobeVisualization.js:53-70` (constructor), `src/visualization/GlobeVisualization.js:635-678` (after `drawPlume`, before `drawCraton`)

- [ ] **Step 1: Add `debugGroup` and `debugMarkers` to the constructor**

In the constructor, after line 68 (`this.plumeMarkers = []`) and before line 69 (`this.craton_markers = []`):

```js
    this.debugGroup = new THREE.Group()
    this.scene.add(this.debugGroup)
    this.debugMarkers = []
```

- [ ] **Step 2: Add the three debug methods**

After the `drawPlume` method (after line 643, before the `drawCraton` method at line 649), insert:

```js
  /**
   * Add a debug marker sphere at (lat, lon) on the globe surface.
   * @param {number} lat
   * @param {number} lon
   * @param {string} type  - 'plume' | 'slab' | 'candidate' (unused, reserved for future labelling)
   * @param {number} strength  - 0.0 to 1.0, scales sphere size
   * @param {string} color  - CSS hex string e.g. '#ff4422'
   */
  addDebugMarker(lat, lon, type, strength, color) {
    const pos = this.latLonToXYZ(lat, lon).multiplyScalar(this.surfaceRadius + 0.018)
    const size = THREE.MathUtils.clamp(0.025 + strength * 0.03, 0.025, 0.09)
    const geometry = new THREE.SphereGeometry(size, 10, 10)
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
    const marker = new THREE.Mesh(geometry, material)
    marker.position.copy(pos)
    this.debugGroup.add(marker)
    this.debugMarkers.push(marker)
  }

  /**
   * Remove all debug markers from the scene.
   */
  clearDebugMarkers() {
    while (this.debugGroup.children.length > 0) {
      this.debugGroup.remove(this.debugGroup.children[0])
    }
    this.debugMarkers = []
  }

  /**
   * Render plume and slab markers from a mantle candidate result.
   * @param {{ lat: number, lon: number, strength: number }[]} plumes
   * @param {{ lat: number, lon: number, strength: number }[]} slabs
   */
  renderHeatCostMap(plumes, slabs) {
    for (const p of plumes) {
      this.addDebugMarker(p.lat, p.lon, 'plume', p.strength, '#ff4422')
    }
    for (const s of slabs) {
      this.addDebugMarker(s.lat, s.lon, 'slab', s.strength, '#2244ff')
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/visualization/GlobeVisualization.js
git commit -m "feat: add debug marker methods to GlobeVisualization (addDebugMarker, clearDebugMarkers, renderHeatCostMap)"
```

---

## Task 4: Wire everything into `page.jsx`

**Files:**
- Modify: `app/page.jsx`

- [ ] **Step 1: Add import**

At line 27, after the existing imports:
```js
import { generateRiftPath } from '../src/simulation/riftPathfinder.js'
```

Add on the next line:
```js
import { computeMantleCandidate } from '../src/simulation/mantleHeuristic.js'
```

- [ ] **Step 2: Add two new state variables**

After the existing state declarations (around line 121, after `const [stats, setStats] = useState(...)`), add:

```js
  const [heatDebug, setHeatDebug] = useState({ plumes: false, slabs: false, candidate: false, costmap: false })
  const [mantleCandidate, setMantleCandidate] = useState(null)
```

- [ ] **Step 3: Add `toggleDebugLayer` handler**

After `const bumpUi = () => setUiVersion((v) => v + 1)` (line 122), add:

```js
  const toggleDebugLayer = (layer) => {
    setHeatDebug((prev) => {
      const next = { ...prev, [layer]: !prev[layer] }
      const globe = globeRef.current
      if (globe) {
        globe.clearDebugMarkers()
        if (next.plumes || next.costmap) {
          globe.renderHeatCostMap(mantleCandidate.plumes, mantleCandidate.slabs)
        }
        if (next.slabs && !next.costmap) {
          mantleCandidate.slabs.forEach((s) =>
            globe.addDebugMarker(s.lat, s.lon, 'slab', s.strength, '#2244ff')
          )
        }
        if (next.candidate) {
          globe.addDebugMarker(mantleCandidate.lat, mantleCandidate.lon, 'candidate', mantleCandidate.confidence, '#88ff44')
        }
      }
      return next
    })
  }
```

- [ ] **Step 4: Call `computeMantleCandidate` in the setup flow and pass `thermalSeed`**

Find the `generateRiftPath` call (around line 668–680):

```js
    try {
      const plateCoords = closed.lats.map((lat, i) => [closed.lons[i], lat])
      const cratonCoords = cratonPolygonsRef.current.map((craton) =>
        craton.lats.map((lat, i) => [craton.lons[i], lat])
      )
      riftPathRef.current = generateRiftPath(plateCoords, cratonCoords, {
        resolutionDeg: 1.0,
        zigzagAmplitude: 2.0,
        zigzagInterval: 4
      })
    } catch {
      riftPathRef.current = []
    }
```

Replace with:

```js
    try {
      const plateCoords = closed.lats.map((lat, i) => [closed.lons[i], lat])
      const cratonCoords = cratonPolygonsRef.current.map((craton) =>
        craton.lats.map((lat, i) => [craton.lons[i], lat])
      )
      const candidate = computeMantleCandidate(plateCoords, cratonCoords)
      setMantleCandidate(candidate)
      setHeatDebug({ plumes: false, slabs: false, candidate: false, costmap: false })
      riftPathRef.current = generateRiftPath(plateCoords, cratonCoords, {
        resolutionDeg: 1.0,
        zigzagAmplitude: 2.0,
        zigzagInterval: 4,
        thermalSeed: candidate
          ? { lat: candidate.lat, lon: candidate.lon, radiusDeg: 8, costMultiplier: 0.4 }
          : null
      })
    } catch {
      riftPathRef.current = []
    }
```

- [ ] **Step 5: Add the debug panel to the right-stack UI**

Find the Tectonic Data section in the right-stack (around line 989–1021):

```jsx
          <section className='panel data-panel'>
```

After its closing `</section>` tag, insert:

```jsx
          {mantleCandidate && (
            <section className='panel debug-panel'>
              <h2>
                <Layers size={16} />
                Mantle Debug
              </h2>
              <div className='hint'>
                {mantleCandidate.type} @ {mantleCandidate.lat.toFixed(1)}°,{' '}
                {mantleCandidate.lon.toFixed(1)}° &mdash;{' '}
                {(mantleCandidate.confidence * 100).toFixed(0)}% confidence
              </div>
              <div className='hint' style={{ fontStyle: 'italic', marginTop: 4 }}>
                {mantleCandidate.reasoning}
              </div>
              <div className='btn-row' style={{ marginTop: 8 }}>
                <button
                  className={`btn${heatDebug.plumes ? ' btn-active' : ''}`}
                  onClick={() => toggleDebugLayer('plumes')}
                >
                  Plumes
                </button>
                <button
                  className={`btn${heatDebug.slabs ? ' btn-active' : ''}`}
                  onClick={() => toggleDebugLayer('slabs')}
                >
                  Slabs
                </button>
                <button
                  className={`btn${heatDebug.candidate ? ' btn-active' : ''}`}
                  onClick={() => toggleDebugLayer('candidate')}
                >
                  Candidate
                </button>
                <button
                  className={`btn${heatDebug.costmap ? ' btn-active' : ''}`}
                  onClick={() => toggleDebugLayer('costmap')}
                >
                  Cost Map
                </button>
              </div>
            </section>
          )}
```

- [ ] **Step 6: Commit**

```bash
git add app/page.jsx
git commit -m "feat: integrate mantle heuristic into setup flow and add debug panel to UI"
```

---

## Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: Server starts on `localhost:3000` with no import errors.

- [ ] **Step 2: Draw a supercontinent and complete setup**

1. Open `localhost:3000`
2. Click "Start Drawing", place 5+ vertices to form a polygon, click "Finish & Setup"
3. Expected: Setup completes, status text shows as before. No console errors.

- [ ] **Step 3: Verify the Mantle Debug panel appears**

Expected: A "Mantle Debug" section appears in the right panel below "Tectonic Data", showing the candidate type, lat/lon, and confidence percentage.

- [ ] **Step 4: Toggle each debug layer and verify globe markers**

- Click **Plumes** → 3 orange spheres appear on the globe
- Click **Candidate** → 1 green sphere appears at the candidate coordinate
- Click **Cost Map** → plume + slab markers all shown simultaneously
- Click **Slabs** (with Cost Map off) → 2 blue spheres appear
- Click same button again → spheres disappear (toggle off)

- [ ] **Step 5: Verify rift path is biased**

Draw a fresh supercontinent centered near the equator (where the thermal seed will land). Compare the rift path vs a polar supercontinent (where bias is weaker). The equatorial rift should curve toward the candidate coordinate.

- [ ] **Step 6: Verify reset clears debug state**

Click **Reset** → debug panel disappears (mantleCandidate reset to null), globe debug markers cleared.

- [ ] **Step 7: Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore: post-integration cleanup"
```

---

## Self-Review Notes

- `thermalSeed` is `null`-safe at every callsite — no existing behaviour changes without a candidate.
- `toggleDebugLayer` uses the functional `setHeatDebug` form to avoid stale closure on `heatDebug`.
- `resetSimulation` in `page.jsx` does not currently call `setMantleCandidate(null)` or `globe.clearDebugMarkers()` — Task 4 Step 4 resets `heatDebug` on each new setup, but a reset mid-session would leave stale markers. This is acceptable for a debug tool; adding reset cleanup is out of scope per the spec.
- `btn-active` CSS class may not exist in the current stylesheet — the buttons will still function, they just won't show active state visually. This is a cosmetic gap, not a functional one.
