"""Rift pathfinding with A* search, zigzag generation, and craton avoidance."""

import heapq
import math
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class GridCell:
    """A cell in the discretized plate grid."""

    row: int
    col: int
    lon: float
    lat: float
    is_plate: bool = False
    is_ocean_edge: bool = False
    is_craton: bool = False
    g: float = float("inf")
    h: float = 0.0
    f: float = float("inf")
    parent: Optional["GridCell"] = None
    _dist_to_centroid: float = 0.0
    _move_cost: float = 1.0


@dataclass
class RiftPath:
    """Result of rift pathfinding."""

    coordinates: list[list[float]]
    start_point: list[float]
    end_point: list[float]
    total_length_km: float
    zigzag_amplitude_deg: float
    num_zigzags: int


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Distance between two lon/lat points in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _point_in_polygon(
    lon: float, lat: float, polygon: list[list[float]], tolerance: float = 0.1
) -> bool:
    """Ray-casting point-in-polygon test with boundary tolerance."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][0], polygon[i][1]
        xj, yj = polygon[j][0], polygon[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-10) + xi
        ):
            inside = not inside
        j = i

    if not inside:
        for px, py in polygon:
            if abs(px - lon) < tolerance and abs(py - lat) < tolerance:
                inside = True
                break

    return inside


def _build_grid(
    plate_coords: list[list[float]],
    craton_polygons: list[list[list[float]]],
    resolution_deg: float = 1.0,
) -> tuple[list[list[GridCell]], float, float, float, float]:
    """Build a discretized grid over the plate with craton markers."""
    lons = [c[0] for c in plate_coords]
    lats = [c[1] for c in plate_coords]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    margin = resolution_deg * 2
    min_lon -= margin
    max_lon += margin
    min_lat -= margin
    max_lat += margin

    rows = max(1, int((max_lat - min_lat) / resolution_deg) + 1)
    cols = max(1, int((max_lon - min_lon) / resolution_deg) + 1)

    grid: list[list[GridCell]] = []
    for r in range(rows):
        row_cells: list[GridCell] = []
        for c in range(cols):
            lon = min_lon + c * resolution_deg
            lat = max_lat - r * resolution_deg
            in_plate = _point_in_polygon(lon, lat, plate_coords)
            in_craton = any(
                _point_in_polygon(lon, lat, craton) for craton in craton_polygons
            )
            cell = GridCell(
                row=r,
                col=c,
                lon=lon,
                lat=lat,
                is_plate=in_plate,
                is_ocean_edge=False,
                is_craton=in_craton and in_plate,
            )
            row_cells.append(cell)
        grid.append(row_cells)

    _mark_ocean_edges(grid, rows, cols, plate_coords, resolution_deg)

    return grid, min_lon, min_lat, max_lon, max_lat


def _mark_ocean_edges(
    grid: list[list[GridCell]],
    rows: int,
    cols: int,
    plate_coords: list[list[float]],
    resolution_deg: float,
) -> None:
    """Mark cells adjacent to non-plate area as ocean edges."""
    for r in range(rows):
        for c in range(cols):
            cell = grid[r][c]
            if not cell.is_plate:
                continue

            is_edge = False
            for dr, dc in [
                (-1, 0),
                (1, 0),
                (0, -1),
                (0, 1),
                (-1, -1),
                (-1, 1),
                (1, -1),
                (1, 1),
            ]:
                nr, nc = r + dr, c + dc
                if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                    is_edge = True
                    break
                if not grid[nr][nc].is_plate:
                    is_edge = True
                    break

            if is_edge:
                cell.is_ocean_edge = True


def _find_ocean_edge_cells(
    grid: list[list[GridCell]],
    rows: int,
    cols: int,
) -> list[GridCell]:
    """Return all ocean edge cells sorted by plate boundary position."""
    edges = []
    for r in range(rows):
        for c in range(cols):
            if grid[r][c].is_ocean_edge:
                edges.append(grid[r][c])
    return edges


def _select_rift_endpoints(
    edge_cells: list[GridCell],
    plate_coords: list[list[float]],
) -> tuple[GridCell, GridCell]:
    """Select two ocean-edge points far apart for rift start/end."""
    if len(edge_cells) < 2:
        raise ValueError("Need at least 2 ocean edge cells to create a rift")

    centroid_lon = sum(c[0] for c in plate_coords) / len(plate_coords)
    centroid_lat = sum(c[1] for c in plate_coords) / len(plate_coords)

    for cell in edge_cells:
        cell._dist_to_centroid = _haversine_km(
            cell.lon, cell.lat, centroid_lon, centroid_lat
        )

    edge_cells.sort(key=lambda c: c._dist_to_centroid, reverse=True)

    best_pair = (edge_cells[0], edge_cells[1])
    best_dist = _haversine_km(
        edge_cells[0].lon,
        edge_cells[0].lat,
        edge_cells[1].lon,
        edge_cells[1].lat,
    )

    for i in range(min(len(edge_cells), 50)):
        for j in range(i + 1, min(len(edge_cells), 50)):
            d = _haversine_km(
                edge_cells[i].lon,
                edge_cells[i].lat,
                edge_cells[j].lon,
                edge_cells[j].lat,
            )
            if d > best_dist:
                best_dist = d
                best_pair = (edge_cells[i], edge_cells[j])

    return best_pair


def _heuristic(a: GridCell, b: GridCell) -> float:
    """Euclidean heuristic in degrees (scaled for A*)."""
    dlon = a.lon - b.lon
    dlat = a.lat - b.lat
    return math.sqrt(dlon * dlon + dlat * dlat)


def _get_neighbors(
    cell: GridCell,
    grid: list[list[GridCell]],
    rows: int,
    cols: int,
    goal: GridCell,
) -> list[GridCell]:
    """Get valid neighbors for A* expansion."""
    neighbors = []
    for dr, dc in [
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (-1, 1),
        (1, -1),
        (1, 1),
    ]:
        nr, nc = cell.row + dr, cell.col + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            neighbor = grid[nr][nc]
            if neighbor.is_plate and not neighbor.is_craton:
                cost = 1.0
                if dr != 0 and dc != 0:
                    cost = 1.414

                dlon = neighbor.lon - goal.lon
                dlat = neighbor.lat - goal.lat
                dist_to_goal = math.sqrt(dlon * dlon + dlat * dlat)

                if dist_to_goal < 5.0:
                    cost *= 0.5

                neighbor._move_cost = cost
                neighbors.append(neighbor)
    return neighbors


def _astar(
    start: GridCell,
    goal: GridCell,
    grid: list[list[GridCell]],
    rows: int,
    cols: int,
) -> Optional[list[GridCell]]:
    """A* pathfinding from start to goal avoiding cratons."""
    for r in range(rows):
        for c in range(cols):
            grid[r][c].g = float("inf")
            grid[r][c].f = float("inf")
            grid[r][c].parent = None

    start.g = 0
    start.h = _heuristic(start, goal)
    start.f = start.h

    open_set: list[tuple[float, int, GridCell]] = [(start.f, 0, start)]
    counter = 1
    closed_set: set[tuple[int, int]] = set()

    while open_set:
        _, _, current = heapq.heappop(open_set)

        if (current.row, current.col) == (goal.row, goal.col):
            path = []
            node: Optional[GridCell] = current
            while node is not None:
                path.append(node)
                node = node.parent
            path.reverse()
            return path

        if (current.row, current.col) in closed_set:
            continue
        closed_set.add((current.row, current.col))

        for neighbor in _get_neighbors(current, grid, rows, cols, goal):
            if (neighbor.row, neighbor.col) in closed_set:
                continue

            move_cost = getattr(neighbor, "_move_cost", 1.0)
            tentative_g = current.g + move_cost

            if tentative_g < neighbor.g:
                neighbor.parent = current
                neighbor.g = tentative_g
                neighbor.h = _heuristic(neighbor, goal)
                neighbor.f = neighbor.g + neighbor.h
                heapq.heappush(open_set, (neighbor.f, counter, neighbor))
                counter += 1

    return None


def _generate_zigzag(
    base_path: list[GridCell],
    grid: list[list[GridCell]],
    rows: int,
    cols: int,
    amplitude_cells: int = 2,
    zigzag_interval: int = 4,
) -> list[GridCell]:
    """Add zigzag deviations to the base path while avoiding cratons."""
    if len(base_path) < 3:
        return base_path

    zigzagged = [base_path[0]]

    for i in range(1, len(base_path) - 1):
        if i % zigzag_interval == 0:
            direction = 1 if (i // zigzag_interval) % 2 == 0 else -1

            prev_lon = zigzagged[-1].lon
            prev_lat = zigzagged[-1].lat

            best_offset: Optional[GridCell] = None
            best_score = float("inf")

            for offset in range(1, amplitude_cells + 1):
                for dr, dc in [
                    (0, 1),
                    (0, -1),
                    (1, 0),
                    (-1, 0),
                    (1, 1),
                    (-1, -1),
                    (1, -1),
                    (-1, 1),
                ]:
                    nr = base_path[i].row + dr * offset * direction
                    nc = base_path[i].col + dc * offset * direction

                    if 0 <= nr < rows and 0 <= nc < cols:
                        candidate = grid[nr][nc]
                        if candidate.is_plate and not candidate.is_craton:
                            dist_from_base = _haversine_km(
                                candidate.lon,
                                candidate.lat,
                                base_path[i].lon,
                                base_path[i].lat,
                            )
                            dist_to_next = _haversine_km(
                                candidate.lon,
                                candidate.lat,
                                prev_lon,
                                prev_lat,
                            )
                            score = dist_from_base * 0.3 + dist_to_next * 0.7

                            if score < best_score:
                                best_score = score
                                best_offset = candidate

            if best_offset is not None:
                zigzagged.append(best_offset)
                prev_lon = best_offset.lon
                prev_lat = best_offset.lat
            else:
                zigzagged.append(base_path[i])
        else:
            zigzagged.append(base_path[i])

    zigzagged.append(base_path[-1])
    return zigzagged


def _smooth_path(
    path: list[GridCell],
    grid: list[list[GridCell]],
    rows: int,
    cols: int,
    iterations: int = 3,
) -> list[GridCell]:
    """Smooth the path by averaging adjacent points while staying valid."""
    if len(path) < 3:
        return path

    smoothed = list(path)

    for _ in range(iterations):
        new_path = [smoothed[0]]
        for i in range(1, len(smoothed) - 1):
            prev = smoothed[i - 1]
            curr = smoothed[i]
            next_ = smoothed[i + 1]

            avg_lon = (prev.lon + curr.lon + next_.lon) / 3.0
            avg_lat = (prev.lat + curr.lat + next_.lat) / 3.0

            closest = curr
            min_dist = float("inf")
            for dr in range(-1, 2):
                for dc in range(-1, 2):
                    nr = curr.row + dr
                    nc = curr.col + dc
                    if 0 <= nr < rows and 0 <= nc < cols:
                        candidate = grid[nr][nc]
                        if candidate.is_plate and not candidate.is_craton:
                            d = _haversine_km(
                                candidate.lon, candidate.lat, avg_lon, avg_lat
                            )
                            if d < min_dist:
                                min_dist = d
                                closest = candidate
            new_path.append(closest)
        new_path.append(smoothed[-1])
        smoothed = new_path

    return smoothed


def generate_rift_path(
    plate_coords: list[list[float]],
    craton_polygons: list[list[list[float]]],
    resolution_deg: float = 1.0,
    zigzag_amplitude: float = 2.0,
    zigzag_interval: int = 4,
) -> RiftPath:
    """Generate a rift path across a plate from ocean edge to ocean edge.

    Args:
        plate_coords: Polygon coordinates of the plate [[lon, lat], ...]
        craton_polygons: List of craton polygons to avoid
        resolution_deg: Grid cell size in degrees
        zigzag_amplitude: Zigzag deviation in degrees
        zigzag_interval: How many cells between zigzag turns

    Returns:
        RiftPath with coordinates and metadata

    Raises:
        ValueError: If pathfinding fails
    """
    grid, min_lon, min_lat, max_lon, max_lat = _build_grid(
        plate_coords, craton_polygons, resolution_deg
    )

    rows = len(grid)
    cols = len(grid[0]) if rows > 0 else 0

    if rows == 0 or cols == 0:
        raise ValueError("Grid is empty - check plate coordinates")

    edge_cells = _find_ocean_edge_cells(grid, rows, cols)
    if len(edge_cells) < 2:
        raise ValueError(f"Need at least 2 ocean edge cells, found {len(edge_cells)}")

    start, goal = _select_rift_endpoints(edge_cells, plate_coords)

    base_path = _astar(start, goal, grid, rows, cols)
    if base_path is None:
        raise ValueError(
            "No valid path found between ocean edges - "
            "plate may be fully surrounded by cratons"
        )

    amplitude_cells = max(1, int(zigzag_amplitude / resolution_deg))
    zigzagged = _generate_zigzag(
        base_path,
        grid,
        rows,
        cols,
        amplitude_cells=amplitude_cells,
        zigzag_interval=zigzag_interval,
    )

    smoothed = _smooth_path(zigzagged, grid, rows, cols)

    coordinates = [[cell.lon, cell.lat] for cell in smoothed]

    total_length = 0.0
    for i in range(1, len(coordinates)):
        total_length += _haversine_km(
            coordinates[i - 1][0],
            coordinates[i - 1][1],
            coordinates[i][0],
            coordinates[i][1],
        )

    num_zigzags = len(zigzagged) // max(1, zigzag_interval)

    return RiftPath(
        coordinates=coordinates,
        start_point=[start.lon, start.lat],
        end_point=[goal.lon, goal.lat],
        total_length_km=total_length,
        zigzag_amplitude_deg=zigzag_amplitude,
        num_zigzags=num_zigzags,
    )
