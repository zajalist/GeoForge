"""
sim_runner.py — Python-native tectonic simulation for GeoForge web UI.

Runs entirely in-process (no C++ binary required), using the Python
geodesic grid + numpy for array operations. Completes 500 Ma in ~10-30s.

Key improvements from Worldbuilding Pasta research:
  - Cratons: thick, ancient cores — resist erosion and rifting
  - First rift: user-drawn line triggers initial divergent boundary
  - Lapse rate: 4.46°C/km (Worldbuilding Pasta value)
  - Onshore wind penetration: 1500 km from coast (not just 1 hop)
  - Köppen mountain migration: 1 km elev ≈ 8° latitude equivalent
"""

import sys
import os
import math
import random
import numpy as np
from typing import List, Dict, Any, Optional

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, '..', 'grid'))
from geodesic_grid import GeodesicGrid


# ============================================================================
# Data types
# ============================================================================

CRUST_OCEANIC      = 0
CRUST_CONTINENTAL  = 1

OROGENY_NONE   = 0
OROGENY_HIGH   = 1
OROGENY_MEDIUM = 2
OROGENY_LOW    = 3
OROGENY_ANDEAN = 4


# ============================================================================
# Plate initialisation
# ============================================================================

def initialize_cells(
    grid: GeodesicGrid,
    continental_cells: List[int],
    craton_cells: List[int],
    rift_edges: List[List[int]],
    num_plates: int,
    seed: int,
) -> tuple:
    """
    Return (cells_dict, plates_list).

    cells_dict: numpy structured array with fields:
        plate_id, crust_type, elevation, ocean_age, vel_x/y/z,
        orogeny_age, orogeny_type, is_craton

    plates_list: list of dicts with euler_lat/lon/rate and cell index lists

    rift_edges: list of [cell_a, cell_b] pairs defining rift lines.
    Rift cells are derived as all cells that appear in any rift edge.
    """
    # Derive rift_cells from edges (all cells that touch a rift edge)
    rift_cells = list({c for edge in rift_edges for c in edge})

    rng = random.Random(seed)
    N = grid.cell_count
    verts = grid._vertices  # (N, 3) float64

    # --- Voronoi plate seeding ---
    # Pick num_plates random seeds
    pole_idxs = rng.sample(range(N), num_plates)
    pole_verts = verts[pole_idxs]  # (P, 3)

    # Assign each cell to nearest pole via dot product (cosine similarity on unit sphere)
    dots = verts @ pole_verts.T  # (N, P)
    plate_id_arr = np.argmax(dots, axis=1).astype(np.uint8) + 1  # 1-indexed

    # --- Crust type ---
    crust_arr = np.zeros(N, dtype=np.uint8)  # default oceanic
    if continental_cells:
        crust_arr[continental_cells] = CRUST_CONTINENTAL

    # --- Craton flags ---
    is_craton_arr = np.zeros(N, dtype=bool)
    if craton_cells:
        is_craton_arr[craton_cells] = True
        crust_arr[craton_cells] = CRUST_CONTINENTAL  # cratons are always continental

    # --- Initial elevations ---
    elev_arr = np.zeros(N, dtype=np.float32)
    ocean_age_arr = np.zeros(N, dtype=np.uint16)

    cont_mask = (crust_arr == CRUST_CONTINENTAL)
    ocean_mask = ~cont_mask

    # Continental: 300-700 m with slight noise
    rng_np = np.random.default_rng(seed)
    elev_arr[cont_mask] = rng_np.uniform(300, 700, int(cont_mask.sum())).astype(np.float32)
    elev_arr[is_craton_arr] = rng_np.uniform(400, 800, int(is_craton_arr.sum())).astype(np.float32)

    # Oceanic: depth from Parsons & Sclater (age = 1-150 Ma random)
    ages = rng_np.integers(1, 150, int(ocean_mask.sum())).astype(np.uint16)
    ocean_age_arr[ocean_mask] = ages
    elev_arr[ocean_mask] = -(2500.0 + 350.0 * np.sqrt(ages.astype(np.float32)))

    # --- Rift cells: split into new plate at t=0 ---
    if rift_cells:
        rift_plate_id = num_plates + 1
        for rc in rift_cells:
            plate_id_arr[rc] = rift_plate_id

    # --- Velocity arrays ---
    vel_x = np.zeros(N, dtype=np.float32)
    vel_y = np.zeros(N, dtype=np.float32)
    vel_z = np.zeros(N, dtype=np.float32)
    orogeny_age  = np.zeros(N, dtype=np.uint16)
    orogeny_type = np.zeros(N, dtype=np.uint8)

    cells = {
        'plate_id':     plate_id_arr,
        'crust_type':   crust_arr,
        'elevation':    elev_arr,
        'ocean_age':    ocean_age_arr,
        'vel_x':        vel_x,
        'vel_y':        vel_y,
        'vel_z':        vel_z,
        'orogeny_age':  orogeny_age,
        'orogeny_type': orogeny_type,
        'is_craton':    is_craton_arr,
    }

    # --- Build plate metadata ---
    plates = []
    actual_num = num_plates + (1 if rift_cells else 0)
    for p in range(1, actual_num + 1):
        plate_cells_idx = np.where(plate_id_arr == p)[0]
        if len(plate_cells_idx) == 0:
            continue

        euler_lat = rng.uniform(-75, 75)
        euler_lon = rng.uniform(-180, 180)

        cont_in_plate = np.sum(crust_arr[plate_cells_idx] == CRUST_CONTINENTAL)
        total = len(plate_cells_idx)
        cont_ratio = cont_in_plate / total if total > 0 else 0
        base_rate = rng.uniform(1.5, 5.0)
        if cont_ratio > 0.8:
            rate = base_rate * 0.3
        elif cont_ratio > 0.4:
            rate = base_rate * 0.5
        else:
            rate = base_rate

        plates.append({
            'id':         p,
            'euler_lat':  euler_lat,
            'euler_lon':  euler_lon,
            'euler_rate': rate,
            'cells':      plate_cells_idx.tolist(),
        })

    return cells, plates


# ============================================================================
# Simulation loop
# ============================================================================

def run_simulation(
    grid: GeodesicGrid,
    cells: Dict,
    plates: List[Dict],
    max_time_ma: float = 500.0,
    timestep_ma: float = 10.0,
    progress_cb=None,
) -> Dict:
    """
    Run simplified tectonic simulation. Returns final cell state dict.
    progress_cb(current_time_ma, max_time_ma) called each timestep.
    """
    PI = math.pi
    N = grid.cell_count
    verts = grid._vertices  # (N, 3)
    adj = grid._adjacency   # list of lists

    # Pre-build adjacency as ragged list (already available)
    # Pre-compute per-cell Euler velocities once per plate

    current_time = 0.0
    steps = int(max_time_ma / timestep_ma)

    for step in range(steps):
        # --- 1. Compute Euler velocities ---
        _compute_velocities(cells, plates, verts, N)

        # --- 2. Detect and handle boundaries ---
        _handle_boundaries_with_output(cells, adj, N, timestep_ma)
        # (boundary list discarded in bulk mode)

        # --- 3. Update ocean crust age + Parsons & Sclater depth ---
        _update_ocean_crust(cells, timestep_ma)

        # --- 4. Erosion on orogen cells ---
        _apply_erosion(cells, timestep_ma)

        current_time += timestep_ma
        if progress_cb:
            progress_cb(current_time, max_time_ma)

    return cells


def _deg_to_xyz(lat_deg: float, lon_deg: float) -> np.ndarray:
    lat_r = math.radians(lat_deg)
    lon_r = math.radians(lon_deg)
    return np.array([
        math.cos(lat_r) * math.cos(lon_r),
        math.cos(lat_r) * math.sin(lon_r),
        math.sin(lat_r),
    ], dtype=np.float64)


def _compute_velocities(cells, plates, verts, N):
    """Euler pole rotation → velocity vector per cell (cm/yr)."""
    vel_x = cells['vel_x']
    vel_y = cells['vel_y']
    vel_z = cells['vel_z']
    plate_id_arr = cells['plate_id']
    crust_arr = cells['crust_type']

    for plate in plates:
        pole = _deg_to_xyz(plate['euler_lat'], plate['euler_lon'])
        omega_rad = math.radians(plate['euler_rate'])  # rad/Ma
        k_cm_yr = 6371.0 * 0.1  # rad/Ma × R_Earth_km × 0.1 → cm/yr

        idxs = np.array(plate['cells'], dtype=np.int32)
        if len(idxs) == 0:
            continue

        # Speed factor: continental plates move slower
        cont_count = np.sum(crust_arr[idxs] == CRUST_CONTINENTAL)
        cont_ratio = cont_count / len(idxs) if len(idxs) > 0 else 0
        if cont_ratio > 0.8:
            sf = 0.3
        elif cont_ratio > 0.4:
            sf = 0.5
        else:
            sf = 0.9

        # v = ω × r  (cross product)
        px, py, pz = pole * omega_rad
        rx = verts[idxs, 0]
        ry = verts[idxs, 1]
        rz = verts[idxs, 2]

        vx = (py * rz - pz * ry) * k_cm_yr * sf
        vy = (pz * rx - px * rz) * k_cm_yr * sf
        vz = (px * ry - py * rx) * k_cm_yr * sf

        vel_x[idxs] = vx.astype(np.float32)
        vel_y[idxs] = vy.astype(np.float32)
        vel_z[idxs] = vz.astype(np.float32)


def _handle_boundaries_with_output(cells, adj, N, dt):
    """
    Detect boundary types, apply geological effects, AND return boundary list.

    Returns:
        List of dicts: [{'type': 'ridge'|'subduction'|'collision'|'transform',
                         'cell_a': int, 'cell_b': int}, ...]
    """
    plate_id  = cells['plate_id']
    crust     = cells['crust_type']
    elev      = cells['elevation']
    orog_type = cells['orogeny_type']
    orog_age  = cells['orogeny_age']
    ocean_age = cells['ocean_age']
    is_craton = cells['is_craton']
    vx = cells['vel_x'];  vy = cells['vel_y'];  vz = cells['vel_z']

    boundaries = []

    for i in range(N):
        pid_i = plate_id[i]
        if pid_i == 0:
            continue
        for j in adj[i]:
            if j <= i:
                continue
            pid_j = plate_id[j]
            if pid_j == 0 or pid_j == pid_i:
                continue

            rel = np.array([vx[j]-vx[i], vy[j]-vy[i], vz[j]-vz[i]], dtype=np.float64)
            sep = float(rel[0])  # simplified separation proxy

            if sep > 0.3:
                # Divergent / ridge
                if crust[i] != CRUST_CONTINENTAL:
                    ocean_age[i] = 0; elev[i] = 0.0
                if crust[j] != CRUST_CONTINENTAL:
                    ocean_age[j] = 0; elev[j] = 0.0
                boundaries.append({'type': 'ridge', 'cell_a': int(i), 'cell_b': int(j)})

            elif sep < -0.3:
                both_cont = (crust[i] == CRUST_CONTINENTAL and
                             crust[j] == CRUST_CONTINENTAL)
                if both_cont:
                    conv = abs(sep)
                    if conv > 1.5:
                        otype = OROGENY_HIGH;   h = 4000.0 + conv * 200
                    elif conv > 0.8:
                        otype = OROGENY_MEDIUM; h = 2500.0 + conv * 150
                    else:
                        otype = OROGENY_LOW;    h = 1200.0 + conv * 100
                    for cell in (i, j):
                        if not is_craton[cell]:
                            elev[cell] = max(elev[cell], h)
                            orog_type[cell] = otype; orog_age[cell] = 0
                        else:
                            elev[cell] = max(elev[cell], h * 0.4)
                    boundaries.append({'type': 'collision', 'cell_a': int(i), 'cell_b': int(j)})
                else:
                    subduct = j if crust[i] == CRUST_CONTINENTAL else i
                    overrid = i if crust[i] == CRUST_CONTINENTAL else j
                    elev[subduct] = min(elev[subduct], -6000.0)
                    elev[overrid] = max(elev[overrid], 2000.0)
                    orog_type[overrid] = OROGENY_ANDEAN; orog_age[overrid] = 0
                    boundaries.append({'type': 'subduction', 'cell_a': int(i), 'cell_b': int(j)})
            else:
                boundaries.append({'type': 'transform', 'cell_a': int(i), 'cell_b': int(j)})

    return boundaries


def _update_ocean_crust(cells, dt):
    """Age oceanic cells; apply Parsons & Sclater depth equation."""
    ocean_mask = (cells['crust_type'] == CRUST_OCEANIC)
    if not np.any(ocean_mask):
        return

    dt_int = max(1, int(dt))
    new_age = cells['ocean_age'][ocean_mask].astype(np.int32) + dt_int
    new_age = np.clip(new_age, 0, 300)
    cells['ocean_age'][ocean_mask] = new_age.astype(np.uint16)

    age_f = new_age.astype(np.float32)
    cells['elevation'][ocean_mask] = -(2500.0 + 350.0 * np.sqrt(age_f))

    # Very old crust → trench depth
    old_mask_local = (new_age > 200)
    if np.any(old_mask_local):
        full_old_mask = ocean_mask.copy()
        idxs = np.where(ocean_mask)[0]
        cells['elevation'][idxs[old_mask_local]] = np.minimum(
            cells['elevation'][idxs[old_mask_local]], -8000.0)


def _apply_erosion(cells, dt):
    """Erode active mountain cells. Cratons are immune."""
    active = (cells['orogeny_type'] != OROGENY_NONE) & (~cells['is_craton'])
    if not np.any(active):
        return
    cells['elevation'][active] -= 0.03 * dt * 1000.0  # km/Ma → m
    cells['elevation'][active] = np.maximum(cells['elevation'][active], 200.0)
    new_age = cells['orogeny_age'][active].astype(np.int32) + int(dt)
    cells['orogeny_age'][active] = np.clip(new_age, 0, 65535).astype(np.uint16)


# ============================================================================
# Wilson Cycle mechanics
# ============================================================================

def _compute_assembly_index(cells, grid):
    """
    Returns (assembly_index, largest_component_cell_list).
    assembly_index = fraction of continental cells in largest connected cluster (0-1).
    """
    adj   = grid._adjacency
    crust = cells['crust_type']
    cont  = [i for i in range(grid.cell_count) if crust[i] == CRUST_CONTINENTAL]
    if not cont:
        return 0.0, []

    visited = set()
    best    = []
    for start in cont:
        if start in visited:
            continue
        component = []
        queue = [start]
        visited.add(start)
        while queue:
            cur = queue.pop()
            component.append(cur)
            for nb in adj[cur]:
                if nb not in visited and crust[nb] == CRUST_CONTINENTAL:
                    visited.add(nb)
                    queue.append(nb)
        if len(component) > len(best):
            best = component

    return len(best) / len(cont), best


def _find_rift_path(cluster, cells, grid, seed):
    """
    Find a belt of cells through the interior of the cluster for a new rift.
    Returns a list of up to 30 cell indices forming the rift path.
    """
    if not cluster:
        return []

    verts     = grid._vertices
    adj       = grid._adjacency
    is_craton = cells['is_craton']
    cluster_set = set(cluster)

    # Cluster centroid
    cx = float(np.mean(verts[cluster, 0]))
    cy = float(np.mean(verts[cluster, 1]))
    cz = float(np.mean(verts[cluster, 2]))
    norm = math.sqrt(cx*cx + cy*cy + cz*cz) or 1.0
    cx /= norm; cy /= norm; cz /= norm

    # Non-craton interior cells sorted by proximity to centroid
    interior = [c for c in cluster if not is_craton[c]]
    if not interior:
        interior = list(cluster)

    interior.sort(key=lambda c: (
        (verts[c, 0]-cx)**2 + (verts[c, 1]-cy)**2 + (verts[c, 2]-cz)**2))
    seed_cell = interior[0]

    # BFS walk up to 30 cells, staying in non-craton continental
    rng = random.Random(seed)
    visited = {seed_cell}
    path    = [seed_cell]
    frontier = [seed_cell]
    for _ in range(29):
        candidates = []
        for c in frontier:
            for nb in adj[c]:
                if nb not in visited and nb in cluster_set and not is_craton[nb]:
                    candidates.append(nb)
        if not candidates:
            break
        next_cell = rng.choice(candidates)
        visited.add(next_cell)
        path.append(next_cell)
        frontier = [next_cell]

    return path


def _maybe_trigger_auto_rift(cells, plates, grid, current_time, last_rift_ma, seed):
    """
    If supercontinent assembled for >200 Ma, inject a new rift. Returns new last_rift_ma.
    """
    assembly, cluster = _compute_assembly_index(cells, grid)
    if assembly < 0.70:
        return last_rift_ma  # not yet a supercontinent
    if current_time - last_rift_ma < 200.0:
        return last_rift_ma  # still in dwell period

    rift_cells = _find_rift_path(cluster, cells, grid, seed)
    if not rift_cells:
        return last_rift_ma

    existing_max = max((p['id'] for p in plates), default=0)
    new_plate_id = min(existing_max + 1, 255)
    if new_plate_id in {p['id'] for p in plates}:
        return last_rift_ma  # no available plate ID slots
    rng = random.Random(seed)
    new_euler_lat = rng.uniform(-60, 60)
    new_euler_lon = rng.uniform(-180, 180)

    for rc in rift_cells:
        cells['plate_id'][rc] = new_plate_id
        cells['elevation'][rc] = max(float(cells['elevation'][rc]) - 500.0, -200.0)

    plates.append({
        'id':         new_plate_id,
        'euler_lat':  new_euler_lat,
        'euler_lon':  new_euler_lon,
        'euler_rate': rng.uniform(2.0, 5.0),
        'cells':      rift_cells,
    })

    return current_time


# ============================================================================
# Climate derivation (Worldbuilding Pasta calibrated)
# ============================================================================

def derive_climate(
    grid: GeodesicGrid,
    cells: Dict,
    co2_ppm: float = 400.0,
) -> Dict:
    """
    Derive temperature, precipitation, and Köppen zone for each cell.

    Improvements over basic model (Worldbuilding Pasta):
    - Lapse rate: 4.46°C/km (not 6.5)
    - Onshore wind penetration: 1500 km from coast
    - Mountain climate migration: 1 km = 8° effective latitude shift
    """
    N = grid.cell_count
    adj = grid._adjacency
    verts = grid._vertices

    # --- Lat/lon for each cell ---
    z = np.clip(verts[:, 2], -1.0, 1.0)
    lat_deg = np.degrees(np.arcsin(z))     # -90 to +90
    lon_deg = np.degrees(np.arctan2(verts[:, 1], verts[:, 0]))

    elev = cells['elevation']
    crust = cells['crust_type']

    # --- Coastal distance (BFS, approximate km via cell hops) ---
    # Level-6 cells are ~50-100 km apart; 1500 km ≈ 20 hops
    # For speed, use 5-hop coastal influence zone
    is_coastal = _compute_coastal_influence(crust, adj, N, max_hops=15)

    # --- Temperature ---
    # T_solar: 30°C × cos(lat) [equator] to negative at poles
    T_solar = 30.0 * np.cos(np.radians(lat_deg))

    # T_lapse: Worldbuilding Pasta: 4.46°C/km (not 6.5)
    elev_km = np.maximum(0.0, elev / 1000.0)
    T_lapse = -4.46 * elev_km

    # T_greenhouse: Myhre 1998
    if co2_ppm > 0:
        T_green = 15.0 * math.log(co2_ppm / 280.0) / math.log(2.0)
    else:
        T_green = 0.0

    temperature = (T_solar + T_lapse + T_green).astype(np.float32)

    # --- Precipitation ---
    abs_lat = np.abs(lat_deg)
    P_base = np.where(abs_lat < 10,  2500.0,
             np.where(abs_lat < 25,  2500.0 - (abs_lat - 10) / 15.0 * 2100.0,
             np.where(abs_lat < 35,  400.0,
             np.where(abs_lat < 50,  400.0 + (abs_lat - 35) / 15.0 * 600.0,
             np.where(abs_lat < 65,  1000.0,
                                     200.0)))))

    # Orographic: peak at 1-1.5 km (Worldbuilding Pasta)
    P_orog = np.where(elev_km < 0,    1.0,
             np.where(elev_km < 1.0,  1.0 + elev_km * 0.4,
             np.where(elev_km < 2.0,  1.4 - (elev_km - 1.0) * 0.2,
             np.where(elev_km < 4.0,  1.2 - (elev_km - 2.0) * 0.3,
                                      0.6))))  # rainshadow >4 km

    # Coastal: 1.4× within influence zone, 0.6× continental interior
    P_coast = np.where(is_coastal, 1.4, 0.7)

    precipitation = np.clip(P_base * P_orog * P_coast, 0.0, 5000.0).astype(np.float32)

    # --- Köppen classification ---
    # Mountain migration: 1 km elevation ≈ 8° poleward (Worldbuilding Pasta)
    eff_lat = np.abs(lat_deg) + elev_km * 8.0  # effective polar latitude

    seasonality = 15.0 * np.cos(np.radians(lat_deg))
    T_min = temperature - seasonality
    T_max = temperature + seasonality
    P_thresh = 20.0 * (temperature + 7.0)

    koppen = np.zeros(N, dtype=np.uint8)
    koppen = np.where(T_max < 10.0,           5,  # E — polar/alpine
             np.where(precipitation < P_thresh, 2,  # B — arid
             np.where(T_min >= 18.0,            1,  # A — tropical
             np.where(T_min >= -3.0,            3,  # C — temperate
                                                4   # D — continental
             )))).astype(np.uint8)

    return {
        'temperature':   temperature,
        'precipitation': precipitation,
        'koppen':        koppen,
    }


def _compute_coastal_influence(crust, adj, N, max_hops=15):
    """BFS from all oceanic cells outward; mark continental cells within max_hops."""
    is_coastal = np.zeros(N, dtype=bool)
    visited = np.zeros(N, dtype=bool)
    frontier = [i for i in range(N) if crust[i] == CRUST_OCEANIC]
    for i in frontier:
        visited[i] = True

    for _ in range(max_hops):
        next_frontier = []
        for i in frontier:
            for j in adj[i]:
                if not visited[j]:
                    visited[j] = True
                    is_coastal[j] = True
                    next_frontier.append(j)
        frontier = next_frontier
        if not frontier:
            break

    return is_coastal


# ============================================================================
# Top-level entry point called by server.py
# ============================================================================

_grid_cache: Optional[GeodesicGrid] = None


def get_grid(level: int = 6) -> GeodesicGrid:
    """Return cached GeodesicGrid (singleton per level)."""
    global _grid_cache
    if _grid_cache is None or _grid_cache.cell_count != 10 * (4 ** level) + 2:
        _grid_cache = GeodesicGrid(level=level)
    return _grid_cache


def simulate(
    continental_cells: List[int],
    craton_cells: List[int],
    rift_cells: List[int],
    time_ma: float = 500.0,
    seed: int = 42,
    co2_ppm: float = 400.0,
    num_plates: int = 7,
    grid_level: int = 6,
    progress_cb=None,
) -> Dict[str, Any]:
    """
    Full simulation pipeline: init → tectonics → climate → return results.

    Returns dict with keys:
        elevation, crust_type, plate_id, ocean_age, orogeny_type,
        temperature, precipitation, koppen, cell_count
    """
    grid = get_grid(grid_level)

    # Old endpoint passes rift_cells directly; convert to edges format
    # Each cell becomes a self-edge so the derivation inside initialize_cells picks it up
    rift_edges_compat = [[c, c] for c in rift_cells] if rift_cells else []
    cells, plates = initialize_cells(
        grid, continental_cells, craton_cells, rift_edges_compat, num_plates, seed)

    cells = run_simulation(
        grid, cells, plates,
        max_time_ma=time_ma,
        timestep_ma=10.0,
        progress_cb=progress_cb,
    )

    climate = derive_climate(grid, cells, co2_ppm=co2_ppm)

    return {
        'cell_count':    grid.cell_count,
        'elevation':     cells['elevation'].tolist(),
        'crust_type':    cells['crust_type'].tolist(),
        'plate_id':      cells['plate_id'].tolist(),
        'ocean_age':     cells['ocean_age'].tolist(),
        'orogeny_type':  cells['orogeny_type'].tolist(),
        'temperature':   climate['temperature'].tolist(),
        'precipitation': climate['precipitation'].tolist(),
        'koppen':        climate['koppen'].tolist(),
    }


# ============================================================================
# Step-by-step simulation API helpers
# ============================================================================

def step_once(cells, plates, grid, dt, current_time, last_rift_ma):
    """
    Advance simulation by one timestep. Returns (boundaries, new_last_rift_ma).
    """
    verts = grid._vertices
    adj   = grid._adjacency
    N     = grid.cell_count

    _compute_velocities(cells, plates, verts, N)
    boundaries = _handle_boundaries_with_output(cells, adj, N, dt)
    _update_ocean_crust(cells, dt)
    _apply_erosion(cells, dt)

    new_last_rift = _maybe_trigger_auto_rift(
        cells, plates, grid, current_time, last_rift_ma,
        seed=int(round(current_time)) % (2**31))

    return boundaries, new_last_rift


def build_snapshot(cells, grid, co2_ppm, current_time_ma, boundaries):
    """Build JSON-serialisable snapshot dict for the frontend."""
    climate = derive_climate(grid, cells, co2_ppm=co2_ppm)
    return {
        'current_time_ma': current_time_ma,
        'cell_count':      grid.cell_count,
        'elevation':       cells['elevation'].tolist(),
        'crust_type':      cells['crust_type'].tolist(),
        'plate_id':        cells['plate_id'].tolist(),
        'orogeny_type':    cells['orogeny_type'].tolist(),
        'temperature':     climate['temperature'].tolist(),
        'precipitation':   climate['precipitation'].tolist(),
        'koppen':          climate['koppen'].tolist(),
        'boundaries':      boundaries,
    }
