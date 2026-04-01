# GeoForge — 3.5-Day Hackathon Plan (2-Person Edition, FINAL)
## Badr & Yahya: High-Resolution Tile Architecture

---

## TASK DIVISION SUMMARY

**Yahya's Heavy Lifting:** Geodesic icosphere subdivision (pre-work) + .geoforge reader + UE5 integration  
**Badr's Heavy Lifting:** ML biosphere profiler (Wed) + PCG pipeline (Fri)

---

## Pre-Hackathon Prep (Must Be Done Before Wednesday)

### Badr's Pre-work (6–8 hours)
- [ ] Create fresh UE5 5.7 project
- [ ] Install PCGEx plugin; download Quixel Megaplants
- [ ] **Build 6-layer Substrate landscape material** (bedrock, sand, clay, humus, moss, snow) — **CRITICAL**
- [ ] Create + test Gaea .tor template file
- [ ] UE5 plugin skeleton (2 modules)

### Yahya's Pre-work (12–14 hours) — **HEAVY**
- [ ] **Implement geodesic icosphere subdivision** (level 6, 65k cells)
  - Cell generation
  - Neighbour lookup
  - Spatial hash (lat/lon ↔ cell index)
  - **This is the foundation. Test thoroughly.**
- [ ] Download datasets (WorldClim 4GB, GEBCO 11GB, MODIS optional)
- [ ] .geoforge format spec document
- [ ] FastAPI skeleton
- [ ] Three.js globe skeleton

---

## Wednesday–Saturday: Three Clear Checkpoints

### WEDNESDAY: .geoforge File Format + Tectonic Simulation
**Checkpoint: Can write .geoforge file with tectonic history, read it back**

#### Badr — Wednesday (10:00–24:00, 14 hours)

**10:00–14:00:** Tectonic simulation (basic)
- Integrate Yahya's geodesic grid
- Plate motion + boundary classification + elevation updates
- Simulate 500 Ma without crashing
- Add snapshot system

**14:00–18:00:** .geoforge file writer
- Write header + channel index + 24 channels with LZ4 compression
- Test: simulate → export → verify file readable

**18:00–24:00:** Climate derivation
- Atmospheric cells (Hadley/Ferrel/Polar)
- Temperature field (solar + lapse rate + ocean current + greenhouse)
- Precipitation field (atmospheric + orographic + ocean distance)
- Köppen classification
- Write all climate channels to .geoforge

**End:** Can write complete .geoforge file with climate data.

#### Yahya — Wednesday (10:00–24:00, 14 hours)

**10:00–14:00:** .geoforge reader (Python)
- `GeoForgeFile` class (header + channel index + LZ4 decompression)
- Spatial hash query (tile lat/lon → cell indices)
- Test reading Badr's .geoforge file

**14:00–18:00:** Tile extraction pipeline
- FastAPI `/tile` endpoint (accept tile bounds, return 24 channels)
- Tile bounds → cell indices conversion
- Test: Badr generates file, Yahya's server reads + extracts tile

**18:00–24:00:** Globe UI + export
- Three.js globe (paint supercontinent, land fraction counter)
- Paint export to PNG
- POST to `/simulate`: send planet params + texture, get .geoforge path back

**End:** Can read .geoforge files, extract tiles, globe paints and exports.

**✓ WEDNESDAY CHECKPOINT:**
```
✓ Badr: Tectonic simulation 500 Ma → .geoforge file with climate
✓ Yahya: Read .geoforge file → extract tile channels
✓ Both: Globe paints → simulation runs → file generated → file read
```

---

### THURSDAY: UE5 Integration + ML Biosphere Profiler
**Checkpoint: Can open .geoforge in UE5, select 5km² tile, ML pipeline ready**

#### Badr — Thursday (10:00–24:00, 14 hours)

**10:00–14:00:** Train ML biosphere profiler
- Load training data (WorldClim + GEBCO + MODIS)
- Extract 33-feature vectors + labels
- Train PyTorch: 33 → 128 → 64 → 17 (biome classes)
- **Runtime: ~3 hours on RTX 5070 (runs in background)**

**14:00–18:00:** ONNX export + UE5 integration
- Export PyTorch model to ONNX
- Load via NNE in UE5
- Create `UBiosphereProfiler` C++ class
- Test inference: 33 features → 17 biome logits

**18:00–24:00:** Vegetation scoring + biosphere pipeline
- Implement Liebig's Law (product of tolerance curves)
- Top-50 species per cell
- Aggregate to functional types
- Create `FBiosphereProfile` struct
- **Output:** Each cell knows biome + vegetation weights

**End:** 
- ✓ ML model trained + ONNX exported
- ✓ Can run inference on .geoforge data
- ✓ Vegetation scoring complete

#### Yahya — Thursday (10:00–24:00, 14 hours)

**10:00–14:00:** UE5 .geoforge reader (C++)
- `UGeoForgeFile` class (read binary, decompress LZ4)
- Spatial hash query in C++
- Test reading .geoforge in UE5 editor

**14:00–18:00:** Tile picker in UE5
- Slate UI panel (globe + tile selection grid)
- Tile bounds display + selection
- Tile data fetch via `ReadTile()`

**18:00–24:00:** Conditioning map generation
- Python/C++ script: .geoforge tile → 6 PNG maps:
  1. Elevation (512×512, float16)
  2. Aridity index (0–1)
  3. Slope orientation (RG gradient)
  4. Tectonic feature mask
  5. Biome class map (from ML)
  6. Vegetation weight map (grass/tree/shrub)
- These feed Gaea + PCG tomorrow

**End:**
- ✓ UE5 reads .geoforge + extracts tile
- ✓ Tile picker works (select 5 km² region)
- ✓ Conditioning maps generated

**✓ THURSDAY CHECKPOINT:**
```
✓ Badr: ML model trained + ONNX ready + vegetation scoring done
✓ Yahya: UE5 reads .geoforge + tile picker works
✓ Yahya: Conditioning maps generated (elevation, aridity, slope, biome, vegetation)
✓ Both: Select tile → all maps ready for Gaea + PCG
```

---

### FRIDAY: UE5 Terrain + Material + PCG
**Checkpoint: Gaea heightmap loads in UE5, Substrate material baked, PCG vegetation running**

#### Badr — Friday (10:00–24:00, 14 hours)

**10:00–14:00:** Gaea integration
- Export conditioning maps to disk
- Invoke Gaea CLI with .tor template
- Poll output directory for heightmap
- Read PNG → convert to UE5 landscape format

**14:00–18:00:** Landscape creation + Substrate material
- Create ALandscape actor from heightmap
- Generate 6 weight textures from .geoforge:
  - Layer 1 (bedrock): from tectonic_flags + slope
  - Layer 2 (sand): from soil_order + precip
  - Layer 3 (clay): from soil_order
  - Layer 4 (humus): from canopy_density + ML biome
  - Layer 5 (moss): from koppen_zone
  - Layer 6 (snow): from elevation vs. snowline
- Apply Substrate material + bake weights
- **Result:** Auto-blended 6-layer landscape

**18:00–24:00:** PCG vegetation scatter
- Build PCG graph:
  - Pass 1–3: Boulders (rock_fraction)
  - Pass 4–6: Moss/litter (canopy_density)
  - Pass 7–8: **Dense grass** (grass_weight + vegetation scoring)
  - Pass 9–10: Shrubs (shrub_weight)
  - Pass 11–12: Canopy trees (tree_weight + ML biome, Nanite Skeletal)
  - Pass 13–14: Dead wood (logs + snags)
- Link PCG density to ML biosphere output
- Test one tile; verify no crashes

**End:**
- ✓ Gaea integration working
- ✓ UE5 landscape created + Substrate baked
- ✓ PCG vegetation scattering from masks

#### Yahya — Friday (10:00–24:00, 14 hours)

**10:00–14:00:** Landscape loading + material setup
- Wait for Gaea output
- Create ALandscape actor
- Set heightmap data
- Apply Substrate material
- Test 3 different heightmaps + blending

**14:00–18:00:** PCG attribute binding
- PCG node reads biosphere profiler output from .geoforge
- Bind grass_weight, tree_weight, biome_class as named attributes
- Wire attributes → PCG scatter density curves
- **Example:** grass_density = grass_weight × max_count

**18:00–24:00:** Demo preparation
- Test full pipeline 2–3 times (tile selection → terrain → material → PCG)
- Fix crashes
- Pre-simulate demo planet
- Generate 2–3 tiles from demo planet
- Record video backup

**End:**
- ✓ UE5 landscape loads from Gaea
- ✓ Substrate material weights applied
- ✓ PCG vegetation scatters using biosphere output
- ✓ Demo planet ready

**✓ FRIDAY CHECKPOINT:**
```
✓ Badr: Gaea integration done + UE5 landscape created + Substrate material baked
✓ Badr: PCG runs on vegetation masks (grass/shrub/tree)
✓ Yahya: Material weights linked to biosphere data
✓ Yahya: PCG scatter density from ML output
✓ Both: End-to-end pipeline (tile selection → playable level in 2–3 min)
```

---

### SATURDAY: Final Polish (4 hours)

#### Badr (10:00–14:00)
- **10:00–12:00:** Stress test (3 different tiles, verify no crashes)
- **12:00–14:00:** Demo walkthrough (practice pitch, record backup video)

#### Yahya (10:00–14:00)
- **10:00–12:00:** Website + Overleaf paper (add screenshots, scientific citations)
- **12:00–14:00:** Final checks (test pipeline, prepare slides)

---

## Part 5: PCG 5.7 Integration (EXPLAINED CLEARLY)

### What is PCG?

**PCG = Procedural Content Generation.** It's UE5's visual node system for scattering objects (rocks, trees, grass) based on rules and density functions.

Example:
```
Read heightmap
    ↓
Read slope angle from .geoforge
    ↓
IF slope > 30° THEN density = 0.1 (sparse trees on steep)
IF slope < 10° THEN density = 0.8 (dense trees on flat)
    ↓
Scatter tree instances
```

### What's New in 5.7?

**1. Substrate Materials (6-Layer Blending)**

Instead of 2–3 landscape layers, you get **6 independent layers**, each with color, normal, roughness.

```
Layer 1: Bedrock (exposed rock)
Layer 2: Sand (loose)
Layer 3: Clay loam (dense, fertile)
Layer 4: Humus (dark organic soil)
Layer 5: Moss/peat (wet, cold)
Layer 6: Snow (high elevation)
```

Each layer has a **weight mask** (0–1 per pixel). The material blends them smoothly.

**Where weights come from:**
```cpp
// Pseudocode: generate layer weights from .geoforge channels

float bedrock_weight = (slope[pixel] > 30.0f) ? 1.0f : 0.0f;
float sand_weight = (precip[pixel] < 300.0f && soil_order == ENTISOL) ? 1.0f : 0.0f;
float clay_weight = (temp > -5.0f && temp < 20.0f && precip > 400) ? 1.0f : 0.0f;
float humus_weight = (canopy_density[pixel] > 150) ? 1.0f : 0.0f;
float moss_weight = (temp < 5.0f && precip > 500) ? 1.0f : 0.0f;
float snow_weight = (elevation > snowline) ? 1.0f : 0.0f;

// Normalize so they sum to ~1
float total = bedrock + sand + clay + humus + moss + snow;
if (total > 0.01f) {
    bedrock_weight /= total;
    sand_weight /= total;
    // etc...
}

// Write to 6 layer weight textures
layer1_tex[pixel] = bedrock_weight * 255;
layer2_tex[pixel] = sand_weight * 255;
// etc...
```

**Result:** Forest clearing shows humus + grass. Mountain peak shows bedrock + snow. Desert shows sand + bedrock. Automatic blending.

**2. Nanite Skeletal Rendering (Nanite Skinning)**

Dense grass (1M+ instances) kills performance normally.

**Solution in 5.7:** Nanite Skeletal Rendering
- Trees stored as Nanite geometry (efficient)
- Individual trees animated via shared skeleton
- Wind sway via GPU-driven skeletal animation
- All 10,000 trees animated at negligible cost

```cpp
// Pseudocode: place Nanite instances with wind animation

for (int i = 0; i < num_trees; i++) {
    FVector position = compute_tree_position(i);
    float height = compute_tree_height(i);
    
    UNaniteSkeletalAssembly* tree = LoadNaniteTree("oak_tree_v1");
    tree->SetHeight(height);
    tree->SetPosition(position);
    tree->SetAnimationCurve("wind_sway", wind_wave_function);  // GPU-driven
    
    world->AddInstance(tree);
}
```

**Why:** 10,000 tree actors = 60 fps drop. 10,000 Nanite instances = negligible cost.

**3. PCGEx GPU-Accelerated Scatter**

CPU scatter is slow. PCGEx provides **GPU compute shader** nodes.

```
Density field (GPU)
    ↓
GPU compute shader generates random positions
    ↓
Sample height at each position
    ↓
Output: 1M points in <100 ms
    ↓
Place mesh instances at those points
```

All GPU-accelerated.

---

## Part 6: Climate Model (Simplified)

### Temperature
```
T = T_solar - T_lapse + T_ocean_current + T_greenhouse

T_solar = 30 × cos(latitude) × (1/orbital_distance²) × stellar_luminosity
T_lapse = max(0, elevation_km) × 6.5
T_ocean_current = (pre-computed from ocean circulation)
T_greenhouse = 15 × ln(CO₂/280) / ln(2)  [Myhre 1998]
```

### Precipitation
```
P = P_atmospheric × P_orographic × P_ocean_distance

P_atmospheric:
  Hadley cell (±5°): 1500–3000 mm/yr
  Ferrel cell (30–60°): 800–1200 mm/yr
  Subtropical high (±30°): 100–300 mm/yr
  Polar cell (60–90°): 100–200 mm/yr

P_orographic:
  Windward slope: 1.5–3× base P
  Rain shadow: 0.3–0.6× base P

P_ocean_distance:
  <500 km from warm ocean: 1.2–1.5× boost
  >1500 km inland: 0.3–0.5× reduction
```

### Köppen-Geiger Classification
```
Is T_min ≥ 18°C? → Tropical (A)
Is P < threshold? → Arid (B)
Is T_max ≥ 10°C AND T_min ≥ -3°C? → Temperate (C)
Is T_max ≥ 10°C? → Continental (D)
Otherwise → Polar (E)
```

---

## Part 7: File Format Details

### .geoforge Structure (Binary)

```
HEADER (256 bytes)
  Magic: "GFG2"
  Planet params (radius, axial tilt, rotation, stellar luminosity)
  Grid params (65k cells, subdivision level 6)
  Snapshots, level count

CHANNEL INDEX (512 bytes)
  For each of 24 channels:
    byte_offset, compressed_size, uncompressed_size, dtype

CHANNEL DATA (LZ4-compressed)
  Channel 0: elevation (f32)
  Channel 1: crust_type (u8)
  ... 22 more channels ...

SNAPSHOT ARCHIVE (optional)
  For each 50 Ma interval:
    timestamp, elevation_quarter_res, plate_id_quarter_res

LEVEL REGISTRY (append-only)
  For each tile:
    level_id, centre_lat/lon, bounds, asset_path, timestamp, status, thumbnail
```

### File Size
```
Without tile cache:  25–35 MB (shareable)
With tile cache:     280–300 MB (local high-performance)
```

---

## Part 8: Stack Summary

| Component | Owner | Language | Days |
|-----------|-------|----------|------|
| Geodesic grid | Yahya | C++/Python | Pre-work |
| Tectonic simulation | Badr | C++ | Wed |
| Climate derivation | Badr | C++ | Wed |
| .geoforge reader | Yahya | Python | Wed |
| ML biosphere profiler | Badr | PyTorch/ONNX | Thu |
| UE5 .geoforge integration | Yahya | C++ | Thu |
| Tile picker | Yahya | Slate UI | Thu |
| Conditioning maps | Yahya | Python | Thu |
| Gaea integration | Badr | C++ | Fri |
| Substrate material | Badr | HLSL | Fri |
| PCG pipeline | Badr | UE5 Blueprint | Fri |
| PCG attribute binding | Yahya | C++/Blueprint | Fri |
| Website | Yahya | Next.js | Fri–Sat |
| Overleaf paper | Yahya | LaTeX | Fri–Sat |

---

## Part 9: Scientific References

### Tectonic Physics
- Bird, P. (2003). "An updated digital model of plate boundaries." *Geochemistry, Geophysics, Geosystems*, 4(3).
- Parsons, B. & Sclater, J.G. (1977). "Analysis of ocean floor bathymetry and heat flow with age." *JGR*, 82(5).

### Climate
- Myhre, G., et al. (1998). "New estimates of radiative forcing due to well mixed greenhouse gases." *GRL*, 25(14).
- Kottek, M., et al. (2006). "World map of the Köppen-Geiger climate classification updated." *Meteorol. Z.*, 15(3).
- Holdridge, L.R. (1967). *Life Zone Ecology*. Tropical Science Center.

### Biosphere
- Kattge, J., et al. (2020). "TRY plant trait database – enhanced coverage." *Global Change Biology*, 26(1).

### Implementation Reference
- Worldbuilding Pasta (2020–2025). Climate modeling series. worldbuildingpasta.blogspot.com

---

## Checklist: What Success Looks Like

### Wednesday End
- [ ] Badr: Tectonic simulation 500 Ma → .geoforge file
- [ ] Badr: Climate derivation (T, P, Köppen, soil)
- [ ] Yahya: Read .geoforge file in Python
- [ ] Yahya: Extract tile from .geoforge
- [ ] Both: Globe paints → simulation runs → file generated

### Thursday End
- [ ] Badr: ML model trained + ONNX exported
- [ ] Badr: Can run inference (33 features → 17 biome logits)
- [ ] Badr: Vegetation scoring (Liebig's Law) complete
- [ ] Yahya: UE5 reads .geoforge file
- [ ] Yahya: Tile picker works (select 5 km² region)
- [ ] Yahya: Conditioning maps generated (6 PNG files)

### Friday End
- [ ] Badr: Gaea invocation working (CLI → heightmap output)
- [ ] Badr: UE5 landscape created from heightmap
- [ ] Badr: Substrate material baked (6 layers blended)
- [ ] Badr: PCG runs without crashes
- [ ] Yahya: Material weights linked to biosphere data
- [ ] Yahya: PCG scatter density driven by ML output
- [ ] Both: End-to-end pipeline (tile → level in 2–3 min)

### Saturday
- [ ] Full demo tested 3+ times without crashes
- [ ] Website has screenshots + paper link
- [ ] Overleaf paper has methods + results sections
- [ ] Ready to present

---

## The 5-Minute Pitch

> "We simulate planetary tectonics from first principles. Every mountain forms because plates collided. Climate emerges from atmospheric circulation + elevation + ocean currents. Vegetation is scored by Liebig's Law — one limiting factor kills the score.
>
> We select a 10 km tile. The system generates a detailed heightmap via Gaea, seeded by our simulation data. UE5 loads the terrain and automatically blends 6 soil types using a Substrate material. PCG scatters vegetation based on climate + biosphere predictions.
>
> Everything you see has a cause. The forest exists because the climate supports it. The sparse ridge exists because the slope is too steep and soil too thin. The snow patches are above the computed snowline.
>
> We wrote a paper about it. It's real science, not heuristics."

---

## Go. You've Got This.

Good luck. Get sleep (4–5 hrs/night is doable). Trust the plan.
