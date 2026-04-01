# GeoForge Substrate Material — Pre-Work Blueprint
## UE5-Heavy, 12-15 Layer Approach

---

## MATERIAL ARCHITECTURE (High-Level)

```
INPUT DATA (runtime from .geoforge + landscape):
  ├─ Heightmap (from Gaea via landscape)
  ├─ World Position (from landscape vertex shader)
  ├─ Surface Normals (computed from heightmap derivatives)
  ├─ .geoforge channels:
  │   ├─ elevation
  │   ├─ temperature
  │   ├─ precipitation
  │   ├─ canopy_density
  │   ├─ koppen_zone (biome class)
  │   └─ soil_order
  └─ Computed masks (in material):
      ├─ Slope (0–90°) — PRIMARY DRIVER
      ├─ Slope sub-bins (cliff-specific thresholds: <10°, 10–25°, 25–40°, 40–50°, >50°)
      ├─ Curvature (concave/convex) — refines cliff wetness
      ├─ Moisture index (precip + ocean_distance) — wet cliffs vs. dry
      └─ Elevation bins (snowline) — snow on peaks

MATERIAL GRAPH (Cliff-Heavy Organization):
  
  SLOPE GATE (PRIMARY ROUTING):
  ├─ slope > 50° ─────→ CLIFF COMPLEX (4 materials)
  │   ├─ [Moisture Mask] → decides wet vs. dry cliff
  │   ├─ [Curvature Mask] → convex ridges = clean rock, concave = lichen/wet
  │   └─ Blend:
  │       ├─ Exposed bedrock (clean, high slope)
  │       ├─ Weathered bedrock (less steep exposed)
  │       ├─ Lichen cliff face (cold + wet + lichen coverage)
  │       └─ Wet cliff/seepage (convergent + high precip)
  │
  ├─ 40° < slope < 50° → SCREE/STEEP (2 materials)
  │   ├─ Rock scree (tumbled, talus piles)
  │   └─ Gravel steep
  │
  ├─ 25° < slope < 40° → GRAVEL SLOPES (2 materials)
  │   ├─ Coarse gravel
  │   └─ Fine gravel
  │
  ├─ 10° < slope < 25° → HILLSIDES (2 materials)
  │   ├─ Gravel+sand mix
  │   └─ Shrub transition zones
  │
  └─ slope < 10° ─────→ FLATS (6 materials + vegetation)
      ├─ Clay (wet flats)
      ├─ Humus/soil (forest floor)
      ├─ Short grass
      ├─ Tall grass
      ├─ Moss (ground)
      └─ Mud/swamp (convergent flats)

ELEVATION OVERLAY:
  ├─ elevation > snowline → blend in snow (all slopes)
  └─ elevation >> snowline + cold → add ice (mostly on cliffs)

OUTPUT:
  → BSDF (Substrate) with blended albedo, normal, roughness
  → Applies to landscape material

KEY INSIGHT:
  Cliffs (slope > 50°) are the PRIMARY showcase.
  They get:
    • 4 dedicated material layers (clean rock, weathered, lichen, wet)
    • Detailed sub-blending based on moisture + curvature
    • High-quality normal maps for visual drama
  
  Everything else feeds into supporting them (talus at base, forest below, etc.)

OUTPUT:
  → BSDF (Substrate) with blended albedo, normal, roughness, metallic
  → Applies to landscape material
```

---

## PRE-WORK CHECKLIST (Before Wednesday, 6–8 hours)

### 1. **Texture Asset Gathering** (1–2 hours)
You need 2–3 texture variants per layer (albedo, normal, roughness minimum).

**Source:** Megaplants (already have) + **Poly Haven** (free, CC0)

**Per-layer stack (18 total layers, cliff-heavy):**

| Layer | Albedo | Normal | Roughness | Source | Slope Range |
|-------|--------|--------|-----------|--------|-------------|
| **CLIFFS (slope > 50°)** | | | | | |
| Exposed bedrock (clean) | Gray/pale | Sharp jagged | 0.7–0.9 | Poly Haven rocky_* | 50–90° |
| Weathered bedrock | Gray-brown | Weathered streaks | 0.8–0.95 | Poly Haven rock_weathered | 50–90° |
| Lichen cliff face | Gray-green + orange | Bumpy lichen | 0.75–0.85 | Poly Haven moss_rock | 50–90° |
| Wet cliff/seepage | Dark gray-green | Mossy streaks | 0.4–0.5 | Poly Haven wet_rock | 50–90° |
| **SLOPES (25–50°)** | | | | | |
| Rock scree (loose) | Light gray | Tumbled | 0.8–0.9 | Poly Haven scree, talus | 30–50° |
| Gravel steep | Tan/gray | Coarse | 0.65–0.75 | Poly Haven gravel_rocky | 25–40° |
| **HILLSIDES (10–25°)** | | | | | |
| Gravel gentle | Tan/gray | Subtle | 0.6–0.7 | Poly Haven gravel_rocky_02 | 10–25° |
| Sand/silt | Yellow/tan | Smooth | 0.5–0.6 | Poly Haven light_sand | 5–20° |
| **FLATS (slope < 10°)** | | | | | |
| Clay | Reddish-brown | Smooth | 0.4–0.5 | Poly Haven clay_soil_01 | 0–10° |
| Humus/soil | Dark brown | Subtle | 0.5–0.6 | Poly Haven rough_ground | 0–10° |
| **VEGETATION** | | | | | |
| Short grass | Green | Wispy normal | 0.6 | Megaplants grass_short | 0–15° |
| Tall grass | Dark green | Flowing | 0.7 | Megaplants grass_tall | 0–15° |
| Moss (ground) | Green/olive | Bumpy | 0.7–0.8 | Poly Haven mossy_ground | 0–20° |
| Shrub/dwarf | Dark green/brown | Organic | 0.6 | Megaplants shrub | 5–25° |
| **EXTREME** | | | | | |
| Snow | White | Smooth | 0.4–0.5 | Poly Haven snow | >snowline |
| Ice/frozen | Light blue-white | Glossy | 0.1–0.2 | Custom or Poly Haven | >snowline + cold |
| Mud/swamp | Dark brown/green | Smooth wet | 0.3 | Poly Haven mud | Wet valleys |

**Download from Poly Haven:**

**CLIFFS (Priority 1 — most important):**
- https://polyhaven.com/a/rough_rocky_cliff_02 → Exposed bedrock
- https://polyhaven.com/a/rocky_cliff_01 → Weathered bedrock
- https://polyhaven.com/a/mossy_rock → Lichen cliff face
- https://polyhaven.com/a/wet_mud_mossy → Wet cliff/seepage

**SLOPES & SCREE (Priority 2):**
- https://polyhaven.com/a/rocky_riverbed_02 → Rock scree
- https://polyhaven.com/a/gravel_rocky_02 → Gravel steep
- https://polyhaven.com/a/gravel_rocky_03 → Gravel gentle

**FLATS & SOIL (Priority 3):**
- https://polyhaven.com/a/clay_soil_01 → Clay
- https://polyhaven.com/a/rough_ground_02 → Humus
- https://polyhaven.com/a/light_sand → Sand
- https://polyhaven.com/a/mossy_ground → Moss (ground)

**EXTREME (Priority 4):**
- https://polyhaven.com/a/mud_01 → Mud/swamp
- (Snow + ice can be procedural or simple procedural noise)

**Total: 11–15 base textures, each with albedo + normal + roughness maps**
**= ~33–45 image files to import**

**Search tips if links change:**
- "rock cliff" → exposed bedrock textures
- "weathered rock" → aged cliff faces
- "moss rock" OR "lichen rock" → covered cliffs
- "talus" OR "scree" → loose rocky slopes
- "gravel" → general slope material
- "mud mossy" → wet cliff seepage

### 2. **Create Material Functions** (2–3 hours)

You'll reuse these throughout the material. Create these as `.uasset` Material Functions:

#### **MF_SlopeMask** (returns 5 bins, not just 0–1)
```
Outputs:
  - slope_flat (0–10°)
  - slope_gentle (10–25°)
  - slope_moderate (25–40°)
  - slope_steep (40–50°)
  - slope_cliff (>50°) ← PRIMARY TARGET

This refines the material routing to handle cliffs as their own zone.
```

#### **MF_SlopeMask**
```
Inputs:
  - WorldNormal (from landscape vertex normal)
  - SlopeThresholdLow, SlopeThresholdHigh (e.g., 20°, 45°)

Output:
  - Slope mask (0–1, where 1 = very steep)

Math:
  1. Compute slope angle from normal:
     slope_angle = acos(dot(WorldNormal, (0,0,1)))
  2. Clamp to threshold range
  3. Output mask (smooth step between thresholds)
```

#### **MF_CurvatureMask**
```
Inputs:
  - WorldPosition
  - Sample radius (e.g., 0.5 meters in world space)

Output:
  - Curvature (-1 = concave valley, 0 = flat, +1 = convex ridge)

Math:
  1. Sample heightmap in cross pattern around pixel
  2. Compute Laplacian (sum of second derivatives)
  3. Normalize to -1…+1 range
```

#### **MF_MoistureIndex**
```
Inputs:
  - Precipitation (from .geoforge, 0–3000 mm/yr)
  - OceanDistance (from .geoforge, 0–3000 km)
  - Latitude

Output:
  - Moisture index (0 = desert, 1 = rainforest)

Math:
  moisture = (precip / 2000) × (1 + ocean_boost) × temperature_factor
```

#### **MF_ElevationBinMask**
```
Inputs:
  - Elevation (from .geoforge)
  - Snowline (computed from temperature gradient)

Output:
  - Binary mask (0 = below snowline, 1 = above)
  - Smooth transition ±500m

Math:
  snowline = 4000m - (latitude_angle × 50m) - (temp_anomaly × 200m)
  mask = smoothstep(snowline - 500, snowline + 500, elevation)
```

### 3. **Build Main Substrate Material** (3–4 hours)

**File:** `M_GeoForge_Terrain_Substrate`

**Material Type:** Substrate (enable in details)

**Main Graph Structure:**

```
INPUT NODES:
├─ Texture Sample × 18 (one per layer albedo)
├─ Texture Sample × 18 (one per layer normal)
├─ Texture Sample × 18 (one per layer roughness)
├─ Parameter: PrecipitationMap (texture, from .geoforge)
├─ Parameter: TemperatureMap (texture, from .geoforge)
├─ Parameter: CanopyDensityMap (texture, from .geoforge)
├─ Parameter: BiomeClassMap (texture, from .geoforge)
├─ Parameter: ElevationMap (texture, from heightmap)
└─ Material Functions:
    ├─ MF_SlopeMask → slope_flat, slope_gentle, slope_moderate, slope_steep, slope_cliff
    ├─ MF_CurvatureMask → convex_mask, concave_mask
    ├─ MF_MoistureIndex → moisture (0–1)
    └─ MF_ElevationBinMask → snow_mask, ice_mask

BLENDING LOGIC (Cliff-Centric):

├─ **CLIFF DETECTION & ROUTING** (slope > 50°):
│   ├─ Convex mask (ridge) + high slope → Exposed bedrock (clean rock faces)
│   ├─ Concave mask (valley/gully) + wet → Lichen cliff + Wet seepage
│   ├─ High moisture + cliff → Wet cliff with algae/moss streaks
│   └─ Cold + cliff + wet → Ice formations on cliff faces
│
├─ **STEEP SCREE/TALUS** (40–50° slope):
│   ├─ Route to tumbled rock scree (base of cliffs)
│   └─ Gravel steep (transitional slopes)
│
├─ **HILLSIDE BLENDING** (10–40° slope):
│   ├─ 25–40°: Coarse gravel → sparse shrub
│   ├─ 15–25°: Fine gravel → shrub transition
│   └─ 10–15°: Gravel+sand mix
│
├─ **FLAT TERRAIN** (slope < 10°):
│   ├─ Moisture < 0.3 → Sand (arid)
│   ├─ 0.3 < moisture < 0.6 → Clay (temperate)
│   └─ moisture > 0.6 → Humus/soil (forest floor) OR Mud (convergent + wet)
│
├─ **VEGETATION LAYER** (slopes 0–25°, moisture-dependent):
│   ├─ Grass (short + tall, different density)
│   ├─ Moss (on cool, wet ground)
│   └─ Shrub (edges, transitions, dry grassland)
│
└─ **SNOW/ICE OVERLAY** (all slopes, elevation-gated):
    ├─ elevation > snowline → blend snow (all materials below)
    └─ elevation >> snowline + frozen → add ice (especially on cliffs)

LAYER BLEND (Substrate Weight Blend):
  [albedo_blended, normal_blended, roughness_blended] → BSDF
```

**Key nodes to use:**
- `World Aligned Blend` (for detail variation across slopes)
- `Texture Coordinate` (UVs at different scales: 4m, 20m, 100m)
- `Distance Field Shadows` (optional: self-shadow for moss/rocks)
- `Substrate Weight Blend` (final layer composition)
- `BSDF` (output node)

### 4. **Test & Iterate** (1–2 hours)

**Test setup:**
1. Create small landscape (257×257 quads, ~2 km²)
2. Import dummy heightmap (flat or simple slope)
3. Assign material
4. Create dummy textures for each layer parameter
5. Verify:
   - No shader compilation errors
   - Material renders (no black/pink)
   - Slope blending works visually
   - Can toggle layers on/off with parameters

**What you're looking for:**
- Steep areas show rock-like materials
- Flat areas show soil/grass
- Smooth transitions between layers
- Normal maps apply correctly
- No flickering or aliasing

---

## MATERIAL PARAMETERS (Exposed for Friday Tweak)

Create these as **Material Parameters** so Yahya can tweak Friday:

```cpp
// CLIFF-SPECIFIC PARAMETERS (new)
float SlopeThreshold_CliffDetection = 50.0;  // degrees
float CliffWetnessInfluence = 0.7;           // how much moisture affects cliffs
float CliffCurvatureInfluence = 0.6;         // convex=clean, concave=wet
float ExposedBedrockStrength = 1.2;          // emphasis on clean rock faces
float WeatheredBedrockStrength = 0.8;        // secondary cliff material
float LichenCoverageThreshold = 0.65;        // moisture threshold for lichen

// Slope thresholds (degrees)
float SlopeThreshold_Scree = 40.0;
float SlopeThreshold_GravelSteep = 25.0;
float SlopeThreshold_GravelGentle = 10.0;

// Moisture scaling
float MoistureIntensity = 1.0;

// Layer strength multipliers
float SandStrength = 1.0;
float GrassStrength = 0.8;
float ShrubStrength = 0.9;
float SnowStrength = 1.0;

// Texture tiling scales
float DetailTiling = 4.0;
float MacroTiling = 0.25;

// Curvature sensitivity
float CurvatureInfluence = 0.5;
```

---

## FILE STRUCTURE (18-Layer Organization)

```
Content/
├─ Materials/
│   ├─ M_GeoForge_Terrain_Substrate (main material)
│   ├─ MF_SlopeMask (now returns 5 bins: flat/gentle/moderate/steep/cliff)
│   ├─ MF_CurvatureMask
│   ├─ MF_MoistureIndex
│   ├─ MF_ElevationBinMask
│   └─ Textures/
│       ├─ Cliffs/
│       │   ├─ Bedrock_Exposed/
│       │   ├─ Bedrock_Weathered/
│       │   ├─ Lichen_Cliff/
│       │   └─ Cliff_Seepage/
│       ├─ Scree/
│       │   ├─ Rock_Scree/
│       │   └─ Gravel_Steep/
│       ├─ Slopes/
│       │   ├─ Gravel_Gentle/
│       │   └─ Sand_Silt/
│       ├─ Flats/
│       │   ├─ Clay/
│       │   ├─ Humus/
│       │   └─ Mud/
│       ├─ Vegetation/
│       │   ├─ Grass_Short/
│       │   ├─ Grass_Tall/
│       │   ├─ Moss_Ground/
│       │   └─ Shrub/
│       ├─ Extreme/
│       │   ├─ Snow/
│       │   └─ Ice/
```

---

## FRIDAY INTEGRATION POINTS

**Yahya will provide at runtime:**
1. **PrecipitationMap** (512×512 texture, values 0–3000 mm/yr encoded as 0–1)
2. **TemperatureMap** (512×512, values -50°C to +50°C encoded as 0–1)
3. **CanopyDensityMap** (512×512, values 0–255)
4. **BiomeClassMap** (512×512, 17 biome classes as u8)
5. **ElevationMap** (heightmap itself, already in landscape)

**You'll:**
1. Pass these to material instance parameters
2. Material automatically computes slope/curvature from heightmap derivatives
3. Material blends 18 layers based on all inputs
4. PCG reads final biome output to scatter vegetation

---

## TEXTURE RESOLUTION TARGETS

- **Per-layer textures:** 512×512 or 1024×1024 (reused at different scales)
- **Conditioning maps:** 512×512 (matches tile resolution)
- **Heightmap:** 1009×1009 (from Gaea, standard landscape import)

**Total VRAM (worst case):** ~800 MB (fine for single tile display)

---

## GOTCHAS & TIPS

1. **Normal map encoding:** Check if your Poly Haven textures are sRGB or linear; set texture import settings correctly
2. **Tiling seams:** Use `Distance Field Blend` at macro scale to hide repeating patterns
3. **Slope angles:** Beware that `dot(normal, up)` gives cosine; you need `acos()` for actual degrees
4. **Substrate complexity:** If shader becomes too heavy, split into 2–3 material functions and call them
5. **Curvature cost:** This samples heightmap multiple times; only enable if performance allows, otherwise simplify to slope-only

---

## SUCCESS CRITERIA (End of Pre-Work)

- [ ] 18 textures imported (organized by region: cliffs, slopes, flats, vegetation, extreme)
- [ ] 4 material functions created + tested individually
- [ ] MF_SlopeMask now outputs 5 bins (flat, gentle, moderate, steep, **cliff**)
- [ ] Main material compiles without errors
- [ ] Material applied to test landscape
- [ ] **Cliffs visible and distinct** (steep areas show exposed bedrock + lichen + weathering variation)
- [ ] Slope blending looks natural (rock on steep, soil on flat, talus at cliff base)
- [ ] Can toggle material parameters in editor
- [ ] Screenshot showing cliff detail ready to demo

---

## TIME ESTIMATE

- Texture gathering: **1.5–2 hours** (more cliff textures to download)
- Material functions: **2–3 hours** (build + test each one)
- Main material graph: **2–3 hours** (wiring + refinement)
- Testing & iteration: **1 hour**

**Total:** **6.5–9 hours** (slightly more than 6–8 due to cliff complexity)

**Can compress to 7–8 hours by:**
- Using simpler cliff materials (fewer variations)
- Skipping curvature mask (use simple cliff detection)
- Pre-downloading key Poly Haven textures before session start

You don't need pixel-perfect textures; this is about **proving the blending architecture works**, especially cliff appearance.
