# GeoForge Tectonic Simulation - Detailed Technical Plan

**Version:** 1.0  
**Date:** 2026-04-01  
**Status:** Approved for Implementation  
**Owner:** Badr

---

## Overview

A kinematic plate tectonic simulation running on a geodesic grid (level-6 icosphere, ~65k cells), modeling up to 2,000 Ma with multiple supercontinent cycles. Based on GPlates-style kinematic modeling combined with Worldbuilding Pasta's tectonic cycle concepts.

---

## 1. Data Structures

### 1.1 Cell Data (per grid cell)

| Field | Type | Description |
|-------|------|-------------|
| `plate_id` | u8 | 0=background, 1+ = plate ID |
| `crust_type` | u8 | 0=oceanic, 1=continental |
| `elevation` | f32 | meters above sea level |
| `ocean_age` | u16 | Ma since crust formed (0 at ridge) |
| `velocity_x` | f32 | cm/year (x component) |
| `velocity_y` | f32 | cm/year (y component) |
| `velocity_z` | f32 | cm/year (z component) |
| `is_ridge` | bool | newly created ridge this timestep |
| `orogeny_age` | u16 | Ma since last orogeny (0 = active) |

### 1.2 Plate Data

| Field | Type | Description |
|-------|------|-------------|
| `plate_id` | u8 | Unique identifier |
| `euler_lat` | f32 | Euler pole latitude (degrees) |
| `euler_lon` | f32 | Euler pole longitude (degrees) |
| `euler_angle` | f32 | Rotation angle (degrees) |
| `continental_cells` | Vec<u32> | Indices of continental cells |
| `oceanic_cells` | Vec<u32> | Indices of oceanic cells |
| `name` | String | Optional plate name |

### 1.3 Boundary Data

| Field | Type | Description |
|-------|------|-------------|
| `type` | enum | DIVERGENT, CONVERGENT, TRANSFORM |
| `plate_a` | u8 | First plate ID |
| `plate_b` | u8 | Second plate ID |
| `cells` | Vec<u32> | Grid cells along boundary |
| `separation_rate` | f32 | cm/year (positive = diverging) |

### 1.4 Subduction Zone Data

| Field | Type | Description |
|-------|------|-------------|
| `trench_cells` | Vec<u32> | Cells forming the trench |
| `subducting_plate` | u8 | Plate going down |
| `overriding_plate` | u8 | Plate above |
| `angle` | f32 | Dip angle (degrees, 10-90) |
| `arc_distance` | f32 | Distance to volcanic arc (km) |

### 1.5 Collision Zone Data

| Field | Type | Description |
|-------|------|-------------|
| `collision_line` | Vec<u32> | Cells along collision boundary |
| `plate_a` | u8 | First continent plate |
| `plate_b` | u8 | Second continent plate |
| `orogeny_type` | enum | HIGH_MOUNTAIN, MEDIUM, LOW, ANDEAN |
| `convergence_rate` | f32 | cm/year |
| `start_time` | u16 | Ma when collision started |

---

## 2. Plate Motion Algorithm

### 2.1 Euler Pole Rotation

Each plate rotates around an Euler pole. The velocity at any point on the plate is the cross product of angular velocity with the position vector.

```cpp
// Convert angular velocity (rad/s) to linear velocity (m/s) at surface
vec3 calculate_velocity(vec3 cell_position, vec3 euler_pole, float angular_velocity) {
    // Angular velocity ω = angle / timestep
    // V = ω × r (cross product)
    return cross(euler_pole * angular_velocity, cell_position);
}
```

**Implementation notes:**
- Euler pole lat/lon defines axis through Earth's center
- Angle specifies total rotation over timestep
- Convert to radians for calculation, convert velocity to cm/year

### 2.2 Continental Speed Factor

Continental plates move slower than oceanic plates due to greater inertia and friction.

```cpp
float get_continental_speed_factor(const Plate& plate) {
    float continental_ratio = plate.continental_cells.size() / 
                              (plate.continental_cells.size() + plate.oceanic_cells.size());
    
    if (continental_ratio > 0.8f) return 0.3f;   // Mostly continental: ~30% of oceanic
    if (continental_ratio > 0.4f) return 0.5f;   // Mixed: ~50% of oceanic
    return 0.9f;                                // Mostly oceanic: ~90% of oceanic
}
```

### 2.3 Update Plate Positions

```cpp
void update_plate_positions(std::vector<Plate>& plates, float timestep_ma) {
    for (auto& plate : plates) {
        // Calculate angular velocity (degrees per Ma)
        float angular_velocity = plate.euler_angle / timestep_ma;
        
        // For each cell in the plate, calculate velocity based on position
        // relative to Euler pole
        for (uint32_t cell_id : plate.continental_cells) {
            Cell& cell = grid[cell_id];
            cell.velocity = calculate_cell_velocity(cell.position, 
                                                     plate.euler_pole, 
                                                     angular_velocity);
            cell.velocity *= get_continental_speed_factor(plate);
        }
        
        for (uint32_t cell_id : plate.oceanic_cells) {
            Cell& cell = grid[cell_id];
            cell.velocity = calculate_cell_velocity(cell.position, 
                                                     plate.euler_pole, 
                                                     angular_velocity);
        }
    }
}
```

---

## 3. Boundary Detection Algorithm

### 3.1 Per-Timestep Boundary Detection

For each cell-neighbor pair with different plate IDs, calculate relative velocity and classify.

```cpp
std::vector<Boundary> detect_boundaries(const Grid& grid, 
                                         const std::vector<Plate>& plates) {
    std::vector<Boundary> boundaries;
    
    for (uint32_t cell_id = 0; cell_id < grid.cell_count; ++cell_id) {
        const Cell& cell = grid.cells[cell_id];
        if (cell.plate_id == 0) continue;  // Skip background
        
        for (uint32_t neighbor_id : grid.neighbors[cell_id]) {
            const Cell& neighbor = grid.cells[neighbor_id];
            if (cell.plate_id == neighbor.plate_id) continue;
            
            // Calculate relative velocity
            vec3 relative_vel = neighbor.velocity - cell.velocity;
            vec3 direction = normalize(neighbor.position - cell.position);
            float separation_rate = dot(relative_vel, direction);
            
            // Classify boundary type
            BoundaryType type;
            if (separation_rate > 0.5f) {
                type = BoundaryType::DIVERGENT;
            } else if (separation_rate < -0.5f) {
                type = BoundaryType::CONVERGENT;
            } else {
                type = BoundaryType::TRANSFORM;
            }
            
            boundaries.push_back({
                type,
                cell.plate_id,
                neighbor.plate_id,
                {cell_id, neighbor_id},
                separation_rate
            });
        }
    }
    
    return merge_adjacent_boundaries(boundaries);
}
```

### 3.2 Boundary Classification Rules

| Type | Condition | Geological Result |
|------|-----------|-------------------|
| DIVERGENT | separation > 0.5 cm/yr | Mid-ocean ridge, new oceanic crust |
| CONVERGENT | separation < -0.5 cm/yr | Subduction or continental collision |
| TRANSFORM | -0.5 ≤ separation ≤ 0.5 | Fault zone, no crust creation/destruction |

### 3.3 Subduction vs Collision Detection

```cpp
OrogenyType classify_convergent_boundary(const Boundary& boundary,
                                         const std::vector<Plate>& plates) {
    const Plate& plate_a = get_plate(boundary.plate_a);
    const Plate& plate_b = get_plate(boundary.plate_b);
    
    bool a_continental = has_continental_crust(plate_a);
    bool b_continental = has_continental_crust(plate_b);
    
    if (a_continental && b_continental) {
        // Continental-continental collision
        float convergence = abs(boundary.separation_rate);
        if (convergence > 3.0f) return OrogenyType::HIGH_MOUNTAIN;
        if (convergence > 1.5f) return OrogenyType::MEDIUM_MOUNTAIN;
        return OrogenyType::LOW_MOUNTAIN;
    } else if (!a_continental || !b_continental) {
        // Ocean-continent or ocean-ocean
        return OrogenyType::ANDEAN_TYPE;
    }
    
    return OrogenyType::NONE;
}
```

---

## 4. Collision & Orogeny Algorithm

### 4.1 Orogeny Types

| Type | Condition | Height (km per 100km convergence) | Width (km) |
|------|-----------|-----------------------------------|------------|
| HIGH_MOUNTAIN | convergence > 3 cm/yr | 2.5 | 200-500 |
| MEDIUM_MOUNTAIN | 1.5 < convergence ≤ 3 | 1.8 | 100-300 |
| LOW_MOUNTAIN | convergence ≤ 1.5 | 1.2 | 50-150 |
| ANDEAN_TYPE | ocean-continent | 1.5 | 100-200 |

### 4.2 Orogeny Height Calculation

```cpp
float calculate_orogeny_height(OrogenyType type, 
                                float convergence_total_km, 
                                uint16_t duration_ma) {
    static const float height_coefficients[] = {
        2.5f,  // HIGH_MOUNTAIN
        1.8f,  // MEDIUM_MOUNTAIN
        1.2f,  // LOW_MOUNTAIN
        1.5f   // ANDEAN_TYPE
    };
    
    float base_height = convergence_total_km * height_coefficients[(int)type];
    
    // Erosion over time (exponential decay)
    float erosion_rate = 0.03f;  // km/Ma
    float eroded = erosion_rate * duration_ma;
    
    return std::max(200.0f, base_height - eroded);  // min 200m
}
```

### 4.3 Orogeny Stamping (Spatial Distribution)

```cpp
void apply_orogeny(Grid& grid, 
                   const CollisionZone& collision,
                   float height,
                   OrogenyType type) {
    float width = get_orogeny_width(type);
    
    for (uint32_t cell_id : collision.collision_line) {
        // Get cells within width of collision line
        auto nearby = grid.get_cells_within_distance(cell_id, width);
        
        for (auto& cell : nearby) {
            float distance_factor = 1.0f - (cell.distance_from_line / width);
            if (distance_factor > 0.0f) {
                // Apply elevation with distance falloff
                // Use erosion resistance based on crust type
                float erosion_resistance = (cell.crust_type == CRUST_CONTINENTAL) 
                                           ? 1.2f : 0.8f;
                cell.elevation += height * distance_factor * erosion_resistance;
            }
        }
    }
    
    // Add specific features based on type
    if (type == OrogenyType::HIGH_MOUNTAIN) {
        add_plateau_regions(grid, collision.collision_line);
    } else if (type == OrogenyType::ANDEAN_TYPE) {
        add_volcanic_arc(grid, collision.collision_line, 120.0f);  // 120km from trench
    }
}
```

### 4.4 What Happens After Continental Collision

**Key insight:** The SUBDUCTION ZONE stops, not the continents.

```cpp
void handle_continental_collision(Grid& grid,
                                  std::vector<Plate>& plates,
                                  const CollisionZone& collision) {
    // 1. Mark subduction zone as complete
    // ( oceanic crust between continents fully consumed )
    
    // 2. Detach subducted slab
    // ( the already-subducted portion sinks into mantle independently )
    
    // 3. Suture continents together
    // Merge plate IDs - both continents now share ONE plate_id
    Plate& plate_a = get_plate(collision.plate_a);
    Plate& plate_b = get_plate(collision.plate_b);
    
    // Move all cells from plate_b to plate_a
    plate_a.continental_cells.insert(
        plate_a.continental_cells.end(),
        plate_b.continental_cells.begin(),
        plate_b.continental_cells.end()
    );
    
    // Remove plate_b from active plates
    plates.erase(std::remove_if(plates.begin(), plates.end(),
        [collision](const Plate& p) { return p.plate_id == collision.plate_b; }),
        plates.end());
    
    // 4. Motion continues from remaining subduction zones
    // The fused supercontinent moves based on external subduction zones
    // (not the internal collision that stopped)
}
```

**After collision:**
- Single merged plate with combined cells
- Motion driven by remaining subduction zones on supercontinent perimeter
- Old collision zones become suture zones (future rifting weak points)

---

## 5. Island Arc Formation Algorithm

Island arcs form where oceanic plate subducts under another oceanic plate.

```cpp
std::vector<Volcano> form_island_arc(Grid& grid,
                                      const SubductionZone& subduction) {
    // Can only form if overriding plate is also oceanic
    const Plate& overriding = get_plate(subduction.overriding_plate);
    if (!overriding.oceanic_cells.empty()) {
        return {};  // This would be continental arc instead
    }
    
    std::vector<Volcano> volcanoes;
    
    // Arc forms 100-150 km from trench (magma generation depth)
    float arc_distance = 120.0f;  // km
    auto arc_cells = grid.get_cells_at_distance(subduction.trench_cells, arc_distance);
    
    // Calculate arc length
    float arc_length = subduction.trench_cells.size() * grid.cell_spacing_km;
    
    // Volcano spacing ~50 km
    int num_volcanoes = static_cast<int>(arc_length / 50.0f);
    
    for (int i = 0; i < num_volcanoes; ++i) {
        uint32_t pos = (i * arc_length / num_volcanoes);
        uint32_t cell_id = arc_cells[pos];
        
        // Create volcano with realistic height variation
        float height = 2500.0f + random_float() * 1500.0f;  // 2500-4000m
        
        grid.cells[cell_id].elevation = height;
        volcanoes.push_back({cell_id, height, current_time});
        
        // Over time, potentially accrete to continent
        // 30% chance per Ma of having continental crust form
        if (random_float() < 0.3f) {
            auto nearby = grid.get_cells_within_distance(cell_id, 30.0f);
            for (auto& cell : nearby) {
                if (random_float() < 0.3f) {
                    cell.crust_type = CRUST_CONTINENTAL;
                    cell.elevation = std::max(cell.elevation, 1500.0f);
                }
            }
        }
    }
    
    return volcanoes;
}
```

---

## 6. Volcanism Algorithm

### 6.1 Subduction Zone Volcanism

Volatiles (water, CO2) released from subducting slab trigger melting in the mantle wedge.

```cpp
float calculate_subduction_volcanism(Grid& grid,
                                      const SubductionZone& subduction,
                                      float timestep) {
    // Get age of subducting oceanic crust
    uint16_t slab_age = get_average_ocean_crust_age(subduction.subducting_plate);
    
    float angle = subduction.angle;       // degrees, steeper = less melting
    float speed = abs(subduction.convergence_rate);  // cm/yr
    
    // Melting efficiency formula
    float melt_efficiency = (speed / 10.0f) * 
                           (1.0f - angle / 90.0f) * 
                           (slab_age / 100.0f);
    melt_efficiency = std::clamp(melt_efficiency, 0.0f, 1.0f);
    
    if (melt_efficiency > 0.3f) {
        float output = melt_efficiency * 50.0f;  // km³ per Ma per km of arc
        
        // Create volcanic vents along arc
        for (uint32_t trench_cell : subduction.trench_cells) {
            float distance = 120.0f;  // km from trench
            auto arc_cells = grid.get_cells_at_distance(trench_cell, distance);
            
            for (uint32_t arc_cell : arc_cells) {
                float volcano_height = output * random_float() * 0.1f;  // Scale to cell
                grid.cells[arc_cell].elevation += volcano_height;
            }
        }
    }
    
    return melt_efficiency;
}
```

### 6.2 Hotspot Volcanism (Mantle Plume)

```cpp
struct Plume {
    vec3 position;       // Current position
    PlumePhase phase;    // HEAD_ARRIVAL or TAIL
    float volume;        // Remaining magma volume
};

enum PlumePhase { HEAD_ARRIVAL, TAIL };

void calculate_hotspot_volcanism(Grid& grid,
                                  std::vector<Plume>& plumes,
                                  float timestep) {
    for (auto& plume : plumes) {
        if (plume.phase == PlumePhase::HEAD_ARRIVAL) {
            // Plume head creates massive flood basalt (LIP)
            create_flood_basalt(grid, plume.position, 1e6f);  // ~1 million km³
            plume.phase = PlumePhase::TAIL;
        } 
        else if (plume.phase == PlumePhase::TAIL) {
            // Plume tail creates island chain (like Hawaiian-Emperor seamounts)
            // Plate moves over fixed plume, creating chain
            create_volcano(grid, plume.position, 3000.0f);
            
            // Move plume position based on plate motion above it
            // (opposite direction of plate motion)
            // This creates the characteristic age progression along chain
        }
    }
}
```

---

## 7. Mid-Ocean Ridge Tracking

### 7.1 Ridge Formation

New oceanic crust forms at all divergent boundaries.

```cpp
void create_mid_ocean_ridge(Grid& grid,
                            const Boundary& divergent_boundary) {
    for (uint32_t cell_id : divergent_boundary.cells) {
        Cell& cell = grid.cells[cell_id];
        
        cell.crust_type = CRUST_OCEANIC;
        cell.ocean_age = 0;
        cell.is_ridge = true;  // Mark as newly created
        cell.elevation = 0.0f;  // Reference datum (will vary with depth)
    }
}
```

### 7.2 Ocean Crust Age & Depth Update

```cpp
void update_ocean_crust(Grid& grid, float timestep) {
    for (auto& cell : grid.cells) {
        if (cell.crust_type == CRUST_OCEANIC) {
            if (cell.is_ridge) {
                // Newly created this timestep - reset
                cell.ocean_age = 0;
                cell.is_ridge = false;
            } else {
                // Age increases with time
                cell.ocean_age += timestep;
            }
            
            // Calculate depth from age (Parsons & Sclater 1977)
            // depth = 2500 + 350 * sqrt(age)
            // Age in Ma, depth in meters
            if (cell.ocean_age > 0) {
                float depth = 2500.0f + 350.0f * std::sqrt((float)cell.ocean_age);
                cell.elevation = -depth;  // Negative = below sea level
            }
            
            // Old crust (>200 Ma) starts subducting
            if (cell.ocean_age > 200) {
                mark_for_subduction(grid, cell);
            }
        }
    }
}
```

### 7.3 Ridge Migration

As plates move apart, the ridge axis migrates. New cells become ridge cells when they reach the ridge position.

```cpp
void update_ridge_positions(Grid& grid, 
                            const std::vector<Boundary>& boundaries) {
    for (const auto& boundary : boundaries) {
        if (boundary.type == BoundaryType::DIVERGENT) {
            // The ridge is always at the boundary line
            // Cells on either side of the boundary are moving away
            // Each timestep, the "new" ridge is at the divergent boundary
        }
    }
}
```

---

## 8. Rifting Algorithm (Supercontinent Breakup)

### 8.1 Plume-Triggered Rifting

Heat buildup under supercontinent triggers rifting at weak points.

```cpp
float calculate_mantle_heat_under_supercontinent(const Plate& supercontinent) {
    // Heat accumulates as continent insulates mantle
    // More continental cells = more insulation = more heat
    
    float continental_area = supercontinent.continental_cells.size();
    float heat = continental_area * 0.01f;  // Normalized heat metric
    
    // Subtract heat dissipated through subduction zones on perimeter
    int perimeter_subduction_zones = count_perimeter_subduction_zones(supercontinent);
    heat -= perimeter_subduction_zones * 0.005f;
    
    return heat;
}

std::vector<Rift> trigger_rifting(Grid& grid,
                                   Plate& supercontinent,
                                   float heat) {
    const float RIFTING_THRESHOLD = 0.8f;  // Tunable parameter
    
    if (heat > RIFTING_THRESHOLD) {
        // Find weakest points: previous suture zones, failed rifts
        auto weak_points = find_suture_zones(grid, supercontinent);
        
        std::vector<Rift> rifts;
        
        // Create 3-way rifts (triple junctions)
        for (vec3 point : weak_points) {
            Rift rift = create_triple_junction_rift(grid, supercontinent, point);
            rifts.push_back(rift);
        }
        
        return rifts;
    }
    
    return {};
}
```

### 8.2 Rift Evolution

```cpp
void evolve_rift(Grid& grid, Rift& rift, float timestep) {
    float rift_rate = 2.0f;  // cm/year (full rate, each plate contributes half)
    
    // Width increase this timestep (cm -> km conversion)
    float width_increase = rift_rate * timestep * 1e5;  // km
    
    // Cells on each side of rift move apart
    for (uint32_t cell_id : rift.rift_shoulders) {
        Cell& cell = grid.cells[cell_id];
        cell.position += cell.velocity * timestep;
    }
    
    // New oceanic crust fills the gap
    create_new_oceanic_crust(grid, rift.center_line, width_increase);
    
    // 30% chance of failed rift (aulacogen) branching off
    if (random_float() < 0.3f) {
        create_failed_rift(grid, rift);
    }
}
```

### 8.3 Failed Rifts (Aulacogens)

```cpp
void create_failed_rift(Grid& grid, const Rift& main_rift) {
    // Aulacogens are rift branches that didn't fully propagate
    // They become sedimentary basins or potential reactivation points
    
    vec3 branch_point = main_rift.center_line[random_index()];
    vec3 branch_direction = perpendicular_to(main_rift.axis) + random_variation();
    
    // Create aulacogen as a depression/valley
    auto aulacogen_cells = trace_line_from(grid, branch_point, branch_direction, 500.0f);
    
    for (uint32_t cell_id : aulacogen_cells) {
        Cell& cell = grid.cells[cell_id];
        // Aulacogens are low-lying
        cell.elevation = std::min(cell.elevation, 200.0f);  // 200m above sea level
        // Mark as potential reactivation point
        cell.is_aulacogen = true;
    }
}
```

---

## 9. Simulation Loop

```cpp
void simulate_tectonics(Grid& grid,
                        std::vector<Plate>& plates,
                        float max_time_ma = 2000.0f,
                        float timestep_ma = 10.0f) {
    float current_time = 0.0f;
    
    while (current_time < max_time_ma) {
        // === Step 1: Update plate positions ===
        for (auto& plate : plates) {
            rotate_plate(grid, plate, timestep_ma);
        }
        
        // === Step 2: Detect boundaries ===
        auto boundaries = detect_boundaries(grid, plates);
        
        // === Step 3: Handle geological processes ===
        // Divergent boundaries -> new oceanic crust
        handle_divergent_boundaries(grid, boundaries.divergent);
        
        // Convergent boundaries -> subduction or collision
        auto subduction_zones = identify_subduction_zones(boundaries.convergent);
        handle_subduction(grid, subduction_zones, timestep_ma);
        
        auto collisions = identify_collisions(boundaries.convergent);
        for (const auto& collision : collisions) {
            handle_continental_collision(grid, plates, collision);
        }
        
        // Volcanism
        for (const auto& sz : subduction_zones) {
            calculate_subduction_volcanism(grid, sz, timestep_ma);
        }
        calculate_hotspot_volcanism(grid, active_plumes, timestep_ma);
        
        // === Step 4: Update ocean age and depth ===
        update_ocean_crust(grid, timestep_ma);
        
        // === Step 5: Check for supercontinent rifting ===
        if (is_supercontinent(plates)) {
            float heat = calculate_mantle_heat(plates[0]);
            if (heat > RIFTING_THRESHOLD) {
                auto rifts = trigger_rifting(grid, plates[0], heat);
                for (auto& rift : rifts) {
                    active_rifts.push_back(rift);
                }
            }
        }
        
        // Evolve existing rifts
        for (auto& rift : active_rifts) {
            evolve_rift(grid, rift, timestep_ma);
        }
        
        // === Step 6: Snapshot every 50 Ma ===
        if (fmod(current_time, 50.0f) < timestep_ma) {
            save_snapshot(grid, current_time);
        }
        
        current_time += timestep_ma;
    }
}
```

---

## 10. Key Parameters Summary

| Process | Parameter | Value |
|---------|-----------|-------|
| **Simulation** | Timestep | 10 Ma |
| | Max time | 2,000 Ma |
| | Snapshot interval | 50 Ma |
| **Boundary Detection** | Convergence threshold | 0.5 cm/yr |
| **Orogeny** | High mountain rate | 2.5 km / 100km convergence |
| | Medium mountain rate | 1.8 km / 100km convergence |
| | Low mountain rate | 1.2 km / 100km convergence |
| | Erosion rate | 0.03 km/Ma |
| **Oceanic Crust** | Max age before subduction | 200 Ma |
| | Seafloor depth equation | 2500 + 350√age (meters) |
| **Continental Motion** | Speed factor (continental) | 20-40% of oceanic |
| **Island Arcs** | Distance from trench | 100-150 km |
| | Volcano spacing | ~50 km |
| **Rifting** | Spreading rate | 2-5 cm/yr |
| | Failed rift probability | 30% per rift |

---

## 11. Output to .geoforge Format

### Channel Mapping

| Channel | Type | Description |
|---------|------|-------------|
| 0 | f32 | elevation (meters) |
| 1 | u8 | crust_type (0=ocean, 1=continental) |
| 2 | u8 | plate_id |
| 3 | u16 | ocean_age (Ma) |
| 4 | u8 | orogeny_type (if active) |
| 5-7 | | reserved for tectonic features |
| 8-23 | | reserved |

### Snapshot Storage

Every 50 Ma:
- Full elevation grid (quarter resolution)
- Plate ID grid (quarter resolution)
- Timestamp

---

## 12. Implementation Notes

### 12.1 Grid Requirements
- Use geodesic grid from `src/grid/geodesic_grid.py` (level 6, ~40k vertices)
- Cell spacing ~50-100km for reasonable resolution
- Pre-compute neighbor lists

### 12.2 Performance Considerations
- Boundary detection: O(n) where n = cell count
- Use spatial hashing for neighbor queries
- Parallelize velocity calculations

### 12.3 Validation
- Compare with GPlates for known configurations
- Verify supercontinent cycle timing (~500-750 Ma)
- Check orogeny height realism

---

## 13. References

1. Bird, P. (2003). "An updated digital model of plate boundaries." G³, 4(3).
2. Parsons, B. & Sclater, J.G. (1977). "Analysis of ocean floor bathymetry and heat flow with age." JGR, 82(5).
3. Worldbuilding Pasta (2020-2025). "An Apple Pie From Scratch" series.
4. GPlates documentation: pygplates sample code for boundary detection.

---

*End of Technical Plan*