# GeoForge Tectonic Simulation - Complete Algorithm A-Z

**Version:** 2.0  
**Date:** 2026-04-01  
**Status:** Planning  
**Owner:** Badr  
**Based on:** Worldbuilding Pasta (Parts Va, Vb, Vc), GPlates kinematic modeling, Bird (2003) Plate Boundary Model, Songs of the Eons, World Orogen

---

## Core Philosophy

**Start from a supercontinent, not pre-spawned plates.** The simulation begins with a single continental mass (like Pangaea) surrounded by a global ocean. Plates emerge organically through rifting, subduction creates new continental crust via island arcs, and the full supercontinent cycle (breakup → assembly → tenure) repeats naturally over 2,000 Ma.

**Key insight from Worldbuilding Pasta:** Continental crust is permanent once formed; oceanic crust is ephemeral. The simulation tracks continental cores that persist through cycles, while oceanic crust is continuously created at ridges and destroyed at subduction zones.

---

## Phase 0: Initial State (t = 0 Ma)

### 0.1 Supercontinent Configuration

```
INPUT: User-painted supercontinent texture OR procedural Pangaea-like shape
OUTPUT: Initial grid state with:
  - All supercontinent cells: crust_type = CONTINENTAL, plate_id = 1
  - All ocean cells: crust_type = OCEANIC, plate_id = 0, ocean_age = 200 Ma
  - Subduction zones around supercontinent perimeter (pre-configured)
```

**Algorithm:**
```python
def initialize_supercontinent(grid, supercontinent_mask):
    """
    Initialize grid with a single supercontinent surrounded by ocean.
    
    supercontinent_mask: 2D array or texture where 1 = continent, 0 = ocean
    """
    for cell_id in range(grid.cell_count):
        lat, lon = grid.cell_to_latlon(cell_id)
        is_continent = sample_supercontinent_mask(supercontinent_mask, lat, lon)
        
        if is_continent:
            grid.cells[cell_id].crust_type = CRUST_CONTINENTAL
            grid.cells[cell_id].plate_id = 1  # Single supercontinent plate
            grid.cells[cell_id].elevation = 200 + noise(cell_id) * 100  # Low-lying continent
            grid.cells[cell_id].is_suture_zone = False
            grid.cells[cell_id].suture_age = 0
        else:
            grid.cells[cell_id].crust_type = CRUST_OCEANIC
            grid.cells[cell_id].plate_id = 0  # Background ocean
            grid.cells[cell_id].ocean_age = 200  # Old ocean ready to subduct
            grid.cells[cell_id].elevation = -3500  # Average ocean depth
    
    # Pre-configure subduction zones around supercontinent perimeter
    setup_perimeter_subduction(grid)
```

### 0.2 Perimeter Subduction Setup

```python
def setup_perimeter_subduction(grid):
    """
    Set up subduction zones around the supercontinent edge.
    
    These subduction zones will:
    - Pull oceanic crust under the supercontinent
    - Create volcanic arcs on the continental margin
    - Eventually consume the exterior ocean
    """
    # Find continental edge cells
    edge_cells = find_continent_edges(grid)
    
    for cell_id in edge_cells:
        # Determine subduction direction (away from continent center)
        continent_center = calculate_continent_center(grid)
        direction = normalize(grid.cells[cell_id].position - continent_center)
        
        # Create subduction zone
        grid.subduction_zones.append(SubductionZone(
            trench_cell=cell_id,
            subducting_plate=0,  # Ocean plate
            overriding_plate=1,  # Supercontinent
            direction=direction,
            angle=45.0,  # Default dip angle
            age=0
        ))
        
        # Mark cell as active margin
        grid.cells[cell_id].margin_type = MARGIN_ACTIVE
```

---

## Phase 1: Supercontinent Tenure (t = 0-100 Ma)

### 1.1 Mantle Heat Accumulation

```python
def calculate_mantle_heat_accumulation(grid, supercontinent, timestep):
    """
    Supercontinent insulates the mantle below it, causing heat to accumulate.
    This heat will eventually trigger rifting.
    
    Based on Worldbuilding Pasta: "A large supercontinent insulates the mantle 
    below it, and the trapped heat causes plumes of hot rock to form."
    """
    # Heat accumulates proportional to continental area
    continental_area = len(supercontinent.continental_cells)
    total_cells = grid.cell_count
    
    # Insulation factor (0-1): larger continents insulate more
    insulation_factor = continental_area / total_cells
    
    # Heat accumulation rate (arbitrary units per Ma)
    heat_rate = insulation_factor * 0.01
    
    # Heat dissipates through subduction zones on perimeter
    perimeter_subduction = count_perimeter_subduction_zones(supercontinent)
    heat_dissipation = perimeter_subduction * 0.005
    
    # Net heat accumulation
    net_heat = heat_rate - heat_dissipation
    supercontinent.mantle_heat += net_heat * timestep
    
    return supercontinent.mantle_heat
```

### 1.2 Hotspot Formation

```python
def generate_mantle_plumes(grid, supercontinent, heat_level):
    """
    Generate mantle plumes under the supercontinent based on accumulated heat.
    
    Plumes do NOT cause rifting directly, but create weak points in the crust
    that allow subduction zones to pull the continent apart.
    """
    RIFTING_THRESHOLD = 0.8
    
    if heat_level < RIFTING_THRESHOLD:
        return []
    
    # Number of plumes scales with heat
    num_plumes = int((heat_level - RIFTING_THRESHOLD) * 10) + 1
    num_plumes = min(num_plumes, 5)  # Cap at 5 plumes
    
    plumes = []
    for _ in range(num_plumes):
        # Plume forms at random location within supercontinent
        plume_cell = random.choice(supercontinent.continental_cells)
        
        plumes.append(MantlePlume(
            position=grid.cells[plume_cell].position,
            cell_id=plume_cell,
            strength=heat_level,
            phase=PLUME_HEAD,  # Initial plume head
            age=0
        ))
        
        # Apply uplift and thermal weakening at plume location
        apply_plume_effects(grid, plume_cell, heat_level)
    
    return plumes

def apply_plume_effects(grid, cell_id, strength):
    """
    Apply plume effects: uplift, thermal weakening, flood volcanism.
    """
    cell = grid.cells[cell_id]
    
    # Thermal uplift (broad swell, ~1000 km radius)
    for affected_cell in grid.cells_within_radius(cell_id, 1000):
        distance = grid.distance(cell_id, affected_cell)
        uplift = strength * 500 * exp(-distance / 500)  # Gaussian profile
        affected_cell.elevation += uplift
        
        # Thermal weakening (reduces crustal strength)
        affected_cell.crustal_strength *= (1.0 - strength * 0.3)
    
    # Flood volcanism at plume center (LIP - Large Igneous Province)
    if strength > 0.9:
        create_flood_basalt(grid, cell_id, volume=1e6)  # ~1 million km³
```

---

## Phase 2: Supercontinent Breakup (t = 100-200 Ma)

### 2.1 Rift Initiation at Triple Junctions

```python
def initiate_rifting(grid, supercontinent, plumes):
    """
    Initiate rifting at weak points created by mantle plumes.
    
    Rifting starts at triple junctions where initial tearing of the crust
    spreads outward in 3 directions.
    
    Based on Worldbuilding Pasta: "New rifts usually form initially at a 
    triple junction, where initial tearing of the crust at a weak point 
    spreads outwards in 3 directions."
    """
    rifts = []
    
    for plume in plumes:
        # Find weakest point near plume (previous suture zones, aulacogens)
        weak_points = find_weak_points(grid, plume.cell_id)
        
        if not weak_points:
            # Use plume center as starting point
            weak_points = [plume.cell_id]
        
        for weak_point in weak_points:
            # Create triple junction rift
            rift = create_triple_junction_rift(grid, weak_point, supercontinent)
            rifts.append(rift)
    
    return rifts

def create_triple_junction_rift(grid, center_cell, supercontinent):
    """
    Create a three-way rift system from a central point.
    
    The three rifts spread at ~120° angles from the center.
    """
    # Get position of center cell
    center_pos = grid.cells[center_cell].position
    
    # Generate three rift directions (120° apart, with some randomness)
    base_angle = random.uniform(0, 2 * pi)
    rift_directions = []
    for i in range(3):
        angle = base_angle + i * (2 * pi / 3) + random.gauss(0, 0.1)
        direction = rotate_vector(center_pos, angle)
        rift_directions.append(direction)
    
    # Create rift arms
    rift_arms = []
    for direction in rift_directions:
        arm = trace_rift_arm(grid, center_cell, direction, max_length=2000)  # km
        rift_arms.append(arm)
    
    return Rift(
        center_cell=center_cell,
        arms=rift_arms,
        age=0,
        spreading_rate=2.0,  # cm/year (full rate)
        is_active=True
    )
```

### 2.2 Rift Propagation and Ocean Basin Formation

```python
def propagate_rifts(grid, rifts, timestep):
    """
    Propagate rifts over time, creating new oceanic crust.
    
    Rifts spread outward, eventually connecting with neighboring rifts
    to form continuous mid-ocean ridges.
    """
    for rift in rifts:
        if not rift.is_active:
            continue
        
        # Each arm spreads at the rift rate
        for arm in rift.arms:
            # Extend arm by spreading rate
            extension = rift.spreading_rate * timestep * 1e5  # cm to km
            
            # Find new cells at the rift tip
            tip_cell = arm.cells[-1]
            new_cells = extend_rift_arm(grid, tip_cell, arm.direction, extension)
            arm.cells.extend(new_cells)
            
            # Create new oceanic crust along the rift
            for cell_id in new_cells:
                grid.cells[cell_id].crust_type = CRUST_OCEANIC
                grid.cells[cell_id].ocean_age = 0
                grid.cells[cell_id].is_ridge = True
                grid.cells[cell_id].elevation = 0  # Ridge height
            
            # Assign cells to diverging plates
            assign_rift_cells_to_plates(grid, arm, rift)
        
        # Check if rift arms have connected with other rifts
        check_rift_connections(grid, rift, rifts)
        
        rift.age += timestep

def extend_rift_arm(grid, tip_cell, direction, extension):
    """
    Extend a rift arm in the given direction.
    
    Returns list of new cells along the rift path.
    """
    new_cells = []
    current = tip_cell
    distance = 0
    
    while distance < extension:
        # Find neighbor in rift direction
        next_cell = find_neighbor_in_direction(grid, current, direction)
        if next_cell is None:
            break
        
        new_cells.append(next_cell)
        current = next_cell
        distance += grid.cell_spacing_km
    
    return new_cells
```

### 2.3 Failed Rifts (Aulacogens)

```python
def generate_failed_rifts(grid, rifts):
    """
    Generate failed rifts (aulacogens) that branch off from main rifts.
    
    The third arm of a triple junction that doesn't connect with other rifts
    becomes a failed rift. These remain as weak points for future rifting.
    """
    for rift in rifts:
        # Each triple junction has one failed arm (30% probability)
        if random.random() < 0.3:
            failed_arm = random.choice(rift.arms)
            
            # Mark as failed rift
            for cell_id in failed_arm.cells:
                grid.cells[cell_id].is_aulacogen = True
                grid.cells[cell_id].elevation = min(grid.cells[cell_id].elevation, 200)
            
            rift.failed_arms.append(failed_arm)
```

### 2.4 Plate Creation from Rifting

```python
def create_new_plates_from_rifting(grid, supercontinent, rifts):
    """
    When rifts fully propagate, split the supercontinent into separate plates.
    
    Each rift arm becomes a plate boundary. Cells on either side of the rift
    are assigned to different plates.
    """
    # Build connected components of continental cells
    # separated by rift boundaries
    
    visited = set()
    new_plates = []
    
    for cell_id in supercontinent.continental_cells:
        if cell_id in visited:
            continue
        
        # Flood fill to find connected continental region
        region = flood_fill_continent(grid, cell_id, rifts, visited)
        
        if len(region) > MIN_PLATE_SIZE:  # Minimum plate size threshold
            new_plate = Plate(
                plate_id=generate_plate_id(),
                continental_cells=region,
                oceanic_cells=[],
                euler_pole=calculate_euler_pole(region),
                name=f"Plate_{len(new_plates) + 1}"
            )
            new_plates.append(new_plate)
            
            # Assign plate_id to cells
            for cid in region:
                grid.cells[cid].plate_id = new_plate.plate_id
    
    return new_plates
```

---

## Phase 3: Ocean Basin Evolution (t = 200-400 Ma)

### 3.1 Mid-Ocean Ridge System

```python
def update_mid_ocean_ridges(grid, plate_boundaries, timestep):
    """
    Update mid-ocean ridge system as plates diverge.
    
    New oceanic crust forms at divergent boundaries.
    Ridge position migrates based on asymmetric spreading.
    """
    for boundary in plate_boundaries:
        if boundary.type != BOUNDARY_DIVERGENT:
            continue
        
        # Ridge is at the boundary between diverging plates
        ridge_cells = boundary.cells
        
        for cell_id in ridge_cells:
            cell = grid.cells[cell_id]
            
            # New crust at ridge
            cell.crust_type = CRUST_OCEANIC
            cell.ocean_age = 0
            cell.is_ridge = True
            cell.elevation = 0  # Ridge height (reference datum)
        
        # Asymmetric spreading: ridge may migrate
        if boundary.spreading_asymmetry != 0.5:
            migrate_ridge(grid, boundary, timestep)

def migrate_ridge(grid, boundary, timestep):
    """
    Migrate ridge position based on asymmetric spreading.
    
    If one plate moves faster than the other, the ridge migrates
    toward the slower plate.
    """
    asymmetry = boundary.spreading_asymmetry  # 0.0-1.0 (0.5 = symmetric)
    migration = (asymmetry - 0.5) * boundary.spreading_rate * timestep
    
    # Shift ridge cells toward slower plate
    if migration > 0:
        shift_direction = boundary.plate_a_direction
    else:
        shift_direction = boundary.plate_b_direction
    
    # ... (implementation details)
```

### 3.2 Ocean Crust Aging and Subduction

```python
def update_ocean_crust_age_and_subduction(grid, timestep):
    """
    Update age of all oceanic crust and trigger subduction for old crust.
    
    Oceanic crust ages, cools, and becomes denser. Old crust (>200 Ma)
    becomes prone to subduction.
    """
    for cell_id in grid.ocean_cells:
        cell = grid.cells[cell_id]
        
        if cell.is_ridge:
            cell.ocean_age = 0
            cell.is_ridge = False
        else:
            cell.ocean_age += timestep
        
        # Calculate depth from age (Parsons & Sclater 1977)
        if cell.ocean_age > 0:
            depth = 2500 + 350 * sqrt(cell.ocean_age)
            cell.elevation = -depth
        
        # Old crust becomes subduction-prone
        if cell.ocean_age > 180:
            cell.subduction_prone = True
            cell.subduction_probability = (cell.ocean_age - 180) / 20
    
    # Trigger new subduction zones where old crust exists
    trigger_new_subduction_zones(grid)
```

### 3.3 Subduction Zone Dynamics

```python
def update_subduction_zones(grid, subduction_zones, timestep):
    """
    Update all subduction zones:
    - Consume oceanic crust
    - Generate volcanic arcs
    - Create new continental crust via island arcs
    - Handle slab rollback and subduction jumping
    """
    for sz in subduction_zones:
        # Consume oceanic crust at subduction rate
        consumption_rate = sz.convergence_rate * timestep * 1e5  # cm to km
        
        # Advance trench into subducting plate
        advance_trench(grid, sz, consumption_rate)
        
        # Generate volcanic arc on overriding plate
        generate_volcanic_arc(grid, sz)
        
        # Update subduction zone age
        sz.age += timestep
        
        # Check for slab rollback (trench retreats)
        if sz.age > 50 and random.random() < 0.1:
            slab_rollback(grid, sz)
        
        # Check for subduction jumping (new trench forms)
        if sz.age > 100 and random.random() < 0.05:
            subduction_jump(grid, sz)
        
        # Remove subduction zone if no more oceanic crust to subduct
        if sz.remaining_oceanic_crust == 0:
            sz.is_active = False

def generate_volcanic_arc(grid, sz):
    """
    Generate volcanic arc on overriding plate.
    
    Arc forms 100-150 km from trench (magma generation depth).
    If overriding plate is oceanic, forms island arc.
    If overriding plate is continental, forms continental arc (Andes-style).
    """
    overriding_plate = get_plate(sz.overriding_plate)
    arc_distance = 120  # km from trench
    
    # Find arc cells
    arc_cells = get_cells_at_distance(grid, sz.trench_cells, arc_distance)
    
    if overriding_plate.crust_type == CRUST_OCEANIC:
        # Island arc: build up volcanic islands
        for cell_id in arc_cells:
            cell = grid.cells[cell_id]
            
            # Build volcanic island
            cell.elevation += 50 * sz.age / 10  # Growth over time
            
            # If island emerges above sea level, it's continental crust
            if cell.elevation > 0:
                cell.crust_type = CRUST_CONTINENTAL
                cell.is_volcanic_arc = True
    else:
        # Continental arc: build mountain range (Andes-style)
        for cell_id in arc_cells:
            cell = grid.cells[cell_id]
            cell.elevation += 30 * sz.age / 10
            cell.is_volcanic_arc = True
```

---

## Phase 4: Continental Collision and Orogeny (t = 400-500 Ma)

### 4.1 Collision Detection

```python
def detect_continental_collisions(grid, plate_boundaries):
    """
    Detect when two continental plates are converging.
    
    Collision occurs when:
    - Both plates have significant continental crust
    - Relative motion is convergent
    - Oceanic crust between them is fully consumed
    """
    collisions = []
    
    for boundary in plate_boundaries:
        if boundary.type != BOUNDARY_CONVERGENT:
            continue
        
        plate_a = get_plate(boundary.plate_a)
        plate_b = get_plate(boundary.plate_b)
        
        # Check if both plates are primarily continental
        a_continental_ratio = len(plate_a.continental_cells) / len(plate_a.all_cells)
        b_continental_ratio = len(plate_b.continental_cells) / len(plate_b.all_cells)
        
        if a_continental_ratio > 0.5 and b_continental_ratio > 0.5:
            # Continental collision detected
            collision = ContinentalCollision(
                boundary=boundary,
                plate_a=plate_a,
                plate_b=plate_b,
                convergence_rate=boundary.convergence_rate,
                start_time=current_time,
                orogeny_type=classify_orogeny_type(boundary.convergence_rate)
            )
            collisions.append(collision)
    
    return collisions
```

### 4.2 Orogeny Classification

```python
def classify_orogeny_type(convergence_rate):
    """
    Classify orogeny type based on convergence rate.
    
    Based on Worldbuilding Pasta and real-world examples:
    - High convergence (>3 cm/yr): Himalayas-style (high mountains)
    - Medium convergence (1.5-3 cm/yr): Alps-style (medium mountains)
    - Low convergence (<1.5 cm/yr): Appalachians-style (low mountains)
    """
    if convergence_rate > 3.0:
        return OROGENY_HIGH_MOUNTAIN  # Himalayas
    elif convergence_rate > 1.5:
        return OROGENY_MEDIUM_MOUNTAIN  # Alps
    else:
        return OROGENY_LOW_MOUNTAIN  # Appalachians
```

### 4.3 Orogeny Implementation

```python
def apply_orogeny(grid, collision, timestep):
    """
    Apply orogenic uplift during continental collision.
    
    Mountain building occurs over tens of millions of years.
    Height depends on convergence rate and duration.
    """
    # Calculate mountain height based on convergence
    convergence_total = collision.convergence_rate * collision.duration
    max_height = calculate_max_height(collision.orogeny_type, convergence_total)
    
    # Apply uplift along collision boundary
    width = get_orogeny_width(collision.orogeny_type)
    
    for cell_id in collision.boundary.cells:
        # Get cells within orogeny width
        affected_cells = grid.cells_within_distance(cell_id, width)
        
        for affected_id in affected_cells:
            cell = grid.cells[affected_id]
            distance = grid.distance(cell_id, affected_id)
            
            # Distance-based uplift profile (Gaussian)
            uplift_factor = exp(-(distance / width) ** 2)
            uplift = max_height * uplift_factor * (timestep / collision.duration)
            
            cell.elevation += uplift
            cell.is_orogenic_belt = True
            cell.orogeny_age = collision.duration
    
    # Update collision duration
    collision.duration += timestep

def calculate_max_height(orogeny_type, convergence_total):
    """
    Calculate maximum mountain height based on orogeny type and convergence.
    """
    height_coefficients = {
        OROGENY_HIGH_MOUNTAIN: 2.5,    # km per 100km convergence
        OROGENY_MEDIUM_MOUNTAIN: 1.8,
        OROGENY_LOW_MOUNTAIN: 1.2,
    }
    
    base_height = convergence_total * height_coefficients[orogeny_type]
    return min(base_height, 9.0)  # Cap at ~9 km (Everest scale)
```

### 4.4 Continental Suturing

```python
def suture_continents(grid, collision):
    """
    Suture two continental plates together after collision.
    
    The two continents merge into a single plate.
    The collision zone becomes a suture zone (weak point for future rifting).
    """
    plate_a = collision.plate_a
    plate_b = collision.plate_b
    
    # Merge plate_b into plate_a
    plate_a.continental_cells.extend(plate_b.continental_cells)
    plate_a.oceanic_cells.extend(plate_b.oceanic_cells)
    
    # Update cell plate_ids
    for cell_id in plate_b.all_cells:
        grid.cells[cell_id].plate_id = plate_a.plate_id
    
    # Mark collision zone as suture zone
    for cell_id in collision.boundary.cells:
        grid.cells[cell_id].is_suture_zone = True
        grid.cells[cell_id].suture_age = collision.duration
    
    # Remove plate_b from active plates
    remove_plate(grid, plate_b)
    
    # Update plate_a's Euler pole (recalculate for merged plate)
    plate_a.euler_pole = calculate_euler_pole(plate_a.continental_cells)
```

---

## Phase 5: Supercontinent Assembly (t = 500-600 Ma)

### 5.1 Assembly Detection

```python
def detect_supercontinent_assembly(grid, plates):
    """
    Detect when continents have assembled into a supercontinent.
    
    Criteria:
    - Most continental cells belong to 1-2 large plates
    - Plate count is low (<5 major plates)
    - Continental area is concentrated
    """
    # Count major plates (>10% of continental area)
    total_continental_cells = sum(len(p.continental_cells) for p in plates)
    major_plates = [p for p in plates if len(p.continental_cells) > 0.1 * total_continental_cells]
    
    if len(major_plates) <= 2:
        # Supercontinent assembled
        return True, major_plates
    
    return False, []
```

### 5.2 New Subduction Zone Formation

```python
def initiate_new_subduction_zones(grid, supercontinent):
    """
    Initiate new subduction zones around the supercontinent perimeter.
    
    Based on Worldbuilding Pasta: Three mechanisms for new subduction:
    1. Passive margin collapse (rare)
    2. Transform collapse (most common)
    3. Plume head margin collapse
    
    As ocean crust ages, it becomes denser and more prone to subduction.
    """
    # Find passive margins (edges of supercontinent facing ocean)
    passive_margins = find_passive_margins(grid, supercontinent)
    
    for margin_cell in passive_margins:
        # Check adjacent ocean crust age
        adjacent_ocean = get_adjacent_ocean_cells(grid, margin_cell)
        
        if adjacent_ocean:
            avg_age = mean(grid.cells[c].ocean_age for c in adjacent_ocean)
            
            # Old ocean crust (>150 Ma) is prone to subduction
            if avg_age > 150 and random.random() < 0.1:
                # Determine subduction polarity
                subduction_dir = determine_subduction_direction(grid, margin_cell)
                
                # Create new subduction zone
                sz = SubductionZone(
                    trench_cell=margin_cell,
                    subducting_plate=0,  # Ocean
                    overriding_plate=supercontinent.plate_id,
                    direction=subduction_dir,
                    angle=45.0,
                    age=0
                )
                grid.subduction_zones.append(sz)
                
                # Mark margin as active
                grid.cells[margin_cell].margin_type = MARGIN_ACTIVE
```

---

## Phase 6: Full Supercontinent Cycle Loop

### 6.1 Main Simulation Loop

```python
def simulate_full_tectonic_cycle(grid, max_time=2000, timestep=10):
    """
    Simulate full tectonic cycles from supercontinent to supercontinent.
    
    Phases:
    0. Initialize supercontinent (t=0)
    1. Supercontinent tenure (t=0-100)
    2. Mantle heat accumulation (t=0-100)
    3. Rifting and breakup (t=100-200)
    4. Ocean basin evolution (t=200-400)
    5. Continental drift and collision (t=400-500)
    6. Supercontinent assembly (t=500-600)
    7. Repeat from phase 1
    """
    current_time = 0
    cycle_count = 0
    
    # Phase 0: Initialize
    initialize_supercontinent(grid, supercontinent_mask)
    plates = [create_initial_plate(grid)]
    
    while current_time < max_time:
        # Determine current phase
        phase = determine_phase(grid, plates, current_time)
        
        if phase == PHASE_TENURE:
            # Supercontinent tenure: heat accumulation, plume formation
            heat = calculate_mantle_heat_accumulation(grid, plates[0], timestep)
            plumes = generate_mantle_plumes(grid, plates[0], heat)
            
        elif phase == PHASE_RIFTING:
            # Rifting: triple junctions, ocean basin formation
            if current_time % 50 == 0:  # Check every 50 Ma
                rifts = initiate_rifting(grid, plates[0], plumes)
                propagate_rifts(grid, rifts, timestep)
                generate_failed_rifts(grid, rifts)
                
                # Create new plates from rifted continents
                new_plates = create_new_plates_from_rifting(grid, plates[0], rifts)
                plates.extend(new_plates)
                
        elif phase == PHASE_OCEAN_EVOLUTION:
            # Ocean basin evolution: ridges, subduction, island arcs
            update_mid_ocean_ridges(grid, plate_boundaries, timestep)
            update_ocean_crust_age_and_subduction(grid, timestep)
            update_subduction_zones(grid, subduction_zones, timestep)
            
            # Move plates based on subduction pull
            update_plate_positions(grid, plates, subduction_zones, timestep)
            
        elif phase == PHASE_COLLISION:
            # Continental collision and orogeny
            collisions = detect_continental_collisions(grid, plate_boundaries)
            
            for collision in collisions:
                apply_orogeny(grid, collision, timestep)
                
                # Check if collision is complete
                if collision.duration > 50:  # 50 Ma of collision
                    suture_continents(grid, collision)
                    
        elif phase == PHASE_ASSEMBLY:
            # Supercontinent assembly
            is_assembled, major_plates = detect_supercontinent_assembly(grid, plates)
            
            if is_assembled:
                cycle_count += 1
                # Reset for next cycle
                plates = major_plates
                initiate_new_subduction_zones(grid, plates[0])
        
        # Update plate boundaries
        plate_boundaries = detect_plate_boundaries(grid, plates)
        
        # Apply erosion to mountains
        if current_time % 10 == 0:
            apply_erosion(grid, timestep)
        
        # Snapshot every 50 Ma
        if current_time % 50 == 0:
            save_snapshot(grid, current_time)
        
        current_time += timestep
    
    return grid, plates, cycle_count
```

---

## Key Algorithms Summary

### A. Plate Motion (Euler Pole Rotation)
```
velocity = ω × r
where ω = angular velocity from Euler pole
      r = position vector from Earth center
```

### B. Boundary Detection
```
For each cell-neighbor pair:
  relative_velocity = v_neighbor - v_cell
  separation = dot(relative_velocity, direction_to_neighbor)
  
  if separation > 0.5 cm/yr: DIVERGENT
  elif separation < -0.5 cm/yr: CONVERGENT
  else: TRANSFORM
```

### C. Ocean Crust Depth (Parsons & Sclater 1977)
```
depth = 2500 + 350 × √age  (meters, age in Ma)
```

### D. Subduction Consumption
```
consumption = convergence_rate × timestep
ocean_age increases until >200 Ma → subduction
```

### E. Orogeny Height
```
height = convergence_total × coefficient
where coefficient = 1.2-2.5 km/100km based on orogeny type
```

### F. Erosion (Stream Power)
```
∂z/∂t = K × A^m × S^n
K = 0.001, m = 0.5, n = 1.0
```

---

## Output to .geoforge

| Channel | Type | Description |
|---------|------|-------------|
| 0 | f32 | elevation (m) |
| 1 | u8 | crust_type (0=ocean, 1=continental) |
| 2 | u8 | plate_id |
| 3 | u16 | ocean_age (Ma) |
| 4 | u8 | margin_type (0=passive, 1=active) |
| 5 | u8 | orogeny_type (if active) |
| 6 | bool | is_suture_zone |
| 7 | u16 | suture_age (Ma) |
| 8 | bool | is_volcanic_arc |
| 9 | bool | is_aulacogen |
| 10 | f32 | crustal_strength |
| 11-23 | | reserved |

---

## Validation Against Real Earth

- **Supercontinent cycle timing:** ~500-750 Ma per cycle
- **Ocean crust age:** Max ~200 Ma (matches Earth)
- **Mountain heights:** Up to 9 km (Everest scale)
- **Plate speeds:** 1-10 cm/yr (matches Earth)
- **Continental permanence:** Continents persist through cycles
- **Suture zones:** Mark locations of past collisions

---

## References

1. Worldbuilding Pasta (2020-2025). "An Apple Pie From Scratch" Parts Va, Vb, Vc.
2. Bird, P. (2003). "An updated digital model of plate boundaries."
3. Parsons, B. & Sclater, J.G. (1977). "Analysis of ocean floor bathymetry and heat flow with age."
4. Stern, R.J. & Gerya, T. (2018). "Subduction initiation in nature and models."
5. Bradley, D.C. (2011). "Secular trends in continental geology."

---

*End of Complete Tectonic Simulation Algorithm*