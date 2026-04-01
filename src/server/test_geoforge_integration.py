"""
test_geoforge_integration.py — Integration tests for the .geoforge pipeline.

Tests:
  - write_geoforge: file is created, correct size regions
  - GeoForgeFile: header parsed correctly, channels round-trip
  - cells_in_bounds: spatial query returns expected cells
  - Full pipeline: simulate -> write -> read -> tile query

Run:
    cd src/server
    pytest test_geoforge_integration.py -v
"""

import sys
import os
import tempfile
import struct
import numpy as np
import pytest

# Make sure server-side modules are importable
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'grid'))

from geoforge import (
    write_geoforge, GeoForgeFile, cells_in_bounds,
    MAGIC, HEADER_SIZE, INDEX_SIZE, NUM_CHANNELS, CHANNEL_NAMES,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

CELL_COUNT = 642  # level-3 icosphere (fast for tests)

def _mock_sim_result(n: int = CELL_COUNT) -> dict:
    """Minimal sim result dict that write_geoforge accepts."""
    rng = np.random.default_rng(0)
    return {
        'cell_count':    n,
        'elevation':     rng.uniform(-8000, 5000, n).astype(float).tolist(),
        'crust_type':    rng.integers(0, 2, n).astype(int).tolist(),
        'temperature':   rng.uniform(-50, 45, n).astype(float).tolist(),
        'precipitation': rng.uniform(0, 5000, n).astype(float).tolist(),
        'koppen':        rng.integers(1, 6, n).astype(int).tolist(),
    }


@pytest.fixture
def sim_result():
    return _mock_sim_result()


@pytest.fixture
def geoforge_file(sim_result, tmp_path):
    out = str(tmp_path / 'test.geoforge')
    write_geoforge(sim_result, out, co2_ppm=400.0, grid_level=3)
    return out, sim_result


# ── Writer tests ──────────────────────────────────────────────────────────────

class TestWriter:
    def test_file_created(self, geoforge_file):
        path, _ = geoforge_file
        assert os.path.exists(path)

    def test_file_not_empty(self, geoforge_file):
        path, _ = geoforge_file
        assert os.path.getsize(path) > HEADER_SIZE + INDEX_SIZE

    def test_magic_bytes(self, geoforge_file):
        path, _ = geoforge_file
        with open(path, 'rb') as f:
            magic = f.read(4)
        assert magic == MAGIC

    def test_header_size(self, geoforge_file):
        path, _ = geoforge_file
        with open(path, 'rb') as f:
            header = f.read(HEADER_SIZE)
        assert len(header) == HEADER_SIZE

    def test_index_size(self, geoforge_file):
        path, _ = geoforge_file
        with open(path, 'rb') as f:
            f.seek(HEADER_SIZE)
            index = f.read(INDEX_SIZE)
        assert len(index) == INDEX_SIZE

    def test_creates_parent_dirs(self, sim_result, tmp_path):
        nested = str(tmp_path / 'a' / 'b' / 'c' / 'planet.geoforge')
        write_geoforge(sim_result, nested)
        assert os.path.exists(nested)

    def test_returns_absolute_path(self, sim_result, tmp_path):
        out = str(tmp_path / 'planet.geoforge')
        result = write_geoforge(sim_result, out)
        assert os.path.isabs(result)


# ── Reader tests ──────────────────────────────────────────────────────────────

class TestReader:
    def test_open(self, geoforge_file):
        path, _ = geoforge_file
        gf = GeoForgeFile(path)
        assert gf is not None

    def test_cell_count(self, geoforge_file):
        path, sim = geoforge_file
        gf = GeoForgeFile(path)
        assert gf.cell_count == sim['cell_count']

    def test_grid_level(self, geoforge_file):
        path, _ = geoforge_file
        gf = GeoForgeFile(path)
        assert gf.grid_level == 3

    def test_co2(self, geoforge_file):
        path, _ = geoforge_file
        gf = GeoForgeFile(path)
        assert abs(gf.co2_ppm - 400.0) < 0.01

    def test_elevation_roundtrip(self, geoforge_file):
        path, sim = geoforge_file
        gf   = GeoForgeFile(path)
        elev = gf.get_channel(0)
        expected = np.array(sim['elevation'], dtype=np.float32)
        np.testing.assert_allclose(elev, expected, rtol=1e-5)

    def test_crust_type_roundtrip(self, geoforge_file):
        path, sim = geoforge_file
        gf    = GeoForgeFile(path)
        crust = gf.get_channel(1)
        expected = np.array(sim['crust_type'], dtype=np.uint8)
        np.testing.assert_array_equal(crust, expected)

    def test_temperature_roundtrip(self, geoforge_file):
        path, sim = geoforge_file
        gf   = GeoForgeFile(path)
        temp = gf.get_channel(2)
        expected = np.array(sim['temperature'], dtype=np.float32)
        np.testing.assert_allclose(temp, expected, rtol=1e-5)

    def test_get_channel_by_name(self, geoforge_file):
        path, sim = geoforge_file
        gf   = GeoForgeFile(path)
        elev = gf.get_channel_by_name('elevation')
        assert len(elev) == sim['cell_count']

    def test_channel_caching(self, geoforge_file):
        path, _ = geoforge_file
        gf  = GeoForgeFile(path)
        a   = gf.get_channel(0)
        b   = gf.get_channel(0)
        assert a is b  # same object from cache

    def test_reserved_channels_are_zeros(self, geoforge_file):
        path, _ = geoforge_file
        gf = GeoForgeFile(path)
        for ch_id in range(11, 24):
            arr = gf.get_channel(ch_id)
            assert np.all(arr == 0), f'Channel {ch_id} should be all zeros'

    def test_invalid_file_raises(self, tmp_path):
        bad = tmp_path / 'bad.geoforge'
        bad.write_bytes(b'\x00' * 512)
        with pytest.raises(ValueError, match='Not a .geoforge file'):
            GeoForgeFile(str(bad))


# ── Spatial query tests ───────────────────────────────────────────────────────

class TestCellsInBounds:
    def _make_verts(self):
        """Small set of known lat/lon points as unit-sphere xyz."""
        lats = np.array([0.0,  45.0, -45.0, 10.0,  80.0])
        lons = np.array([0.0, 90.0,  -90.0, 15.0, 170.0])
        lat_r = np.radians(lats)
        lon_r = np.radians(lons)
        x = np.cos(lat_r) * np.cos(lon_r)
        y = np.cos(lat_r) * np.sin(lon_r)
        z = np.sin(lat_r)
        return np.column_stack([x, y, z])

    def test_all_in_global_bounds(self):
        verts = self._make_verts()
        idxs  = cells_in_bounds(verts, -90, 90, -180, 180)
        assert len(idxs) == len(verts)

    def test_equatorial_band(self):
        verts = self._make_verts()
        idxs  = cells_in_bounds(verts, -20, 20, -180, 180)
        # cells 0 (0°) and 3 (10°) should be in; 1 (45°) and 2 (-45°) out
        assert 0 in idxs
        assert 3 in idxs
        assert 1 not in idxs
        assert 2 not in idxs

    def test_lon_wrap(self):
        verts = self._make_verts()
        # Cell 4 at lon=170° should be in [160°, -160°] wrap-around box
        idxs = cells_in_bounds(verts, -90, 90, 160, -160)
        assert 4 in idxs

    def test_empty_result(self):
        verts = self._make_verts()
        idxs  = cells_in_bounds(verts, 85, 90, -5, 5)
        assert len(idxs) == 0


# ── Full pipeline test ────────────────────────────────────────────────────────

class TestPipeline:
    def test_simulate_write_read_tile(self, tmp_path):
        """Run sim_runner → write .geoforge → read back → tile query."""
        import sim_runner
        from geodesic_grid import GeodesicGrid  # type: ignore

        grid = GeodesicGrid(level=3)
        N    = grid.cell_count

        # Mark ~20% of cells as continental
        rng        = np.random.default_rng(7)
        cont_cells = rng.choice(N, N // 5, replace=False).tolist()

        result = sim_runner.simulate(
            continental_cells=cont_cells,
            craton_cells=[],
            rift_cells=[],
            time_ma=50.0,
            seed=7,
            co2_ppm=400.0,
            num_plates=4,
            grid_level=3,
        )
        assert result['cell_count'] == N

        # Write
        out = str(tmp_path / 'pipeline.geoforge')
        path = write_geoforge(result, out, grid_level=3)
        assert os.path.exists(path)

        # Read back
        gf = GeoForgeFile(path)
        assert gf.cell_count == N
        assert gf.grid_level == 3

        elev = gf.get_channel(0)
        assert len(elev) == N
        np.testing.assert_allclose(
            elev,
            np.array(result['elevation'], dtype=np.float32),
            rtol=1e-5,
        )

        # Tile query — equatorial band
        tile = gf.query_tile(-30, 30, -180, 180, grid._vertices)
        assert len(tile['cell_indices']) > 0
        assert 'elevation' in tile
        assert len(tile['elevation']) == len(tile['cell_indices'])
        # All 24 channel names present
        for name in CHANNEL_NAMES.values():
            assert name in tile, f'Missing channel: {name}'
