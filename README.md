# Wilson Cycles Interactive Visualization

A web-based 3D globe simulator for visualizing complete Wilson Cycle plate tectonics. Draw a supercontinent, mark cratons (ancient continental cores), and watch the full cycle of breakup, spreading, and reassembly—with automatic subduction zones, rifting, collisions, and mountain building.

Powered by **C++ physics engine** (compiled to WebAssembly) inspired by GPlates, and **Three.js** for 3D globe visualization.

## Key Features

✨ **Interactive Drawing**
- Draw custom supercontinents by clicking on the globe
- Mark cratons (stable continental cores) that persist through cycles
- Real-time 3D visualization

🌍 **Realistic Physics**
- **Vector-based geometry** (like GPlates): polylines and polygons, not grids
- **Euler rotations**: plates move via rotation poles—actual kinematic model
- **Automatic subduction zones**: detected at old oceanic crust, shown in blue
- **Rift initiation**: mantle insulation under supercontinents triggers breakup
- **Collision orogenies**: continental blocks collide and weld; mountains form

🔄 **Complete Wilson Cycles**
- Tenure: supercontinent sits and insulates the mantle
- Breakup: rifts split landmass; new ocean forms
- Spreading: plates move apart; subduction pulls them
- Reassembly: plates collide and merge into new supercontinent
- Repeat for 1000+ Mya of geological time

## Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Physics Engine** | C++17 + WebAssembly | Plate tectonics simulation (Euler poles, subduction, rifting, collision) |
| **Visualization** | Three.js | Real-time 3D globe with interactive features |
| **Web Framework** | Vite | Fast development server and production bundling |
| **Bindings** | Emscripten | Seamless C++ ↔ JavaScript communication |

### Why C++ + WASM?

Like GPlates, we use compiled C++ for physics:
- ✅ Scientific accuracy for complex geometric operations
- ✅ Near-native performance for large simulations
- ✅ Easy integration with GPlates methods
- ✅ Proven architecture from reference implementation

## Quick Start

See **[SETUP.md](SETUP.md)** for detailed build instructions.

```bash
# Install dependencies
npm install

# Build WebAssembly module (one-time)
./build-wasm.sh          # macOS/Linux
# or
build-wasm.bat           # Windows

# Run dev server
npm run dev
```

Open `http://localhost:5173`

Then:
1. Click **"Start Drawing"** and draw your supercontinent (4+ points)
2. Click **"Mark Cratons Mode"** and click to place ancient cores
3. Click **"Finish Setup"**
4. Click **"Play"** and watch the Wilson Cycle unfold!

## Project Structure

```
src/
├── cpp/                    # C++ physics engine
│   ├── include/
│   │   ├── GeoTypes.hpp       # Vector, polygon, Euler pole definitions
│   │   └── TectonicSimulation.hpp  # Main simulation class
│   └── src/
│       ├── GeoTypes.cpp
│       ├── TectonicSimulation.cpp   # Subduction, rifting, collision
│       └── Bindings.cpp            # WebAssembly entry point
├── visualization/
│   └── GlobeVisualization.js  # Three.js 3D globe
├── index.js               # Main app orchestrator
└── components/            # UI handlers
```

## Simulation Concepts

Based on **Worldbuilding Pasta** ([Part Va](https://worldbuildingpasta.blogspot.com/2020/01/an-apple-pie-from-scratch-part-va.html)):

- **Plates**: Continental and oceanic crusts with rotation poles
- **Cratons**: Ancient stable cores; never break (preserved through cycles)
- **Subduction Zones**: Convergent boundaries where old crust dives into mantle
- **Rifts**: Divergent boundaries; continents split and new ocean forms
- **Collisions**: Mountain building when continents meet
- **Euler Poles**: Rotation axis governing plate motion

## References

- 🌐 **GPlates**: https://www.gplates.org/ (reference implementation)
- 📖 **Worldbuilding Pasta**: https://worldbuildingpasta.blogspot.com/ (Wilson Cycle algorithm)
- 🔧 **Emscripten**: https://emscripten.org/ (C++ ↔ JS bridge)
- 📦 **Three.js**: https://threejs.org/ (3D graphics)
