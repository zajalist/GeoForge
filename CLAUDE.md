# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GeoForge** is a science-driven procedural planet generation system. Simulates planetary tectonics from first principles, derives climate and biosphere from physical models, renders explorable UE5 terrain with physically-motivated vegetation. Full pipeline: 2-3 minutes per tile.

**Team:**
- **Badr:** Tectonic simulation, climate derivation, ML biosphere profiler, Gaea integration, Substrate materials, PCG vegetation pipeline
- **Yahya:** Geodesic grid, .geoforge format & reader, FastAPI backend, Three.js UI, UE5 plugin, tile picker, conditioning maps, website

---

## Pipeline

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
```

---

## Development Commands

```bash
# Setup
python -m venv venv && source venv/Scripts/activate  # Windows
pip install -r src/server/requirements.txt

# Run server (auto-reloads on save)
cd src/server && uvicorn server:app --reload --port 8000
# Open http://localhost:8000

# Python tests
pytest src/grid/test_geodesic_grid.py -v
pytest src/server/test_geoforge_integration.py -v
pytest src/server/test_geoforge_integration.py::TestPipeline -v  # single class

# C++ grid tests
cd src/simulation/grid
g++ -std=c++17 -O2 geodesic_grid.cpp geodesic_grid_test.cpp -o grid_test && ./grid_test
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/server/server.py` | FastAPI server — `/simulate`, `/result`, `/tile`, `/status`, `/grid`; pre-generates grid JSON on startup |
| `src/server/sim_runner.py` | **Active** Python tectonic + climate simulation (C++ not yet integrated) |
| `src/server/geoforge.py` | `.geoforge` reader + writer + spatial utilities; `query_tile()` handles antimeridian wrap |
| `src/server/grid_export.py` | Grid → gzipped JSON for Three.js; cached at `src/web/data/grid_level{N}.json.gz` |
| `src/server/test_geoforge_integration.py` | Integration tests (23 tests) |
| `src/web/globe.js` | Three.js geodesic globe renderer + paint tools; `GeodesicGlobe` class |
| `src/web/ui.js` | Simulation controls, progress polling, result display; `GeoForgeUI` class |
| `src/web/api.js` | Fetch wrappers for all `/api/*` endpoints |
| `src/grid/geodesic_grid.py` | Python reference grid (scipy KDTree) |
| `src/simulation/grid/geodesic_grid.cpp` | C++ production grid (custom spatial hash) |

---

## .geoforge Binary Format

```
HEADER (256 bytes)
  Magic: "GFG2"
  Planet params: radius(f32), axial_tilt(f32), rotation(f32), stellar_luminosity(f32), co2_ppm(f32)
  Grid params: cell_count(u32), grid_level(u8)
  Metadata: snapshot_count(u16), level_count(u16), creation_timestamp(f64)

CHANNEL INDEX (512 bytes)
  24 entries × 20 bytes: byte_offset(u64) + compressed_size(u32) + uncompressed_size(u32) + dtype(u8) + 3-pad

CHANNEL DATA (LZ4-compressed blobs)
  0:  elevation        f32   meters above sea level
  1:  crust_type       u8    0=oceanic, 1=continental
  2:  plate_id         u8    0=background, 1+ = plate ID
  3:  ocean_age        u16   Ma since crust formed at ridge
  4:  orogeny_type     u8    0=none, 1=high, 2=medium, 3=low, 4=andean
  5:  margin_type      u8    0=passive, 1=active
  6:  is_suture_zone   u8    bool — old collision boundary, weak point for future rifting
  7:  suture_age       u16   Ma since suturing
  8:  is_volcanic_arc  u8    bool
  9:  is_aulacogen     u8    bool — failed rift branch
  10: temperature      f32   °C
  11: precipitation    f32   mm/yr
  12: koppen_zone      u8    1=A(tropical) 2=B(arid) 3=C(temperate) 4=D(continental) 5=E(polar)
  13: soil_order       u8    (pending climate derivation)
  14: biome_class      u8    0–16 (pending ML model)
  15: veg_grass        f32   vegetation weight (pending ML)
  16: veg_shrub        f32
  17: veg_tree         f32
  18: veg_special      f32
  19-23: reserved      u8

SNAPSHOT ARCHIVE (optional, append-only)
  Every 50 Ma: timestamp, elevation_quarter_res, plate_id_quarter_res

LEVEL REGISTRY (append-only)
  Per tile: tile_id, bounds, asset_path, thumbnail
```

**File size:** 25–35 MB without tile cache; 280–300 MB with cached tiles.

**dtype IDs:** 0=f32, 1=u8, 2=u16

**Current Python mapping (sim_runner.py output):** Channels 0–4 are written as elevation, crust_type, temperature, precipitation, koppen. The tectonic channels 2–9 in the spec above are **placeholders** (all zeros) until Badr's C++ sim is integrated — at which point the Python climate channels will shift to 10–12 to match the spec layout.

---

## Geodesic Grid

- **Exact cell count:** 10×4^L + 2 → level 3 = 642, level 6 = 40,962
- **Topology:** 12 pentagonal cells (5 neighbours), rest hexagonal (6 neighbours)
- **Python:** `src/grid/geodesic_grid.py` uses scipy.cKDTree; **C++:** `src/simulation/grid/geodesic_grid.cpp` uses custom 64³ hash grid over [-1,1]³
- **Critical:** Both implementations must return identical cell indices for the same lat/lon. Icosahedron vertex ordering in Python lines 128–141 must match C++ lines 44–50.

---

## Tectonic Simulation Algorithm (Badr — C++)

See `docs/tectonic_simulation_plan.md` and `tectonic_algorithm_complete.md` for full implementation details.

### Simulation Loop (10 Ma timestep, up to 2,000 Ma)

```
Phase 0: Initialize supercontinent (all cont cells = plate 1, ocean = plate 0, age=200 Ma)
Phase 1: Supercontinent tenure — mantle heat accumulation under continent
Phase 2: Breakup — plume-triggered triple-junction rifts, new oceanic crust
Phase 3: Ocean basin evolution — mid-ocean ridges, ocean crust aging, subduction
Phase 4: Continental collision + orogeny
Phase 5: Supercontinent assembly (merge plates, new subduction zones)
Phase 6: Repeat from Phase 1
```

### Key Algorithms

```
Plate velocity:      v = ω × r  (Euler pole cross product)
Ocean depth:         depth = 2500 + 350 × √age  (Parsons & Sclater 1977)
Boundary type:       sep = dot(v_neighbor - v_cell, direction_to_neighbor)
                     sep > 0.5 cm/yr → DIVERGENT
                     sep < -0.5 cm/yr → CONVERGENT (subduction or collision)
Orogeny height:      h = convergence_total × coefficient (1.2–2.5 km/100km)
Erosion:             ∂z/∂t = K × A^m × S^n  (stream power, K=0.001)
Rifting threshold:   heat > 0.8 (normalized) → triple-junction rift
```

### Continental Speed Factors
- >80% continental: 0.3× oceanic speed
- 40–80% mixed: 0.5× oceanic speed
- <40% continental: 0.9× oceanic speed

---

## FastAPI Server — Endpoint Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/simulate` | POST | Start sim in background → 202 immediately |
| `/api/status` | GET | Progress: running, current_time, max_time, has_result, error |
| `/api/result` | GET | Full sim result + geoforge_path (ready when has_result=true) |
| `/api/tile` | GET | `?lat_min&lat_max&lon_min&lon_max[&file=]` → 24 channels for cells in bounds |
| `/api/grid` | GET | Level-6 grid JSON (gzipped, cached) |

**Flow:** POST `/simulate` → poll `/status` until `has_result=true` → GET `/result`

**Default params for testing:** `grid_level=3` (642 cells), `time_ma=50` — finishes in <1s.
**Production:** `grid_level=6` (40,962 cells), `time_ma=500`.

**Paint export:** `GeodesicGlobe.exportPaintTexture()` returns a base64 PNG (no `data:` prefix) encoding the painted supercontinent as an equirectangular image. This is sent as `texture_b64` in the simulate request body so the Python sim can seed plate boundaries from it.

**Keyboard shortcuts (Three.js UI):**
- `O` ocean · `C` continent · `K` craton · `R` rift (paint tools)
- `Space` orbit mode · `[`/`]` decrease/increase brush radius
- `G` toggle wireframe · `1`–`6` switch color modes

---

## Climate Model

```
Temperature = T_solar + T_lapse + T_greenhouse
  T_solar    = 30 × cos(lat) × (1/d²) × luminosity
  T_lapse    = -4.46 × max(0, elevation_km)   [Worldbuilding Pasta: 4.46°C/km]
  T_greenhouse = 15 × ln(CO₂/280) / ln(2)    [Myhre 1998]

Precipitation = P_base × P_orographic × P_coastal
  P_base: Hadley/Ferrel/Polar bands by latitude
  P_orographic: peak 1.4× at 1–1.5 km, rain shadow < 0.6× above 4 km
  P_coastal: 1.4× within 15 BFS hops of ocean, 0.7× interior

Köppen: mountain migration 1 km ≈ 8° effective latitude shift
```

---

## ML Biosphere Profiler

- **Architecture:** PyTorch 33 → 128 → 64 → 17 (softmax biome logits)
- **Training:** WorldClim + GEBCO + MODIS
- **Export:** ONNX → UE5 NNE inference
- **Vegetation scoring:** Liebig's Law (product of tolerance curves), top-50 species → functional types (grass/shrub/tree weights)

---

## UE5 Integration (Yahya — C++)

- `UGeoForgeFile` C++ class: read binary header + channel index, LZ4 decompress on demand, spatial hash query
- Slate UI tile picker: globe preview + 5-10 km² region selection
- Conditioning maps: 6 PNGs from tile data → feed Gaea + PCG

## Substrate Material (Badr — HLSL, UE5 5.7)

6 layers: bedrock (slope + tectonic_flags), sand (soil_order + precip), clay (temp + precip), humus (canopy_density + biome), moss (koppen + temp), snow (elevation vs snowline). Weight masks auto-normalized to sum ≈ 1.

## PCG Vegetation Pipeline (Badr — 14 passes)

Passes 1–3: boulders | 4–6: moss/litter | 7–8: grass | 9–10: shrubs | 11–12: canopy trees (Nanite Skeletal, GPU wind) | 13–14: dead wood. All density driven by ML biosphere output.

---

## Scientific References

- Bird (2003) — Plate boundary model
- Parsons & Sclater (1977) — Ocean floor bathymetry: `depth = 2500 + 350√age`
- Myhre et al. (1998) — Greenhouse forcing
- Kottek et al. (2006) — Köppen-Geiger classification
- Holdridge (1967) — Life Zone Ecology
- Kattge et al. (2020) — TRY plant trait database
- Worldbuilding Pasta (2020–2025) — Climate + tectonic modeling series

---

## Hackathon Checkpoints

**Wednesday end:** Globe paints → simulation runs → .geoforge written → Python reader extracts tile
**Thursday end:** UE5 reads .geoforge + tile picker works + 6 conditioning maps generated + ML model ONNX ready
**Friday end:** Gaea heightmap → UE5 landscape + Substrate material + PCG vegetation → playable level in 2–3 min
**Saturday:** Stress test 3 tiles, website, Overleaf paper, slides
