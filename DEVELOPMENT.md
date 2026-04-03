# Architecture & Development Guide

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Web Browser (Vite)                    │
├─────────────────────────────────────────────────────────┤
│  index.js (Main Orchestrator)                           │
│  ↓          ↓                ↓                           │
│  UI       Simulation        Visualization               │
│  Events   Loop              Loop                        │
└─────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────┐
│     WebAssembly Bridge (Emscripten Bindings)            │
└─────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────┐
│        C++ Physics Engine (Native Code)                 │
├─────────────────────────────────────────────────────────┤
│ TectonicSimulation::step(Δt)                            │
│  ├─ updatePlateMotion()      → Euler rotation           │
│  ├─ detectSubductionZones()  → Geometry checks          │
│  ├─ expandSubductionZones()  → Zone expansion           │
│  ├─ detectRifting()          → Mantle plume logic       │
│  ├─ processRifting()         → Plate splitting          │
│  ├─ detectCollisions()       → Polygon overlap          │
│  └─ processCollisions()      → Mountain building        │
└─────────────────────────────────────────────────────────┘
```

## Core Data Structures (C++)

### Vec3 - 3D Point on Unit Sphere
```cpp
struct Vec3 {
    double x, y, z;
    Vec3 rotateAround(const Vec3& axis, double angle);
    Vec3 normalized();
    double length();
};
```

### LatLon - Geographic Coordinates
```cpp
struct LatLon {
    double lat, lon;  // degrees
    Vec3 toVec3();
};
```

### EulerPole - Rotation Parameter
```cpp
struct EulerPole {
    double lat, lon;  // pole location (degrees)
    double angle;     // rotation amount (degrees)
    Vec3 rotatePoint(const Vec3& p);  // Uses Rodrigues' formula
};
```

Like GPlates, each plate moves by rotating around an Euler pole. Plates are **not** at fixed positions—they spin around an axis through the sphere.

### Plate - Tectonic Plate
```cpp
struct Plate {
    int id;
    PlateType type;  // Continental or Oceanic
    EulerPole eulerPole;  // How this plate moves
    std::vector<Polygon> continents;  // Land masses on this plate
    Polyline boundaries;  // Plate edges
    std::vector<double> crustAge;  // Age of crust at each point
};
```

### SubductionZone - Convergent Boundary
```cpp
struct SubductionZone {
    int subductingPlateId;
    int overridingPlateId;
    Polyline trenchLine;  // Where it dives
    double dippingAngle;  // Usually 30-60°
    double age;  // How long active
};
```

### RiftZone - Divergent Boundary
```cpp
struct RiftZone {
    int parentPlateId;
    Polyline axis;  // Where continent splits
    double halfSpreadingRate;  // cm/yr (full rate = 2x this)
    double age;
};
```

### Craton - Stable Core
```cpp
struct Craton {
    Vec3 center;
    double radius;  // in radians
    Polygon boundary;  // Never deforms
};
```

## Simulation Algorithm

### Update Phase: `step(Δt)`

1. **Plate Motion** (updatePlateMotion)
   ```cpp
   for each plate:
       scale plate's Euler pole by time step
       rotate all continental boundaries using Rodrigues' formula
       rotate plate boundaries similarly
   ```

2. **Age Tracking** (updateCrustAge)
   ```cpp
   for each oceanic plate:
       increment crust age by Δt
   ```

3. **Subduction Detection** (detectSubductionZones)
   - Find where old oceanic crust (>20 Myr) touches continental edge
   - If found and no subduction exists, **create new SubductionZone**
   ```cpp
   for each oceanic plate:
       for each continental plate:
           for each coastline point:
               find nearest oceanic boundary point
               if distance < threshold AND crust age > 20 Myr:
                   create SubductionZone
   ```

4. **Subduction Expansion** (expandSubductionZones)
   - Subduction zones gradually spread along coastlines
   - Simplified: just age them; full version would geometrically expand

5. **New Ocean Crust** (createNewOceanicCrust)
   - At rifts, new oceanic crust forms
   - Spreads at `halfSpreadingRate * 2 * Δt`

6. **Rifting Detection** (detectRifting)
   - If continent >200 Myr old and no active rift: **create RiftZone**
   - Models mantle plume insulation building up slowly
   ```cpp
   if currentTime > 200 AND plateType == Continental AND riftZones.empty():
       create RiftZone with spreading rate ~2.5 cm/yr
   ```

7. **Rifting Process** (processRifting)
   - After ~50 Myr, rift matures and splits continent into 2 plates
   - Complex: redistributes cratons, creates new plate entities

8. **Collision Detection** (detectCollisions)
   - Check if continental polygons overlap
   - If yes and no existing collision zone: **create CollisionZone**
   ```cpp
   for each pair of plates:
       if both continental AND polygons overlap:
           create CollisionZone with Ural/Himalayan type
   ```

9. **Collision Process** (processCollisions)
   - Gradually build mountains (orogenyHeight += small amount)
   - After ~100 Myr: plates weld together (merge geometry)

## JavaScript Interface

### Main Orchestrator (index.js)

```js
// Load WebAssembly
const TectonicSimulation = await import('./sim.js')
simulation = new TectonicSimulation()

// Initialize with user-drawn supercontinent
simulation.initSupercontinent(latArray, lonArray)
simulation.addCraton(lat, lon, radius)

// Main loop
function mainLoop() {
    if (isPlaying) {
        simulation.step(simulationSpeed)  // Advance by N Myr
        updateVisualization()
    }
    requestAnimationFrame(mainLoop)
}
```

### Visualization (GlobeVisualization.js)

```js
globe = new GlobeVisualization(canvas)

// Draw features from simulation
globe.drawContinent(lats, lons, color)
globe.drawSubductionZone(lats, lons)
globe.drawRiftZone(lats, lons)
globe.drawCollisionZone(lats, lons)
globe.drawCraton(lat, lon)

// Update all from simulation state
globe.updateFromSimulation(simulation)
```

### WebAssembly Bindings (Bindings.cpp)

Emscripten automatically generates JavaScript from C++:

```cpp
// C++
class SimulationWrapper {
    void initSupercontinent(const std::vector<double>& lat, const std::vector<double>& lon)
}

// Auto-generates JavaScript:
const sim = new Module.TectonicSimulation()
sim.initSupercontinent([45, 40, 35, ...], [-60, -40, -20, ...])
```

## Extending the Physics

### Add a New Plate Boundary Type

1. Add enum in `GeoTypes.hpp`:
```cpp
enum class BoundaryType {
    Subduction,
    Rift,
    Transform,  // NEW: strike-slip
};
```

2. Create boundary structure:
```cpp
struct TransformBoundary {
    int plate1Id, plate2Id;
    Polyline shearLine;
    double slipRate;  // cm/yr
};
```

3. Add detection in `TectonicSimulation.hpp`:
```cpp
void detectTransformBoundaries();
void processTransformBoundaries(double dt);
```

4. Implement in `TectonicSimulation.cpp`:
```cpp
void TectonicSimulation::detectTransformBoundaries() {
    // Find where plate boundaries slide past each other
    // (not converging, not diverging)
}
```

5. Update JavaScript visualization:
```js
// In index.js updateVisualization()
const transformCount = sim.getTransformBoundaryCount()
for (let t = 0; t < transformCount; ++t) {
    const lats = sim.getTransformBoundaryLats(t)
    const lons = sim.getTransformBoundaryLons(t)
    globe.drawTransformBoundary(lats, lons)  // Green color
}
```

### Adjust Physics Parameters

All in `TectonicSimulation.cpp`:

```cpp
// Subduction initiation age (line ~148)
if (avg_age > 20) {  // Change threshold
    // Create subduction zone
}

// Rifting trigger time (line ~188)
if (currentTime > 200) {  // Change to 150, 250, etc.
    // Start rifting

// Spreading rate cm/yr (line ~201)
rift.halfSpreadingRate = 2.5;  // Range: 1-5 typical

// Mountain building rate (line ~250)
cz.orogenyHeight += 0.001 * dt;  // Faster = larger increment
```

### Add GPlates Integration

GPlates exports rotation files (.rot). To load real data:

```cpp
// New file: GPLATESLoader.hpp
class GPLATESLoader {
    Plate loadPlateFromGPlates(const std::string& filename);
};

// Parse binary rotation format, create Plate with correct Euler poles
```

Then in initialization:
```cpp
Plate plate = loader.loadPlateFromGPlates("npole100.rot");
```

## Performance Considerations

### Current Complexity
- **O(P²)** for collision detection (P = number of plates)
- **O(P×C)** for subduction detection (C = coastline points)
- **O(P×V)** for rotation updates (V = vertices)

### Optimization Ideas
1. **Spatial hashing**: Divide sphere into cells; only check nearby plates
2. **Lazy evaluation**: Only recompute changed features
3. **Level of detail**: Reduce geometry at small time steps
4. **Parallel rotation**: Use SIMD for Rodrigues' formula on many points

## Testing

Add unit tests in C++:

```cpp
// test/TestGeometry.cpp
void TestLatLonConversion() {
    LatLon ll(45, 90);
    Vec3 v = ll.toVec3();
    assert(abs(v.z - sqrt(2)/2) < 1e-6);  // sin(45°)
}

void TestEulerRotation() {
    EulerPole pole(0, 0, 90);  // North pole, 90° rotation
    Vec3 p(1, 0, 0);  // Point on equator
    Vec3 rotated = pole.rotatePoint(p);
    assert(abs(rotated.x) < 1e-6);  // Should be at (0, 1, 0)
}
```

Build and run:
```bash
cd build
cmake .. -DBUILD_TESTS=ON
cmake --build .
./test_geometry
```

## Documentation Strings

Use Doxygen-style comments:

```cpp
/**
 * Update plate positions based on Euler pole rotation.
 * 
 * Each plate rotates around its Euler pole by angle ∝ time.
 * Uses Rodrigues' rotation formula:
 *   v' = v*cos(θ) + (k×v)*sin(θ) + k*(k·v)*(1-cos(θ))
 * 
 * \param dt Time step in million years
 * 
 * \see EulerPole
 * \see Rodrigues' rotation formula
 */
void updatePlateMotion(double dt);
```

Then generate docs:
```bash
doxygen Doxyfile
```

## Debugging

### Print simulation state

Add to `TectonicSimulation.cpp`:

```cpp
void TectonicSimulation::debugPrint() {
    std::cout << "=== Simulation State ===" << std::endl;
    std::cout << "Time: " << currentTime << " Mya" << std::endl;
    std::cout << "Plates: " << plates.size() << std::endl;
    for (const auto& p : plates) {
        std::cout << "  Plate " << p.id << ": "
                  << p.continents.size() << " continents, "
                  << "velocity=" << p.velocity << " cm/yr" << std::endl;
    }
    std::cout << "Subduction zones: " << subductionZones.size() << std::endl;
    std::cout << "Rifts: " << riftZones.size() << std::endl;
    std::cout << "Collisions: " << collisionZones.size() << std::endl;
}
```

Expose to JavaScript:
```cpp
// Bindings.cpp
.function("debugPrint", &SimulationWrapper::debugPrint)
```

Then in browser:
```js
simulation.debugPrint()  // Prints to console
```

### JavaScript debugging

Use Chrome DevTools:
1. Open DevTools (F12)
2. Sources tab → see sim.js and your script
3. Set breakpoints in index.js
4. Use debugger statements

```js
// In your code
updateVisualization() {
    debugger;  // Pauses here
    globe.updateFromSimulation(simulation)
}
```
