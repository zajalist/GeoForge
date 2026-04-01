# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GeoForge** is a science-driven procedural planet generation system. It simulates planetary tectonics from first principles, derives climate and biosphere from physical models, and renders explorable UE5 terrain with physically-motivated vegetation. The full pipeline runs end-to-end in 2-3 minutes per tile.

**Current Status:** Geodesic grid complete (Python + C++); simulation, ML biosphere, and UE5 integration pending.

**Team:**
- **Badr:** Tectonic simulation, climate derivation, ML biosphere profiler, Gaea integration, Substrate materials, PCG vegetation pipeline
- **Yahya:** Geodesic grid, .geoforge format & reader, FastAPI backend, Three.js UI, UE5 plugin, tile picker, conditioning maps, website

---

## Architecture & Data Flow

### High-Level Pipeline

```
Paint supercontinent (Three.js Web UI)
        ↓
Simulate tectonics + climate + biosphere (C++/Python)
        ↓
Write .geoforge file (24 channels, LZ4-compressed)
        ↓
Select tile in UE5 (Slate UI tile picker)
        ↓
Generate conditioning maps (6 PNG files)
        ↓
Generate heightmap (Gaea CLI with .tor template)
        ↓
Build landscape + Substrate material + PCG vegetation (UE5)
        ↓
Explorable terrain with physically-motivated biomes
```

### Core Components

| Component | Owner | Language | Purpose |
|-----------|-------|----------|---------|
| **Geodesic Grid** | Yahya | C++/Python | Level-6 icosphere subdivision (~65k cells), spatial indexing foundation |
| **Tectonic Simulation** | Badr | C++ | Plate motion, boundary classification, elevation evolution (up to 2,000 Ma) |
| **Climate Derivation** | Badr | C++ | Temperature, precipitation, Köppen zones from first principles |
| **ML Biosphere Profiler** | Badr | PyTorch → ONNX | 33 features → 17 biome classes; vegetation scoring via Liebig's Law |
| **.geoforge Format** | Yahya | C++/Python | Custom binary format: 256-byte header, 512-byte channel index, 24 LZ4-compressed channels |
| **FastAPI Backend** | Yahya | Python | `/tile` endpoint (bounds → 24 channels), `/simulate` endpoint (params → .geoforge path) |
| **Web UI** | Yahya | Three.js/JS | Globe for painting supercontinents; exports texture to simulation |
| **UE5 .geoforge Reader** | Yahya | C++ | `UGeoForgeFile` class; LZ4 decompression; spatial hash queries |
| **Tile Picker** | Yahya | Slate UI | UE5 panel for selecting 5-10 km² regions and previewing terrain |
| **Conditioning Map Generator** | Yahya | Python/C++ | Tile → 6 PNG maps (elevation, aridity, slope, tectonic mask, biome, vegetation) |
| **Gaea Integration** | Badr | C++ | CLI invocation with .tor template; heightmap output processing |
| **Substrate Material** | Badr | HLSL | 6-layer landscape (bedrock, sand, clay, humus, moss, snow); auto-blending |
| **PCG Vegetation Pipeline** | Badr | Blueprint/C++ | 14 passes: boulders, moss, grass, shrubs, canopy trees, dead wood; GPU scatter |

---

## Technical Decisions & Conventions

### File Format: `.geoforge` Binary

All simulation output is stored in a custom compressed binary format:

```
HEADER (256 bytes)
  Magic: "GFG2"
  Planet params: radius, axial tilt, rotation, stellar luminosity, CO₂ level
  Grid params: 65k cells, level-6 subdivision
  Metadata: snapshot count, level count, creation timestamp

CHANNEL INDEX (512 bytes)
  24 entries, each with: byte_offset, compressed_size, uncompressed_size, dtype

CHANNEL DATA (LZ4-compressed)
  0: elevation (f32)
  1: crust_type (u8, plate/ocean/continental)
  2: temperature (f32)
  3: precipitation (f32)
  4: koppen_zone (u8)
  5: soil_order (u8)
  6: biome_class (u8, 0–16)
  7-10: vegetation weights (grass, shrub, tree, special)
  11-23: [reserved for future channels: slope, aspect, rock_fraction, canopy_density, etc.]

SNAPSHOT ARCHIVE (optional, append-only)
  For each 50 Ma interval: timestamp, elevation_quarter_res, plate_id_quarter_res

LEVEL REGISTRY (append-only)
  For each generated tile: tile_id, bounds, asset_path, thumbnail
```

**File size:** 25–35 MB without tile cache; 280–300 MB with cached tiles.

### Geodesic Grid

**Implementation:** `src/grid/geodesic_grid.py` (Python reference) + `src/simulation/grid/geodesic_grid.cpp/h` (C++ production). **Must stay in sync.**

- **Exact cell count:** 40,962 at level 6 (formula: 10×4^L + 2)
- **Topology:** 12 pentagonal cells (5 neighbours), rest hexagonal (6 neighbours)
- **Icosahedron vertex ordering:** Lines 128–141 in Python must match lines 44–50 in C++ exactly
- **Spatial indexing:** Python uses scipy.spatial.cKDTree; C++ uses custom 64³ hash grid over [-1,1]³
- **Key methods:** `LatLonToCell()` (O(1)), `CellNeighbours()` (pre-computed), `CellToLatLon()` (reverse lookup)
- **Critical:** Python/C++ must return identical cell indices for same lat/lon inputs

### ML Biosphere Profiler

- **Input:** 33 features extracted from .geoforge channels (elevation, temperature, precipitation, slope, soil order, etc.)
- **Architecture:** PyTorch 33 → 128 → 64 → 17 (softmax output = per-cell biome logits)
- **Training data:** WorldClim + GEBCO + MODIS real-world Earth samples
- **Export:** ONNX format for UE5 NNE (Neural Network Engine) inference
- **Vegetation scoring:** Liebig's Law (geometric mean of species tolerance curves); top-50 species per cell aggregated to functional types (grass/shrub/tree weights)
- **Performance:** Runs in background on RTX 5070 (~3 hours); UE5 inference per-tile in <1 second

### Climate Model

Simplified but physically motivated:

```
Temperature = T_solar - T_lapse + T_ocean_current + T_greenhouse
  T_solar = 30 × cos(latitude) × (1/orbital_distance²) × stellar_luminosity
  T_lapse = max(0, elevation_km) × 6.5°C/km
  T_greenhouse = 15 × ln(CO₂/280) / ln(2)  [Myhre 1998]

Precipitation = P_atmospheric × P_orographic × P_ocean_distance
  P_atmospheric: Hadley (1500–3000), Ferrel (800–1200), Subtropical (100–300), Polar (100–200) mm/yr
  P_orographic: Windward 1.5–3×, rain shadow 0.3–0.6×
  P_ocean_distance: <500 km boost 1.2–1.5×, >1500 km reduction 0.3–0.5×

Köppen-Geiger: Classify T and P fields to A/B/C/D/E zones
```

### Substrate Material System (UE5 5.7)

Six-layer blending with weight masks:

1. **Bedrock:** Exposed rock (high slope, low elevation)
2. **Sand:** Loose, arid soils (low precipitation, entisols)
3. **Clay:** Dense, fertile soils (temperate, moderate precipitation)
4. **Humus:** Dark organic soil (high canopy density, forest biomes)
5. **Moss:** Peat, cold/wet (low temperature, high precipitation)
6. **Snow:** High elevation (above computed snowline)

Each layer has R, G, B, Normal, Roughness textures. Weight masks (0–1 per pixel) are generated from .geoforge channels and auto-normalized to sum ≈ 1. Material blends smoothly across boundaries.

### PCG Vegetation Pipeline (14 Passes)

GPU-accelerated scatter via PCGEx:

- **Passes 1–3:** Boulders (rock_fraction channel)
- **Passes 4–6:** Moss/litter (canopy_density)
- **Passes 7–8:** Dense grass (grass_weight × max_density)
- **Passes 9–10:** Shrubs (shrub_weight)
- **Passes 11–12:** Canopy trees (tree_weight + biome_class; Nanite Skeletal rendering, GPU wind animation)
- **Passes 13–14:** Dead wood (logs, snags)

All densities driven by biosphere profiler output. No static rules; everything emerges from ML prediction.

### Nanite Skeletal Rendering

UE5 5.7 feature for dense vegetation (10,000+ trees):

- Trees stored as Nanite geometry (efficient polygon management)
- Individual trees animated via shared skeleton
- GPU-driven skeletal animation (wind sway, no per-instance overhead)
- Result: 10,000 animated trees at negligible performance cost

---

## Hackathon Schedule & Milestones

### Pre-Hackathon (Before Wednesday)

**Badr (6–8 hours):**
- [ ] Create fresh UE5 5.7 project + folder structure
- [ ] Install PCGEx plugin; download Quixel Megaplants
- [ ] **BUILD 6-LAYER SUBSTRATE MATERIAL** (critical)
- [ ] Create + test Gaea .tor template file
- [ ] UE5 plugin skeleton (2 modules: GeoForgeRuntime, GeoForgePCG)

**Yahya (12–14 hours):**
- [ ] **IMPLEMENT GEODESIC GRID** (critical; foundation for all simulation)
  - Cell generation, neighbour lookup, spatial hash
  - Unit tests: cell count, neighbour consistency, hash round-trip
- [ ] Download WorldClim (~4 GB) + GEBCO (~11 GB) datasets
- [ ] .geoforge format specification document
- [ ] FastAPI skeleton
- [ ] Three.js globe skeleton (spinning sphere)

### Wednesday: .geoforge Format + Tectonic + Climate

**Checkpoint:** Can write .geoforge file with tectonic + climate data, read it back.

**Badr (14 hours):**
1. Integrate geodesic grid into tectonic sim
2. Plate motion + boundary classification + elevation updates
3. Simulate 500 Ma without crashing
4. .geoforge file writer (header + channel index + LZ4)
5. Climate derivation (atmospheric cells, temperature, precipitation, Köppen)
6. Write all channels to .geoforge

**Yahya (14 hours):**
1. .geoforge reader (Python): `GeoForgeFile` class, LZ4 decompression, spatial hash
2. FastAPI `/tile` endpoint: tile bounds → 24 channels
3. Three.js globe: paint supercontinents, export to PNG
4. `/simulate` endpoint: planet params + texture → .geoforge path

### Thursday: UE5 Integration + ML Biosphere

**Checkpoint:** UE5 reads .geoforge, tile picker works, ML model trained + inference running.

**Badr (14 hours):**
1. Train ML biosphere profiler (runs ~3 hours in background)
2. Export PyTorch → ONNX
3. Load via NNE in UE5; create `UBiosphereProfiler` C++ class
4. Vegetation scoring (Liebig's Law); top-50 species aggregation

**Yahya (14 hours):**
1. `UGeoForgeFile` C++ reader (LZ4 decompression, spatial hash)
2. Tile picker Slate UI (globe + selection grid)
3. Conditioning map generator: 6 PNG files (elevation, aridity, slope, tectonic mask, biome, vegetation)

### Friday: Terrain + Material + PCG

**Checkpoint:** Gaea heightmap loads in UE5, Substrate material baked, PCG vegetation running, end-to-end playable.

**Badr (14 hours):**
1. Gaea integration: export conditioning maps, invoke CLI, process heightmap
2. Create ALandscape actor from heightmap
3. Generate 6 weight textures from .geoforge data
4. Apply Substrate material + bake weights
5. Build PCG graph (14 passes); link to biosphere output

**Yahya (14 hours):**
1. Landscape loading + Substrate material application
2. PCG attribute binding: biosphere output → named attributes
3. Wire attributes to PCG scatter density curves
4. Test pipeline 2–3 times; pre-simulate demo planet; generate 2–3 demo tiles

### Saturday: Polish (4 hours)

**Badr:** Stress test 3 tiles, practice pitch, record backup video
**Yahya:** Website (Next.js) + Overleaf paper (methods + results), final pipeline test, presentation slides

---

## Development Commands

**Python (Geodesic Grid & Future Modules):**
```bash
python -m venv venv && source venv/bin/activate
pip install numpy scipy pytest  # Extend for simulation/FastAPI/PyTorch later
pytest src/grid/test_geodesic_grid.py -v          # Run all grid tests
pytest src/grid/test_geodesic_grid.py::TestCellCount -v  # Single test
```

**C++ (Geodesic Grid):**
```bash
cd src/simulation/grid
g++ -std=c++17 -O2 geodesic_grid.cpp geodesic_grid_test.cpp -o grid_test
./grid_test
```

**Future (to be added):**
- C++ simulation build (CMakeLists.txt: tectonic + climate engine)
- `.geoforge` reader (Python + C++)
- FastAPI server (`uvicorn`) + Three.js dev server
- PyTorch model training & ONNX export
- UE5 plugin build + NNE inference testing

---

## Key Files & Locations

**Implemented:**
- `src/grid/geodesic_grid.py` — Python reference implementation (scipy KDTree)
- `src/grid/test_geodesic_grid.py` — Python unit tests (pytest)
- `src/simulation/grid/geodesic_grid.cpp/h` — C++ production code (custom spatial hash)
- `src/simulation/grid/geodesic_grid_test.cpp` — C++ unit tests

**Not Yet Implemented:**
- `src/simulation/` — C++ tectonic + climate engine
- `src/ml/` — PyTorch biosphere profiler
- `src/server/` — FastAPI backend
- `src/web/` — Three.js globe UI
- `unreal/GeoForge/` — UE5 5.7 project root
  - `Plugins/GeoForgeRuntime/` — .geoforge reader + tile picker
  - `Plugins/GeoForgePCG/` — PCG pipeline + attribute binding
- `docs/` — Overleaf paper source

---

## Communication & Handoffs

- **Yahya's work unblocks Badr's:** Geodesic grid must be complete before simulation integration; .geoforge reader is needed before conditioning maps
- **Badr's work unblocks Yahya's:** ML model ONNX export is needed for UE5 inference
- **Daily sync points:** Wednesday/Thursday/Friday end-of-day to verify file compatibility, test end-to-end data flow
- **Demo planet:** Pre-simulate one planet Friday evening; use for all Saturday demos and stress testing

---

## Testing & Verification

### Pre-Implementation
- Geodesic grid: unit tests for cell count (exactly 65,538 after level-6 subdivision), neighbour consistency, spatial hash round-trip

### Wednesday Checkpoint
- Badr: simulate 500 Ma → write .geoforge → verify file structure
- Yahya: read Badr's file → extract tile → return 24 channels
- **Both:** Paint on globe → trigger simulation → read result file back

### Thursday Checkpoint
- Badr: ML inference on real .geoforge data
- Yahya: Read .geoforge in UE5; tile picker displays correctly
- **Both:** Select tile → all 6 conditioning maps generated

### Friday Checkpoint
- Badr: Gaea CLI invocation → heightmap output → ALandscape created
- Yahya: PCG runs without crashes; vegetation visible
- **Both:** Full pipeline 2–3 times; playable level in 2–3 minutes per tile

### Saturday
- **Both:** Stress test 3 different tiles, no crashes
- **Both:** Record backup demo video

---

## Scientific References

(Guides simulation implementation; see PRD.md for full citations)

- **Tectonics:** Bird (2003) Plate Boundary Model; Parsons & Sclater (1977) Ocean Floor Bathymetry
- **Climate:** Myhre et al. (1998) Greenhouse Gas Forcing; Kottek et al. (2006) Köppen-Geiger; Holdridge (1967) Life Zone Ecology
- **Biosphere:** Kattge et al. (2020) TRY Plant Database
- **Inspiration:** Worldbuilding Pasta (2020–2025) Climate modeling blog series

---

## Notes for Future Developers

1. **The geodesic grid is the single most critical pre-work.** All simulation, file format, and UE5 integration depend on it. Test thoroughly with unit tests before hackathon.

2. **.geoforge file format is the contract between Badr and Yahya.** Agree on channel order, data types, and LZ4 compression settings upfront (Wednesday 10 AM).

3. **Conditioning maps are the bridge from simulation to UE5.** Generate all 6 maps before Gaea integration; they're the input to the rest of the pipeline.

4. **ML biosphere profiler runs in the background.** Don't wait for it; Badr can start UE5 integration (Substrate material, PCG framework) while training.

5. **Nanite Skeletal + PCGEx are UE5 5.7-specific.** These features are not available in earlier versions. Ensure environment is 5.7+.

6. **End-to-end demo: tile → level in 2–3 minutes.** This is the metric for success. Optimize the bottleneck (likely Gaea CLI invocation or PCG graph execution).

7. **No multiplayer, no real-time collab, no production UX polish.** Scope is strictly hackathon-scoped. If it's not on the checklist, it's out of scope.
