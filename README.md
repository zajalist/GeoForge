# GeoForge

**Science-driven procedural planet generation.**

GeoForge simulates planetary tectonics from first principles — every mountain forms because plates collided, climate emerges from atmospheric circulation and ocean currents, and vegetation is predicted by machine learning trained on real Earth data. Select any 5-10 km tile from your simulated planet and generate a fully textured, vegetation-covered UE5 landscape in minutes.

## Key Features

- **Tectonic Simulation** — Up to 2,000 million years of plate motion on a 65,000-cell geodesic grid, with multiple supercontinent cycles and user-controlled stop point
- **Physics-Based Climate** — Temperature, precipitation, and Koppen zones derived from atmospheric models
- **ML Biosphere Profiler** — PyTorch-trained classifier (33 features -> 17 biome classes) with vegetation scoring via Liebig's Law
- **`.geoforge` File Format** — Custom binary format storing 24 data channels with LZ4 compression (25-35 MB per planet)
- **Web Globe UI** — Three.js interface for painting supercontinents and previewing simulation results
- **UE5 5.7 Integration** — Tile picker, Gaea heightmap generation, 6-layer Substrate material, PCG vegetation scatter with Nanite rendering

## Pipeline

```
Paint supercontinent (Three.js)
        |
        v
Simulate tectonics + climate + biosphere (Python/C++)
        |
        v
Write .geoforge file (24 channels, LZ4)
        |
        v
Select tile in UE5 (Slate UI)
        |
        v
Generate heightmap (Gaea CLI)
        |
        v
Build landscape + material + vegetation (UE5 Substrate + PCG)
        |
        v
Explorable terrain — everything has a cause
```

## Tech Stack

| Layer | Technology |
|---|---|
| Simulation | C++, Python, PyTorch |
| File Format | `.geoforge` (custom binary, LZ4) |
| ML Inference | ONNX via UE5 NNE |
| Web | FastAPI, Three.js |
| Engine | Unreal Engine 5.7 |
| Terrain | Gaea (heightmaps), Substrate (6-layer material) |
| Vegetation | PCG + PCGEx (GPU scatter), Nanite Skeletal |
| Docs | Next.js (website), LaTeX (paper) |

## Project Structure

```
geoforge/
  plan/                  # Hackathon planning documents
  src/
    simulation/          # Tectonic + climate engine (C++)
    ml/                  # Biosphere profiler (PyTorch)
    server/              # FastAPI backend
    web/                 # Three.js globe UI
  unreal/
    GeoForge/            # UE5 5.7 project
      Plugins/
        GeoForgeRuntime/ # .geoforge reader + tile picker
        GeoForgePCG/     # PCG pipeline + attribute binding
  data/                  # WorldClim, GEBCO, MODIS datasets
  docs/                  # Overleaf paper source
```

## Team

- **Badr** — Tectonic simulation, climate, ML biosphere, Gaea integration, Substrate material, PCG pipeline
- **Yahya** — Geodesic grid, .geoforge format, FastAPI, Three.js globe, UE5 plugin, tile picker, website

## References

- Bird (2003) — Plate boundary model
- Parsons & Sclater (1977) — Ocean floor bathymetry
- Myhre et al. (1998) — Greenhouse gas radiative forcing
- Kottek et al. (2006) — Koppen-Geiger classification
- Holdridge (1967) — Life Zone Ecology
- Kattge et al. (2020) — TRY plant trait database
- Worldbuilding Pasta (2020-2025) — Climate modeling series

## License

TBD
