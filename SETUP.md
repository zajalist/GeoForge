# Build Instructions

## Prerequisites

1. **Emscripten**: Required to compile C++ to WebAssembly
   ```bash
   # Follow installation: https://emscripten.org/docs/getting_started/downloads.html
   ```

2. **Node.js & npm**: For web development
   ```bash
   # Install from https://nodejs.org
   ```

3. **CMake**: For building the C++ code
   ```bash
   # macOS/Linux
   brew install cmake
   
   # Windows - download from https://cmake.org/download/
   ```

## Setup & Build

### 1. Install JavaScript Dependencies
```bash
npm install
```

### 2. Build WebAssembly Module

**On Linux/macOS:**
```bash
chmod +x build-wasm.sh
./build-wasm.sh
```

**On Windows:**
```bash
build-wasm.bat
```

This will:
- Compile C++ physics engine to WebAssembly
- Generate JavaScript bindings
- Output `public/sim.js` and `public/sim.wasm`

### 3. Run Development Server
```bash
npm run dev
```

Server starts at `http://localhost:5173`

### 4. Build for Production
```bash
npm run build
```

Output in `dist/` directory

## How to Use

### 1. Drawing Mode
- Click "Start Drawing" button
- Click on the globe to draw your supercontinent outline
- Need at least 4 points
- Click "Clear" to restart

### 2. Mark Cratons
- Click "Mark Cratons Mode"
- Click to place craton centers (ancient stable cores)
- These persist through the entire Wilson Cycle

### 3. Run Simulation
- Click "Finish Setup" when ready
- Click "Play" to start simulation
- Adjust speed with slider
- Watch the supercontinent:
  - Break apart along rifts
  - Form subduction zones (blue)
  - Create new oceanic crust
  - Collide and reassemble (red zones)

## Project Structure

```
wilson-cycles-website/
├── src/
│   ├── cpp/              # C++ physics engine
│   │   ├── include/      # Header files
│   │   └── src/          # Implementation + WebAssembly bindings
│   ├── visualization/    # Three.js globe rendering
│   ├── components/       # UI components
│   └── index.js          # Main entry point
├── public/
│   ├── index.html        # Main HTML
│   ├── sim.js            # Compiled WebAssembly (generated)
│   └── sim.wasm          # WebAssembly binary (generated)
├── CMakeLists.txt        # Build configuration
├── vite.config.js        # Web dev server config
└── package.json          # Node dependencies
```

## Technical Details

### Physics Engine (C++)
- **Vector-based geometry**: Like GPlates, uses polylines and polygons
- **Euler rotations**: Plates move via rotation poles
- **Subduction detection**: Automatic zone creation at old oceanic crust
- **Rifting algorithm**: Based on supercontinent insulation and mantle plumes
- **Collision physics**: Continental blocks weld; mountains form

### Visualization (Three.js)
- **3D globe**: Sphere with lat/lon projection
- **Real-time rendering**: Updates as simulation progresses
- **Interactive**: Click to draw, drag to rotate

### WebAssembly Bridge
- Bindings using Emscripten
- Seamless JavaScript ↔ C++ communication
- Near-native performance for physics

## Troubleshooting

### "WebAssembly module not found"
```bash
# Rebuild:
npm run build-wasm
```

### Emscripten not found
```bash
# Linux/macOS - add to .bashrc or .zshrc:
source /path/to/emsdk/emsdk_env.sh

# Windows - set up with installer
# https://emscripten.org/docs/getting_started/downloads.html
```

### Port 5173 already in use
```bash
# Change in vite.config.js:
server: { port: 5174 }
```

## References

- GPlates: https://www.gplates.org/
- Worldbuilding Pasta Wilson Cycles: https://worldbuildingpasta.blogspot.com/2020/01/an-apple-pie-from-scratch-part-va.html
- Emscripten: https://emscripten.org/
- Three.js: https://threejs.org/
