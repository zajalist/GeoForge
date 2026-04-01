# GeoForge — Product Requirements Document

## 1. Overview

GeoForge is a science-driven procedural planet generation system. It simulates planetary tectonics from first principles, derives climate and biosphere from physical models, and renders the result as explorable UE5 terrain with auto-blended materials and vegetation.

**Problem:** Current worldbuilding tools generate terrain from noise functions with no physical basis. Forests, deserts, and mountains are placed manually or randomly — nothing has a _cause_.

**Solution:** GeoForge simulates up to 2,000 million years of tectonic history on a geodesic grid — enough for multiple supercontinent assembly-and-breakup cycles. The user controls when to stop. Climate is derived via atmospheric circulation models, biomes are predicted with a trained ML classifier, and any 5-10 km tile is rendered as a fully textured UE5 landscape with PCG-scattered vegetation — all driven by the simulation data.

## 2. Goals & Non-Goals

### Goals (Hackathon Scope)
- Simulate tectonic plate motion and elevation evolution over up to 2,000 Ma (multiple supercontinent cycles)
- Derive temperature, precipitation, and Koppen climate zones from first principles
- Train an ML biome classifier (33 features -> 17 biome classes) and export to ONNX
- Define and implement the `.geoforge` binary file format (24 channels, LZ4-compressed)
- Build a web UI for painting supercontinents and triggering simulation
- Integrate with UE5 5.7: tile selection, Gaea heightmap generation, Substrate material blending, PCG vegetation scatter
- Demonstrate end-to-end pipeline: paint -> simulate -> select tile -> playable level in 2-3 minutes

### Non-Goals
- Multiplayer or real-time collaboration
- Full ocean circulation simulation (pre-computed approximation used)
- Atmospheric fluid dynamics (simplified cell model)
- Biome-level ecosystem simulation (species interactions, food webs)
- Mobile or console targets
- Production-grade UI/UX polish

## 3. Target Users

- **Game developers** seeking scientifically grounded terrain for open-world games
- **Worldbuilders** (tabletop RPG, fiction) who want physically consistent planets
- **Researchers** exploring climate or tectonic visualization

## 4. Core Features

### 4.1 Geodesic Icosphere Grid
- Level-6 subdivision producing ~65,000 cells
- Neighbour lookup and spatial hash (lat/lon <-> cell index)
- Foundation for all simulation and data storage

### 4.2 Tectonic Simulation
- Plate motion with boundary classification (convergent, divergent, transform)
- Elevation updates driven by plate interactions
- Snapshot system recording state every 50 Ma
- Up to 2,000 Ma simulation depth (user-controlled stop point)
- Multiple supercontinent assembly-and-breakup cycles

### 4.3 Climate Derivation
- **Temperature:** Solar input, lapse rate, ocean current influence, greenhouse forcing (Myhre 1998)
- **Precipitation:** Atmospheric cells (Hadley/Ferrel/Polar), orographic effects, ocean distance
- **Classification:** Koppen-Geiger zones derived from T and P fields
- **Soil order** estimation from climate + geology

### 4.4 ML Biosphere Profiler
- PyTorch model: 33-feature input -> 128 -> 64 -> 17 biome classes
- Training data: WorldClim + GEBCO + MODIS
- ONNX export for UE5 inference via NNE (Neural Network Engine)
- Vegetation scoring via Liebig's Law (product of tolerance curves)
- Top-50 species per cell, aggregated to functional types (grass, shrub, tree weights)

### 4.5 `.geoforge` Binary File Format
- 256-byte header (planet params, grid params)
- 512-byte channel index (24 channels: elevation, crust type, temperature, precipitation, Koppen zone, soil order, biome class, vegetation weights, etc.)
- LZ4-compressed channel data
- Optional snapshot archive (tectonic history at 50 Ma intervals)
- Append-only level registry (generated tile metadata + thumbnails)
- File size: 25-35 MB without tile cache, 280-300 MB with cache

### 4.6 Web UI
- **Three.js globe** for painting supercontinent layout and land fraction
- Paint export to PNG
- FastAPI backend: `/tile` endpoint (tile bounds -> 24 channel data), `/simulate` endpoint (planet params + texture -> .geoforge path)

### 4.7 UE5 5.7 Integration
- **C++ .geoforge reader** (`UGeoForgeFile` class with LZ4 decompression)
- **Tile picker** (Slate UI panel with globe + tile selection grid)
- **Conditioning map generation** (6 PNGs: elevation, aridity, slope, tectonic mask, biome class, vegetation weights)
- **Gaea integration** (CLI invocation with .tor template -> heightmap output)
- **Substrate material** (6-layer landscape: bedrock, sand, clay, humus, moss, snow) with weight masks derived from .geoforge channels
- **PCG vegetation pipeline** (14 passes: boulders, moss/litter, dense grass, shrubs, canopy trees, dead wood) with density driven by ML biosphere output
- **Nanite Skeletal Rendering** for tree instances with GPU-driven wind animation

## 5. Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Web UI          |     |   FastAPI Server   |     |   Simulation      |
|   (Three.js)      |---->|   (Python)         |---->|   Engine          |
|   Globe painting  |     |   /simulate        |     |   Tectonics       |
|   Tile preview    |     |   /tile            |     |   Climate         |
+-------------------+     +-------------------+     |   Biosphere (ML)  |
                                   |                 +-------------------+
                                   |                          |
                                   v                          v
                          +-------------------+     +-------------------+
                          |   .geoforge File  |<----|   File Writer     |
                          |   (Binary, LZ4)   |     |   24 channels     |
                          +-------------------+     +-------------------+
                                   |
                    +--------------+--------------+
                    v                             v
          +-------------------+         +-------------------+
          |   UE5 Plugin      |         |   Conditioning    |
          |   .geoforge Reader|         |   Map Generator   |
          |   Tile Picker     |         |   6x PNG maps     |
          +-------------------+         +-------------------+
                    |                             |
                    v                             v
          +-------------------+         +-------------------+
          |   Gaea CLI        |         |   Substrate       |
          |   Heightmap Gen   |         |   Material (6L)   |
          +-------------------+         +-------------------+
                    |                             |
                    v                             v
          +-------------------+         +-------------------+
          |   ALandscape      |         |   PCG Pipeline    |
          |   Actor           |         |   14 passes       |
          |   (UE5 Terrain)   |         |   (GPU scatter)   |
          +-------------------+         +-------------------+
```

**Data Flow:**
1. User paints supercontinent on Three.js globe
2. FastAPI triggers simulation engine (tectonics -> climate -> biosphere)
3. Engine writes `.geoforge` file (24 channels + snapshots)
4. UE5 plugin reads `.geoforge`, user selects 5-10 km tile
5. Conditioning maps extracted (6 PNGs)
6. Gaea generates detailed heightmap from conditioning data
7. UE5 creates landscape, bakes Substrate material weights, runs PCG scatter
8. Result: explorable, physically-motivated terrain

## 6. Tech Stack

| Component | Technology | Language |
|---|---|---|
| Geodesic grid | Custom implementation | C++ / Python |
| Tectonic simulation | Custom physics | C++ |
| Climate derivation | Atmospheric models | C++ |
| ML biosphere profiler | PyTorch -> ONNX | Python |
| File format | `.geoforge` (custom binary, LZ4) | C++ / Python |
| Web backend | FastAPI | Python |
| Web frontend | Three.js | JavaScript |
| Terrain generation | Gaea (CLI) | External tool |
| Game engine | Unreal Engine 5.7 | C++ / Blueprint |
| Material system | Substrate (6-layer) | HLSL |
| Vegetation scatter | PCG + PCGEx (GPU) | Blueprint / C++ |
| Tree rendering | Nanite Skeletal | UE5 built-in |
| Documentation | Overleaf | LaTeX |
| Website | Next.js | TypeScript |

## 7. Team & Responsibilities

### Badr
- UE5 project setup + plugin skeleton
- Substrate landscape material (6 layers)
- Gaea .tor template
- Tectonic simulation
- Climate derivation
- ML biosphere profiler (training + ONNX export)
- Gaea integration (CLI -> heightmap)
- Landscape creation + Substrate weight baking
- PCG vegetation pipeline (14 passes)

### Yahya
- Geodesic icosphere subdivision (level 6, 65k cells)
- Dataset acquisition (WorldClim, GEBCO, MODIS)
- `.geoforge` format specification + Python reader
- FastAPI backend
- Three.js globe UI
- UE5 `.geoforge` C++ reader
- Tile picker (Slate UI)
- Conditioning map generation (6 PNGs)
- PCG attribute binding
- Website + Overleaf paper

## 8. Success Criteria

### Wednesday End
- Tectonic simulation runs up to 2,000 Ma without crashing (user stops at chosen point)
- `.geoforge` file written with all climate channels
- Python reader can parse `.geoforge` and extract tile data
- Globe UI paints and exports to simulation

### Thursday End
- ML model trained and exported to ONNX
- Inference works: 33 features -> 17 biome logits
- Vegetation scoring (Liebig's Law) produces per-cell weights
- UE5 reads `.geoforge` file natively
- Tile picker selects 5 km^2 region
- 6 conditioning PNGs generated from tile data

### Friday End
- Gaea CLI invocation produces heightmap from conditioning data
- UE5 landscape created from Gaea output
- Substrate material auto-blends 6 soil types
- PCG scatters vegetation from biosphere masks
- End-to-end: tile selection -> playable level in 2-3 minutes

### Saturday
- Full demo tested 3+ times without crashes
- Website live with screenshots
- Overleaf paper has methods + results sections

## 9. Scientific References

- Bird, P. (2003). "An updated digital model of plate boundaries." _Geochemistry, Geophysics, Geosystems_, 4(3).
- Parsons, B. & Sclater, J.G. (1977). "Analysis of ocean floor bathymetry and heat flow with age." _JGR_, 82(5).
- Myhre, G., et al. (1998). "New estimates of radiative forcing due to well mixed greenhouse gases." _GRL_, 25(14).
- Kottek, M., et al. (2006). "World map of the Koppen-Geiger climate classification updated." _Meteorol. Z._, 15(3).
- Holdridge, L.R. (1967). _Life Zone Ecology_. Tropical Science Center.
- Kattge, J., et al. (2020). "TRY plant trait database - enhanced coverage." _Global Change Biology_, 26(1).
- Worldbuilding Pasta (2020-2025). Climate modeling series. worldbuildingpasta.blogspot.com
