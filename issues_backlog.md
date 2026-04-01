# GeoForge — Issues Backlog

Bite-sized tasks extracted from the hackathon plan. Each item maps to a potential GitHub Issue.

---

## Pre-Hackathon: Badr (6-8 hours)

- [ ] **[Badr]** Create fresh UE5 5.7 project with folder structure
- [ ] **[Badr]** Install PCGEx plugin and verify it loads
- [ ] **[Badr]** Download Quixel Megaplants asset pack
- [ ] **[Badr]** Build 6-layer Substrate landscape material (bedrock, sand, clay, humus, moss, snow) — **CRITICAL**
- [ ] **[Badr]** Create and test Gaea `.tor` template file
- [ ] **[Badr]** Set up UE5 plugin skeleton (2 modules: GeoForgeRuntime, GeoForgePCG)

## Pre-Hackathon: Yahya (12-14 hours)

- [ ] **[Yahya]** Implement geodesic icosphere subdivision (level 6, ~65k cells) — **CRITICAL**
- [ ] **[Yahya]** Implement cell neighbour lookup
- [ ] **[Yahya]** Implement spatial hash (lat/lon <-> cell index)
- [ ] **[Yahya]** Write unit tests for geodesic grid (cell count, neighbour consistency, spatial hash round-trip)
- [ ] **[Yahya]** Download WorldClim dataset (~4 GB)
- [ ] **[Yahya]** Download GEBCO dataset (~11 GB)
- [ ] **[Yahya]** Write `.geoforge` format specification document
- [ ] **[Yahya]** Set up FastAPI project skeleton
- [ ] **[Yahya]** Set up Three.js globe skeleton (render spinning sphere)

---

## Wednesday: Tectonic Simulation + .geoforge File Format

### Badr — Simulation & Climate

- [ ] **[Badr]** Integrate geodesic grid into tectonic simulation
- [ ] **[Badr]** Implement plate motion model (velocity field on grid)
- [ ] **[Badr]** Implement boundary classification (convergent, divergent, transform)
- [ ] **[Badr]** Implement elevation update rules from plate interactions
- [ ] **[Badr]** Run up to 2,000 Ma simulation without crashing (user-controlled stop, multiple supercontinent cycles)
- [ ] **[Badr]** Add snapshot system (record state every 50 Ma)
- [ ] **[Badr]** Implement `.geoforge` file writer (header + channel index + 24 channels + LZ4)
- [ ] **[Badr]** Test: simulate -> export -> verify file readable
- [ ] **[Badr]** Implement atmospheric cell model (Hadley/Ferrel/Polar)
- [ ] **[Badr]** Implement temperature field (solar + lapse rate + ocean current + greenhouse)
- [ ] **[Badr]** Implement precipitation field (atmospheric + orographic + ocean distance)
- [ ] **[Badr]** Implement Koppen-Geiger classification
- [ ] **[Badr]** Write all climate channels to `.geoforge`

### Yahya — Reader & Web UI

- [ ] **[Yahya]** /Implement `GeoForgeFile` Python class (header + channel index + LZ4 decompression)
- [ ] **[Yahya]** Implement spatial hash query (tile lat/lon -> cell indices)
- [ ] **[Yahya]** Test reading Badr's `.geoforge` file
- [ ] **[Yahya]** Implement FastAPI `/tile` endpoint (tile bounds -> 24 channel data)
- [ ] **[Yahya]** Implement tile bounds -> cell indices conversion
- [ ] **[Yahya]** Integration test: generate file -> read -> extract tile
- [ ] **[Yahya]** Build Three.js globe with supercontinent painting
- [ ] **[Yahya]** Implement paint export to PNG
- [ ] **[Yahya]** Implement POST `/simulate` endpoint (planet params + texture -> .geoforge path)

### Wednesday Checkpoint

- [ ] **[Both]** Verify: globe paints -> simulation runs -> .geoforge generated -> file read back

---

## Thursday: UE5 Integration + ML Biosphere

### Badr — ML Model

- [ ] **[Badr]** Load training data (WorldClim + GEBCO + MODIS)
- [ ] **[Badr]** Extract 33-feature vectors and labels from training data
- [ ] **[Badr]** Train PyTorch model (33 -> 128 -> 64 -> 17 biome classes)
- [ ] **[Badr]** Export trained model to ONNX format
- [ ] **[Badr]** Load ONNX model via NNE in UE5
- [ ] **[Badr]** Create `UBiosphereProfiler` C++ class for inference
- [ ] **[Badr]** Test inference: 33 features -> 17 biome logits
- [ ] **[Badr]** Implement Liebig's Law vegetation scoring (product of tolerance curves)
- [ ] **[Badr]** Compute top-50 species per cell
- [ ] **[Badr]** Aggregate species to functional types (grass, shrub, tree weights)
- [ ] **[Badr]** Create `FBiosphereProfile` struct

### Yahya — UE5 Plugin

- [ ] **[Yahya]** Implement `UGeoForgeFile` C++ class (binary reader + LZ4 decompression)
- [ ] **[Yahya]** Port spatial hash query to C++
- [ ] **[Yahya]** Test reading `.geoforge` file in UE5 editor
- [ ] **[Yahya]** Build Slate UI tile picker panel (globe + selection grid)
- [ ] **[Yahya]** Implement tile bounds display and selection
- [ ] **[Yahya]** Implement `ReadTile()` data fetch function
- [ ] **[Yahya]** Generate conditioning map: elevation (512x512, float16 PNG)
- [ ] **[Yahya]** Generate conditioning map: aridity index (0-1 PNG)
- [ ] **[Yahya]** Generate conditioning map: slope orientation (RG gradient PNG)
- [ ] **[Yahya]** Generate conditioning map: tectonic feature mask PNG
- [ ] **[Yahya]** Generate conditioning map: biome class map (from ML) PNG
- [ ] **[Yahya]** Generate conditioning map: vegetation weight map (grass/tree/shrub) PNG

### Thursday Checkpoint

- [ ] **[Both]** Verify: select tile -> all 6 conditioning maps generated -> ready for Gaea + PCG

---

## Friday: Terrain + Material + PCG Vegetation

### Badr — Gaea, Landscape, PCG

- [ ] **[Badr]** Export conditioning maps to disk for Gaea
- [ ] **[Badr]** Invoke Gaea CLI with `.tor` template and conditioning maps
- [ ] **[Badr]** Poll Gaea output directory and read resulting heightmap PNG
- [ ] **[Badr]** Convert heightmap to UE5 landscape format
- [ ] **[Badr]** Create `ALandscape` actor from heightmap
- [ ] **[Badr]** Generate bedrock weight texture (tectonic_flags + slope)
- [ ] **[Badr]** Generate sand weight texture (soil_order + precip)
- [ ] **[Badr]** Generate clay weight texture (soil_order)
- [ ] **[Badr]** Generate humus weight texture (canopy_density + ML biome)
- [ ] **[Badr]** Generate moss weight texture (koppen_zone)
- [ ] **[Badr]** Generate snow weight texture (elevation vs. snowline)
- [ ] **[Badr]** Apply Substrate material and bake weight textures
- [ ] **[Badr]** Build PCG graph passes 1-3: boulder scatter (rock_fraction)
- [ ] **[Badr]** Build PCG graph passes 4-6: moss/litter scatter (canopy_density)
- [ ] **[Badr]** Build PCG graph passes 7-8: dense grass scatter (grass_weight)
- [ ] **[Badr]** Build PCG graph passes 9-10: shrub scatter (shrub_weight)
- [ ] **[Badr]** Build PCG graph passes 11-12: canopy trees (tree_weight + Nanite Skeletal)
- [ ] **[Badr]** Build PCG graph passes 13-14: dead wood scatter (logs + snags)
- [ ] **[Badr]** Link PCG density curves to ML biosphere output
- [ ] **[Badr]** Test one tile end-to-end, verify no crashes

### Yahya — Material Binding & Demo

- [ ] **[Yahya]** Create `ALandscape` actor and set heightmap data from Gaea output
- [ ] **[Yahya]** Apply Substrate material to landscape
- [ ] **[Yahya]** Test 3 different heightmaps with material blending
- [ ] **[Yahya]** Wire PCG node to read biosphere profiler output from `.geoforge`
- [ ] **[Yahya]** Bind grass_weight, tree_weight, biome_class as PCG named attributes
- [ ] **[Yahya]** Wire attributes to PCG scatter density curves
- [ ] **[Yahya]** Test full pipeline 2-3 times (tile -> terrain -> material -> PCG)
- [ ] **[Yahya]** Fix any crashes found during testing
- [ ] **[Yahya]** Pre-simulate demo planet
- [ ] **[Yahya]** Generate 2-3 tiles from demo planet
- [ ] **[Yahya]** Record backup demo video

### Friday Checkpoint

- [ ] **[Both]** Verify: end-to-end pipeline produces playable level in 2-3 minutes

---

## Saturday: Final Polish (4 hours)

### Badr

- [ ] **[Badr]** Stress test 3 different tiles, verify no crashes
- [ ] **[Badr]** Practice demo walkthrough / pitch
- [ ] **[Badr]** Record backup demo video

### Yahya

- [ ] **[Yahya]** Build project website (Next.js) with screenshots
- [ ] **[Yahya]** Write Overleaf paper: methods + results sections with scientific citations
- [ ] **[Yahya]** Final pipeline test
- [ ] **[Yahya]** Prepare presentation slides

### Saturday Checkpoint

- [ ] **[Both]** Full demo tested 3+ times without crashes
- [ ] **[Both]** Website live with screenshots + paper link
- [ ] **[Both]** Ready to present
