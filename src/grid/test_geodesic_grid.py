"""Unit tests for geodesic grid implementation."""

import pytest
import math
import numpy as np
from geodesic_grid import GeodesicGrid


# Module-level singleton: constructed once, reused across all tests
_GRID = None


def get_grid():
    """Get or construct the level-6 grid (cached for speed)."""
    global _GRID
    if _GRID is None:
        _GRID = GeodesicGrid(level=6)
    return _GRID


class TestCellCount:
    """Test that cell count matches the formula 10*4^level + 2."""

    def test_cell_count_level6(self):
        """Level 6 should produce exactly 40,962 cells."""
        grid = get_grid()
        expected = 10 * (4 ** 6) + 2
        assert grid.cell_count == expected, (
            f"Expected {expected} cells at level 6, got {grid.cell_count}"
        )

    def test_cell_count_parametric(self):
        """Verify the formula holds for smaller levels (fast to construct)."""
        for level in range(0, 5):
            g = GeodesicGrid(level=level)
            expected = 10 * (4 ** level) + 2
            assert g.cell_count == expected, (
                f"Level {level}: expected {expected}, got {g.cell_count}"
            )


class TestNeighbours:
    """Test neighbour topology and consistency."""

    def test_neighbour_count_distribution(self):
        """
        Exactly 12 cells should have 5 neighbours (pentagonal, original vertices).
        All other cells should have exactly 6 neighbours (hexagonal).
        """
        grid = get_grid()
        fives = 0
        sixes = 0
        for i in range(grid.cell_count):
            n = len(grid.cell_neighbours(i))
            if n == 5:
                fives += 1
            elif n == 6:
                sixes += 1
            else:
                pytest.fail(f"Cell {i} has {n} neighbours (expected 5 or 6)")

        assert fives == 12, f"Expected 12 pentagonal cells, got {fives}"
        assert sixes == grid.cell_count - 12, (
            f"Expected {grid.cell_count - 12} hexagonal cells, got {sixes}"
        )

    def test_neighbour_symmetry(self):
        """If B is in neighbours(A), then A must be in neighbours(B)."""
        grid = get_grid()
        for i in range(grid.cell_count):
            for j in grid.cell_neighbours(i):
                if i not in grid.cell_neighbours(j):
                    pytest.fail(
                        f"Asymmetric adjacency: {j} lists {i} as neighbour "
                        f"but not vice versa"
                    )


class TestSpatialHash:
    """Test spatial hash round-trip and geographic lookups."""

    def test_spatial_hash_roundtrip(self):
        """latlon_to_cell(cell_to_latlon(i)) == i for all cells."""
        grid = get_grid()
        failures = []
        for i in range(grid.cell_count):
            lat, lon = grid.cell_to_latlon(i)
            recovered = grid.latlon_to_cell(lat, lon)
            if recovered != i:
                failures.append({
                    'cell': i,
                    'lat': lat,
                    'lon': lon,
                    'recovered': recovered
                })
                if len(failures) >= 10:
                    break

        if failures:
            msg = "Round-trip failures:\n"
            for f in failures:
                msg += f"  Cell {f['cell']}: lat={f['lat']:.6f} lon={f['lon']:.6f} -> {f['recovered']}\n"
            pytest.fail(msg)

    def test_spatial_hash_batch(self):
        """Batch lookup should match single lookups."""
        grid = get_grid()
        # Sample 1000 random cells
        rng = np.random.default_rng(seed=42)
        sample_cells = rng.integers(0, grid.cell_count, size=1000)

        latlons = np.array([grid.cell_to_latlon(i) for i in sample_cells])
        batch_result = grid.latlon_to_cells_batch(latlons)

        for idx, cell_idx in enumerate(sample_cells):
            single_result = grid.latlon_to_cell(latlons[idx, 0], latlons[idx, 1])
            assert batch_result[idx] == single_result, (
                f"Sample {idx}: batch={batch_result[idx]}, single={single_result}"
            )


class TestGeography:
    """Test geographic properties of the grid."""

    def test_cell_center_great_circle_distances(self):
        """
        Neighbouring cells should be within ~5 degrees of each other.
        At level 6 on a unit sphere, average edge length ~ 1.8 degrees.
        """
        grid = get_grid()
        rng = np.random.default_rng(seed=42)
        sample_cells = rng.integers(0, grid.cell_count, size=1000)

        for i in sample_cells:
            neighbours = grid.cell_neighbours(i)
            lat0, lon0 = grid.cell_to_latlon(i)

            # Check at least one neighbour is reasonable distance
            for nb in neighbours:
                lat1, lon1 = grid.cell_to_latlon(nb)
                dlat = math.radians(lat1 - lat0)
                dlon = math.radians(lon1 - lon0)

                # Haversine formula
                a = (math.sin(dlat / 2) ** 2 +
                     math.cos(math.radians(lat0)) *
                     math.cos(math.radians(lat1)) *
                     math.sin(dlon / 2) ** 2)
                dist_rad = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                dist_deg = math.degrees(dist_rad)

                assert dist_deg < 5.0, (
                    f"Cell {i} -> neighbour {nb}: great circle distance "
                    f"{dist_deg:.2f}° seems too large for level 6"
                )
                break  # Only check one neighbour per cell

    def test_poles_are_accessible(self):
        """North and south poles should be accessible."""
        grid = get_grid()
        north = grid.latlon_to_cell(90.0, 0.0)
        south = grid.latlon_to_cell(-90.0, 0.0)

        # Both should exist and be different
        assert 0 <= north < grid.cell_count
        assert 0 <= south < grid.cell_count
        assert north != south

        # Recovered coordinates should be near poles
        lat_n, _ = grid.cell_to_latlon(north)
        lat_s, _ = grid.cell_to_latlon(south)
        assert abs(lat_n - 90.0) < 5.0, f"North pole cell: lat={lat_n}"
        assert abs(lat_s + 90.0) < 5.0, f"South pole cell: lat={lat_s}"

    def test_antimeridian_continuity(self):
        """Cells near lon=180 and lon=-180 should be adjacent."""
        grid = get_grid()
        cell_east = grid.latlon_to_cell(0.0, 179.9)
        cell_west = grid.latlon_to_cell(0.0, -179.9)

        neighbours_east = grid.cell_neighbours(cell_east)
        neighbours_west = grid.cell_neighbours(cell_west)

        # They should be near each other (ideally direct neighbours)
        # We'll just check they're not too far
        lat_e, lon_e = grid.cell_to_latlon(cell_east)
        lat_w, lon_w = grid.cell_to_latlon(cell_west)

        dlat = math.radians(lat_w - lat_e)
        dlon = math.radians(abs(lon_w - lon_e))
        a = (math.sin(dlat / 2) ** 2 +
             math.cos(math.radians(lat_e)) *
             math.cos(math.radians(lat_w)) *
             math.sin(dlon / 2) ** 2)
        dist_deg = 2 * math.degrees(math.atan2(math.sqrt(a), math.sqrt(1 - a)))

        assert dist_deg < 5.0, (
            f"Antimeridian: east cell at ({lat_e:.2f}, {lon_e:.2f}), "
            f"west cell at ({lat_w:.2f}, {lon_w:.2f}), "
            f"distance {dist_deg:.2f}° (should be < 5°)"
        )


if __name__ == "__main__":
    # Run with: pytest test_geodesic_grid.py -v
    pytest.main([__file__, "-v"])
