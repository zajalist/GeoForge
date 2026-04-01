"""
Geodesic icosphere grid built by recursive midpoint subdivision.

Level-6 produces 40,962 cells (vertices of the subdivided icosahedron,
projected onto the unit sphere).

Cell indices 0..11 are the 12 original icosahedron vertices (pentagonal cells
with 5 neighbours). Indices 12..N-1 are hexagonal cells with 6 neighbours.
"""

import math
import numpy as np
from scipy.spatial import cKDTree
from typing import List, Tuple


class GeodesicGrid:
    """Geodesic icosphere grid on the unit sphere."""

    def __init__(self, level: int = 6) -> None:
        """
        Construct a geodesic grid via recursive subdivision.

        Args:
            level: Number of subdivision passes. Level 6 gives 40,962 cells.
        """
        self._level = level
        self._vertices: np.ndarray = np.zeros((0, 3), dtype=np.float64)
        self._faces: List[Tuple[int, int, int]] = []
        self._adjacency: List[List[int]] = []
        self._kdtree: cKDTree = None

        self._build_icosahedron()
        for _ in range(level):
            self._subdivide()
        self._project_to_sphere()
        self._build_adjacency()
        self._build_kdtree()

    # --- Public properties ---

    @property
    def cell_count(self) -> int:
        """Total number of cells in the grid."""
        return len(self._vertices)

    # --- Public methods ---

    def cell_center(self, cell_idx: int) -> Tuple[float, float]:
        """
        Get cell center coordinates.

        Args:
            cell_idx: Cell index (0 to cell_count-1)

        Returns:
            (latitude, longitude) in degrees
        """
        return self.cell_to_latlon(cell_idx)

    def cell_neighbours(self, cell_idx: int) -> List[int]:
        """
        Get indices of cells neighbouring the given cell.

        Args:
            cell_idx: Cell index

        Returns:
            List of 5 or 6 neighbour indices, sorted ascending
        """
        return self._adjacency[cell_idx]

    def latlon_to_cell(self, lat: float, lon: float) -> int:
        """
        Find the cell at the given geographic location.

        Args:
            lat: Latitude in degrees (-90 to +90)
            lon: Longitude in degrees (-180 to +180)

        Returns:
            Cell index of the nearest cell
        """
        xyz = self._latlon_to_xyz(lat, lon)
        _, idx = self._kdtree.query(xyz)
        return int(idx)

    def latlon_to_cells_batch(self, latlons: np.ndarray) -> np.ndarray:
        """
        Find cells for multiple geographic locations (vectorized).

        Args:
            latlons: (N, 2) array of [lat, lon] in degrees

        Returns:
            (N,) array of cell indices
        """
        lat_r = np.radians(latlons[:, 0])
        lon_r = np.radians(latlons[:, 1])
        xyz = np.column_stack([
            np.cos(lat_r) * np.cos(lon_r),
            np.cos(lat_r) * np.sin(lon_r),
            np.sin(lat_r)
        ])
        _, indices = self._kdtree.query(xyz)
        return indices.astype(np.int32)

    def cell_to_latlon(self, cell_idx: int) -> Tuple[float, float]:
        """
        Get geographic coordinates of a cell center.

        Args:
            cell_idx: Cell index

        Returns:
            (latitude, longitude) in degrees
        """
        x, y, z = self._vertices[cell_idx]
        return self._xyz_to_latlon(x, y, z)

    # --- Private build methods ---

    def _build_icosahedron(self) -> None:
        """Build the 12-vertex icosahedron via golden ratio construction."""
        phi = (1.0 + math.sqrt(5.0)) / 2.0

        # Canonical vertex ordering (must match C++ implementation)
        vertices_raw = [
            (0, 1, phi),
            (0, -1, phi),
            (0, 1, -phi),
            (0, -1, -phi),
            (1, phi, 0),
            (-1, phi, 0),
            (1, -phi, 0),
            (-1, -phi, 0),
            (phi, 0, 1),
            (-phi, 0, 1),
            (phi, 0, -1),
            (-phi, 0, -1),
        ]

        self._vertices = np.array([
            self._normalize_vec(np.array(v, dtype=np.float64))
            for v in vertices_raw
        ], dtype=np.float64)

        # 20 faces, CCW from outside (computed from golden ratio icosahedron)
        # Each edge appears in exactly 2 faces; each vertex has degree 5 or 6
        self._faces = [
            (0, 1, 8), (0, 9, 1), (0, 4, 5), (0, 8, 4), (0, 5, 9),
            (1, 7, 6), (1, 6, 8), (1, 9, 7), (2, 10, 3), (2, 3, 11),
            (2, 5, 4), (2, 4, 10), (2, 11, 5), (3, 6, 7), (3, 10, 6),
            (3, 7, 11), (4, 8, 10), (5, 11, 9), (6, 10, 8), (7, 9, 11),
        ]

    def _subdivide(self) -> None:
        """Perform one pass of midpoint subdivision."""
        midpoint_cache = {}

        def get_or_create_midpoint(a: int, b: int) -> int:
            """Get or create midpoint vertex index."""
            key = (min(a, b), max(a, b))
            if key in midpoint_cache:
                return midpoint_cache[key]

            # Compute midpoint (not yet normalized)
            mid = (self._vertices[a] + self._vertices[b]) * 0.5
            new_idx = len(self._vertices)
            self._vertices = np.vstack([self._vertices, [mid]])
            midpoint_cache[key] = new_idx
            return new_idx

        new_faces = []
        for a, b, c in self._faces:
            mab = get_or_create_midpoint(a, b)
            mbc = get_or_create_midpoint(b, c)
            mca = get_or_create_midpoint(c, a)

            new_faces.extend([
                (a, mab, mca),
                (b, mbc, mab),
                (c, mca, mbc),
                (mab, mbc, mca),
            ])

        self._faces = new_faces

    def _project_to_sphere(self) -> None:
        """Project all vertices onto the unit sphere."""
        norms = np.linalg.norm(self._vertices, axis=1, keepdims=True)
        self._vertices = self._vertices / norms

    def _build_adjacency(self) -> None:
        """Build neighbour lists from face topology."""
        N = len(self._vertices)
        adjacency_sets = [set() for _ in range(N)]

        for a, b, c in self._faces:
            adjacency_sets[a].add(b)
            adjacency_sets[a].add(c)
            adjacency_sets[b].add(a)
            adjacency_sets[b].add(c)
            adjacency_sets[c].add(a)
            adjacency_sets[c].add(b)

        self._adjacency = [sorted(s) for s in adjacency_sets]

    def _build_kdtree(self) -> None:
        """Build KD-tree spatial index."""
        self._kdtree = cKDTree(self._vertices)

    # --- Private helpers ---

    @staticmethod
    def _normalize_vec(v: np.ndarray) -> np.ndarray:
        """Normalize a 3D vector to unit length."""
        return v / np.linalg.norm(v)

    @staticmethod
    def _latlon_to_xyz(lat: float, lon: float) -> np.ndarray:
        """Convert lat/lon (degrees) to unit-sphere XYZ."""
        lat_r = math.radians(lat)
        lon_r = math.radians(lon)
        return np.array([
            math.cos(lat_r) * math.cos(lon_r),
            math.cos(lat_r) * math.sin(lon_r),
            math.sin(lat_r)
        ], dtype=np.float64)

    @staticmethod
    def _xyz_to_latlon(x: float, y: float, z: float) -> Tuple[float, float]:
        """Convert unit-sphere XYZ to lat/lon (degrees)."""
        # Guard against floating-point rounding
        z = max(-1.0, min(1.0, z))
        lat = math.degrees(math.asin(z))
        lon = math.degrees(math.atan2(y, x))
        return (lat, lon)
