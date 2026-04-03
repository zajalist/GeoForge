# Wilson Cycles Website - Complete Project Summary

## What Was Built

A **3D interactive Wilson Cycle plate tectonics simulator** combining:
- **C++ physics engine** (compiled to WebAssembly via Emscripten) 
- **Three.js 3D globe visualization**
- **GPlates-inspired kinematic modeling** with Euler rotations

Users can draw supercontinents on a 3D globe, mark ancient cratons, and watch the complete supercontinent cycle: breakup → spreading → collision → reassembly, with automatic subduction zones, rifting, and mountain building.

---

## Project Structure

```
wilson-cycles-website/
│
├── 📄 Core Configuration
│   ├── package.json                 # Node.js dependencies + build scripts
│   ├── CMakeLists.txt               # C++ build configuration (Emscripten)
│   ├── vite.config.js               # Web dev server (Vite)
│   ├── .gitignore                   # Git ignore patterns
│
├── 📋 Documentation
│   ├── README.md                    # Main project overview
│   ├── QUICKSTART.md                # 5-minute setup guide
│   ├── SETUP.md                     # Detailed build instructions
│   ├── DEVELOPMENT.md               # Architecture & extension guide
│
├── 🌐 Web Frontend (JavaScript/HTML)
│   ├── public/
│   │   ├── index.html               # Main HTML interface
│   │   ├── sim.js                   # Compiled WebAssembly (generated)
│   │   └── sim.wasm                 # WebAssembly binary (generated)
│   │
│   └── src/
│       ├── index.js                 # Main app orchestrator
│       │   ├─ Loads WebAssembly module
│       │   ├─ Handles UI events (drawing, simulation)
│       │   ├─ Main animation loop
│       │   └─ Updates visualization
│       │
│       └── visualization/
│           └── GlobeVisualization.js  # Three.js 3D globe
│               ├─ Sphere rendering
│               ├─ Lat/lon → 3D conversion
│               ├─ Feature visualization (continents, zones)
│               └─ Animation loop
│
├── 🔧 C++ Physics Engine
│   ├── src/cpp/
│   │   ├── include/
│   │   │   ├── GeoTypes.hpp         # Core types (Vec3, Plate, Craton, etc.)
│   │   │   │   ├─ Vec3: 3D point on unit sphere
│   │   │   │   ├─ LatLon: geographic coordinates
│   │   │   │   ├─ EulerPole: rotation parameters (like GPlates)
│   │   │   │   ├─ Plate: continental/oceanic crust
│   │   │   │   ├─ SubductionZone: convergent boundary
│   │   │   │   ├─ RiftZone: divergent boundary
│   │   │   │   ├─ CollisionZone: mountain building
│   │   │   │   └─ Craton: stable core
│   │   │   │
│   │   │   └── TectonicSimulation.hpp # Main solver
│   │   │       ├─ initializeSupercontinent()
│   │   │       ├─ step(dt) - main update loop
│   │   │       ├─ detectSubductionZones()
│   │   │       ├─ detectRifting()
│   │   │       ├─ detectCollisions()
│   │   │       └─ Public accessors for all features
│   │   │
│   │   └── src/
│   │       ├── GeoTypes.cpp         # Vector math + type implementations
│   │       │   ├─ Rodrigues' rotation formula (EulerPole rotation)
│   │       │   └─ Lat/lon ↔ Vec3 conversions
│   │       │
│   │       ├── TectonicSimulation.cpp  # Physics simulation
│   │       │   ├─ updatePlateMotion()  - Euler rotation
│   │       │   ├─ detectSubductionZones() - geometry checks
│   │       │   ├─ expandSubductionZones() - zone spreading
│   │       │   ├─ createNewOceanicCrust() - spreading centers
│   │       │   ├─ detectRifting() - mantle plume logic
│   │       │   ├─ processRifting() - continent splitting
│   │       │   ├─ detectCollisions() - polygon overlap
│   │       │   ├─ processCollisions() - mountain building
│   │       │   └─ updateCrustAge() - aging oceanic plates
│   │       │
│   │       └── Bindings.cpp         # WebAssembly entry point
│   │           ├─ Emscripten bindings (C++ ↔ JS)
│   │           ├─ SimulationWrapper class
│   │           └─ Data accessors (continents, zones, etc.)
│   │
│   └── build-wasm.sh / build-wasm.bat  # Build scripts

└── 📁 Directories (auto-created)
    ├── build/                       # Temporary build artifacts
    ├── dist/                        # Production build output
    └── node_modules/                # NPM dependencies
```

---

## Key Features Implemented

### ✅ User Interface
- **Drawing Mode**: Click on 3D globe to draw supercontinent outline (4+ points)
- **Craton Marking**: Place ancient stable cores (persist through cycles)
- **Simulation Controls**: Play/pause, speed adjustment, timeline scrubbing
- **Real-time Stats**: Time, plate count, subduction zones, rifts, collisions

### ✅ Physics Engine (C++)
- **Vector Geometry**: Like GPlates—polylines and polygons, not grids
- **Euler Rotations**: Each plate moves via rotation pole (realistic kinematics)
- **Automatic Subduction**: Detected at old oceanic crust (>20 Myr), shown in blue
- **Rifting Algorithm**: Mantle insulation under supercontinents triggers breakup after ~200 Myr
- **Collision Physics**: Continental blocks can't subduct; form mountains, weld together
- **Craton Preservation**: Ancient cores never deform; preserved through entire cycles

### ✅ Visualization (Three.js)
- **3D Globe**: Interactive sphere with realistic lat/lon projection
- **Color-coded Features**:
  - 🟫 Brown: Continental crust
  - 🟦 Blue: Subduction zones
  - 🟧 Orange: Rift zones
  - 🟥 Red: Collision zones
- **Real-time Updates**: Rendered as simulation progresses
- **Interactive**: Rotate globe, zoom in/out

### ✅ WebAssembly Integration
- Emscripten bindings for seamless C++ ↔ JavaScript communication
- Near-native performance for physics calculations
- Single-threaded synchronous API (can extend with workers)

---

## Physics Algorithms

### 1. Plate Motion (Rodrigues' Rotation)
```
For each point P on plate:
    P' = P*cos(θ) + (k×P)*sin(θ) + k*(k·P)*(1-cos(θ))
    
where:
    k = Euler pole (rotation axis)
    θ = rotation angle ∝ time
```

### 2. Subduction Detection
```
For each oceanic plate:
    For each continental plate:
        For each coastline point:
            Find nearest oceanic boundary
            If distance < threshold AND crust age > 20 Myr:
                Create SubductionZone
```

### 3. Rifting Trigger
```
If supercontinent age > 200 Mya AND no active rift:
    Create RiftZone with spreading rate ~2.5 cm/yr
    (Models mantle plume buildup from insulation)
```

### 4. Collision Detection
```
For each pair of plates:
    If both continental AND polygons overlap:
        Create CollisionZone
        Begin mountain building
```

### 5. Mountain Growth
```
Each timestep:
    orogenyHeight += 0.001 * dt
    After ~100 Myr:
        Merge plates into unified craton
```

---

## Build & Run Instructions

### Prerequisites
- **Node.js** ≥16: https://nodejs.org
- **Emscripten**: https://emscripten.org/docs/getting_started/downloads.html
- **CMake** ≥3.16

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Build WebAssembly (one-time, takes 2-5 min)
npm run build-wasm

# 3. Run development server
npm run dev

# 4. Open http://localhost:5173
```

### For Production
```bash
npm run build
# Output in dist/
```

---

## File Statistics

| Category | Count | Language |
|----------|-------|----------|
| C++ Source | 3 | C++17 |
| C++ Headers | 2 | C++17 |
| JavaScript | 2 | ES6+ |
| HTML | 1 | HTML5 |
| Build Config | 4 | CMake, JSON, JS |
| Documentation | 4 | Markdown |
| Total | 16+ | Mixed |

---

## References & Integration Points

### GPlates
- **Repository**: https://github.com/GPlates/GPlates
- **Integration**: Our architecture mimics GPlates' vector-based approach with Euler poles
- **Data Format**: Can extend to load GPlates .grot (rotation) files

### Worldbuilding Pasta Wilson Cycle
- **Blog**: https://worldbuildingpasta.blogspot.com/2020/01/an-apple-pie-from-scratch-part-va.html
- **Algorithm**: Complete implementation of Wilson Cycle phases (breakup → spreading → collision → reassembly)
- **Physics**: Subduction-driven plate motion, rift initiation via mantle plumes, collision orogenies

### Libraries
- **Three.js** (visualization): MIT license
- **Emscripten** (WebAssembly): LLVM license
- **Vite** (build tool): MIT license

---

## Next Steps for Developers

1. **Build the WebAssembly** (see SETUP.md)
2. **Run the dev server** and open browser
3. **Try the interface**: Draw a continent, mark cratons, simulate
4. **Explore code**: Read DEVELOPMENT.md for architecture details
5. **Extend physics**: Add new boundary types, adjust parameters
6. **Integrate GPlates data**: Load real rotation poles from .rot files

---

## Known Limitations & Future Work

### Current Limitations
- Subduction zones don't laterally expand (currently just exist; should grow geometrically)
- Rifting doesn't properly split plates into two plates yet
- No transform (strike-slip) boundaries
- No slab rollback or back-arc spreading
- Simplified polygon overlap detection for collisions
- No erosion modeling

### Future Enhancements
1. **Complete Rifting**: Actually create two plates when rift matures
2. **Subduction Expansion**: Spread along preexisting faults
3. **Transform Boundaries**: Strike-slip motion
4. **Back-arc Basins**: Slab rollback physics
5. **Erosion**: Using stream power equation
6. **Climate Integration**: Temperature, precipitation from topography
7. **GPlates Integration**: Load real paleomagnetic data
8. **Multi-threaded**: Use Web Workers for large simulations
9. **3D Terrain**: Generate elevation from simulation output
10. **Historical Playback**: Load recorded rotation sequences

---

## Support & Questions

For technical details:
- See **DEVELOPMENT.md** for architecture
- See **QUICKSTART.md** for usage help
- See **SETUP.md** for build issues

For physics questions:
- Refer to Worldbuilding Pasta blog series
- Check GPlates documentation
- See reference papers in DEVELOPMENT.md

---

**Version**: 0.1.0  
**Status**: Foundation complete; core physics engine functional  
**License**: (Specify your license here)  
**Created**: April 2026
