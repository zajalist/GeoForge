# Quick Start Guide

## 5-Minute Setup

### Step 1: Install Emscripten (if not already installed)

**macOS/Linux:**
```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

**Windows:**
Download and install: https://github.com/emscripten-core/emsdk/releases

### Step 2: Install Dependencies

```bash
cd wilson-cycles-website
npm install
```

### Step 3: Build WebAssembly

```bash
npm run build-wasm
```

This compiles C++ physics engine to WebAssembly. Takes ~2-5 minutes.

### Step 4: Run Development Server

```bash
npm run dev
```

Open browser to `http://localhost:5173`

## Using the Application

### Phase 1: Draw Supercontinent
1. Click **"Start Drawing"** button
2. Click 4+ points on the globe to outline your continent
3. Points connect automatically

### Phase 2: Mark Cratons
1. Click **"Mark Cratons Mode"**
2. Click to place 1 or more ancient continental cores
3. These persist through the entire Wilson Cycle

### Phase 3: Simulate
1. Click **"Finish Setup"**
2. Adjust simulation speed (1-50 Myr/frame)
3. Click **"Play"** to start

### Controls During Simulation
- **Pause**: Stop simulation and examine state
- **Speed Slider**: Faster/slower simulation
- **Time Slider**: Jump to specific time in history
- **Reset**: Start over with new supercontinent

## What You're Seeing

### Colors
- 🟫 **Brown**: Continental crust
- 🟦 **Blue**: Oceanic crust, subduction zones
- 🟧 **Orange**: Rift zones (continents separating)
- 🟥 **Red**: Collision zones, orogenic mountains

### Time Phases
- **0-100 Mya**: Tenure (supercontinent stable)
- **100-300 Mya**: Breakup (rifts form)
- **300-600 Mya**: Spreading (ocean widens)
- **600-900 Mya**: Reassembly (continents collide)
- **900+ Mya**: Next cycle begins

## Physics Happening

The C++ engine tracks:

1. **Plate Motion**: Each plate rotates around an Euler pole
2. **Subduction**: Old oceanic crust >20 Mya gets subducted
3. **Rifting**: After 200 Mya, mantle plumes force continent splits
4. **Collision**: Continental blocks can't subduct; they weld/crumple
5. **Orogeny**: Mountains grow as continents collide

## Troubleshooting

**Problem**: "sim.wasm not found"
```bash
npm run build-wasm
```

**Problem**: Emscripten command not found
```bash
# Make sure emsdk is in PATH
source /path/to/emsdk/emsdk_env.sh
```

**Problem**: Port 5173 in use
```bash
# Edit vite.config.js:
server: { port: 5174 }
```

**Problem**: "TypeError: Cannot read property 'TectonicSimulation' of undefined"
- WebAssembly didn't build
- Run: `npm run build-wasm` and wait for completion

## Advanced: Tweaking Physics

Edit `src/cpp/src/TectonicSimulation.cpp` to adjust:

```cpp
// Line ~145: Subduction initiation crust age threshold
if (avg_age > 20) {  // Change to 15 or 30
```

```cpp
// Line ~180: Rifting starts after (Mya):
if (currentTime > 200) {  // Change to 150 or 250
```

```cpp
// Line ~220: Spreading rate (cm/yr):
rift.halfSpreadingRate = 2.5;  // Change to 1-5
```

Then rebuild:
```bash
npm run build-wasm
npm run dev
```

## Next Steps

See **[README.md](README.md)** for architecture details
See **[SETUP.md](SETUP.md)** for full build documentation
