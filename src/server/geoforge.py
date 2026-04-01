"""
geoforge.py — .geoforge binary format: writer, reader, and spatial utilities.

On-disk layout
--------------
  HEADER        256 bytes   magic, planet params, grid params, timestamp
  CHANNEL_INDEX 512 bytes   24 × 20-byte entries (offset, sizes, dtype)
  CHANNEL_DATA  variable    24 LZ4-compressed blobs

Channel table
-------------
  0  elevation      f32
  1  crust_type     u8
  2  temperature    f32
  3  precipitation  f32
  4  koppen_zone    u8
  5  soil_order     u8   (zeros until ML model ready)
  6  biome_class    u8   (zeros until ML model ready)
  7  veg_grass      f32
  8  veg_shrub      f32
  9  veg_tree       f32
  10 veg_special    f32
  11-23 reserved   u8
"""

import struct
import time
import numpy as np
import lz4.frame
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

# ── Constants ────────────────────────────────────────────────────────────────

MAGIC            = b'GFG2'
NUM_CHANNELS     = 24
HEADER_SIZE      = 256
INDEX_SIZE       = 512
INDEX_ENTRY_SIZE = 20   # Q(8) + I(4) + I(4) + B(1) + 3x(3) = 20

DTYPE_F32 = 0
DTYPE_U8  = 1
DTYPE_U16 = 2

_NP_DTYPE = {DTYPE_F32: np.float32, DTYPE_U8: np.uint8, DTYPE_U16: np.uint16}

# (channel_id, dtype_id) for all 24 channels
CHANNEL_DEFS: List[Tuple[int, int]] = [
    (0,  DTYPE_F32),  # elevation
    (1,  DTYPE_U8),   # crust_type
    (2,  DTYPE_F32),  # temperature
    (3,  DTYPE_F32),  # precipitation
    (4,  DTYPE_U8),   # koppen_zone
    (5,  DTYPE_U8),   # soil_order
    (6,  DTYPE_U8),   # biome_class
    (7,  DTYPE_F32),  # veg_grass
    (8,  DTYPE_F32),  # veg_shrub
    (9,  DTYPE_F32),  # veg_tree
    (10, DTYPE_F32),  # veg_special
] + [(i, DTYPE_U8) for i in range(11, 24)]

CHANNEL_NAMES: Dict[int, str] = {
    0: 'elevation', 1: 'crust_type', 2: 'temperature', 3: 'precipitation',
    4: 'koppen_zone', 5: 'soil_order', 6: 'biome_class',
    7: 'veg_grass', 8: 'veg_shrub', 9: 'veg_tree', 10: 'veg_special',
}
for _i in range(11, 24):
    CHANNEL_NAMES[_i] = f'reserved_{_i}'

# Header struct: 41 bytes packed, padded to 256
_HDR_FMT  = '<4s fffff I B HH d'
_HDR_SIZE = struct.calcsize(_HDR_FMT)  # 41


# ── Writer ───────────────────────────────────────────────────────────────────

def write_geoforge(
    sim_result: Dict[str, Any],
    output_path: str,
    co2_ppm: float           = 400.0,
    radius_km: float         = 6371.0,
    axial_tilt_deg: float    = 23.5,
    rotation_period_h: float = 24.0,
    stellar_luminosity: float = 1.0,
    grid_level: int          = 6,
) -> str:
    """
    Serialize simulation results to a .geoforge file.

    Args:
        sim_result:   dict from sim_runner.simulate() — must contain 'cell_count'
        output_path:  destination path (parent dirs created automatically)
        ...           planet parameters written into the 256-byte header

    Returns:
        Absolute path of the written file.
    """
    cell_count = sim_result['cell_count']
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Map sim_result keys → channel arrays
    # Note: sim_runner uses 'koppen' (not 'koppen_zone')
    _src_map = {
        0: ('elevation',     np.float32),
        1: ('crust_type',    np.uint8),
        2: ('temperature',   np.float32),
        3: ('precipitation', np.float32),
        4: ('koppen',        np.uint8),
    }
    arrays: Dict[int, np.ndarray] = {}
    for ch_id, (key, dt) in _src_map.items():
        arrays[ch_id] = np.array(sim_result.get(key, []), dtype=dt)

    for ch_id, dtype_id in CHANNEL_DEFS:
        if ch_id not in arrays:
            arrays[ch_id] = np.zeros(cell_count, dtype=_NP_DTYPE[dtype_id])

    # LZ4-compress
    comp:         Dict[int, bytes] = {}
    uncomp_sizes: Dict[int, int]   = {}
    for ch_id in range(NUM_CHANNELS):
        blob           = arrays[ch_id].tobytes()
        comp[ch_id]    = lz4.frame.compress(blob)
        uncomp_sizes[ch_id] = len(blob)

    # Header (pad to 256 bytes)
    hdr_packed = struct.pack(
        _HDR_FMT,
        MAGIC,
        radius_km, axial_tilt_deg, rotation_period_h, stellar_luminosity, co2_ppm,
        cell_count, grid_level,
        0, 0,         # snapshot_count, level_count
        time.time(),
    )
    header = hdr_packed + b'\x00' * (HEADER_SIZE - _HDR_SIZE)

    # Channel index (24 × 20 bytes, padded to 512)
    data_start  = HEADER_SIZE + INDEX_SIZE
    index_buf   = bytearray(INDEX_SIZE)
    byte_offset = data_start
    for ch_id, dtype_id in CHANNEL_DEFS:
        entry = struct.pack(
            '<Q II B 3x',
            byte_offset, len(comp[ch_id]), uncomp_sizes[ch_id], dtype_id,
        )
        base = ch_id * INDEX_ENTRY_SIZE
        index_buf[base : base + INDEX_ENTRY_SIZE] = entry
        byte_offset += len(comp[ch_id])

    # Write to disk
    with open(path, 'wb') as f:
        f.write(header)
        f.write(bytes(index_buf))
        for ch_id in range(NUM_CHANNELS):
            f.write(comp[ch_id])

    return str(path.resolve())


# ── Reader ───────────────────────────────────────────────────────────────────

class GeoForgeFile:
    """
    Read a .geoforge file.

    Channels are decompressed on first access and cached in memory.

    Usage:
        gf = GeoForgeFile('planet.geoforge')
        elev = gf.get_channel(0)          # numpy array, f32
        tile  = gf.query_tile(-10, 10, -20, 20, grid_vertices)
    """

    def __init__(self, path: str):
        self._path = Path(path)
        # ch_id -> (byte_offset, comp_size, uncomp_size, dtype_id)
        self._index:  Dict[int, Tuple[int, int, int, int]] = {}
        self._cache:  Dict[int, np.ndarray] = {}

        # Public header fields
        self.cell_count:   int   = 0
        self.grid_level:   int   = 6
        self.co2_ppm:      float = 400.0
        self.radius_km:    float = 6371.0
        self.creation_time: float = 0.0

        self._parse()

    def _parse(self):
        with open(self._path, 'rb') as f:
            raw = f.read(HEADER_SIZE + INDEX_SIZE)

        # ── Header ──
        fields = struct.unpack_from(_HDR_FMT, raw, 0)
        magic, radius_km, _, _, _, co2_ppm, cell_count, grid_level, _, _, ts = fields
        if magic != MAGIC:
            raise ValueError(f'Not a .geoforge file (magic={magic!r})')

        self.radius_km     = radius_km
        self.co2_ppm       = co2_ppm
        self.cell_count    = cell_count
        self.grid_level    = grid_level
        self.creation_time = ts

        # ── Channel index ──
        for ch_id in range(NUM_CHANNELS):
            base = HEADER_SIZE + ch_id * INDEX_ENTRY_SIZE
            byte_offset, comp_size, uncomp_size, dtype_id = struct.unpack_from(
                '<Q II B', raw, base
            )
            self._index[ch_id] = (byte_offset, comp_size, uncomp_size, dtype_id)

    def get_channel(self, ch_id: int) -> np.ndarray:
        """Return the full numpy array for a channel (decompressed, cached)."""
        if ch_id in self._cache:
            return self._cache[ch_id]

        byte_offset, comp_size, uncomp_size, dtype_id = self._index[ch_id]
        with open(self._path, 'rb') as f:
            f.seek(byte_offset)
            blob = f.read(comp_size)

        raw_bytes = lz4.frame.decompress(blob)
        arr = np.frombuffer(raw_bytes, dtype=_NP_DTYPE[dtype_id]).copy()
        self._cache[ch_id] = arr
        return arr

    def get_channel_by_name(self, name: str) -> np.ndarray:
        for ch_id, n in CHANNEL_NAMES.items():
            if n == name:
                return self.get_channel(ch_id)
        raise KeyError(f'Unknown channel name: {name!r}')

    def query_tile(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
        grid_vertices: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Extract all channel data for cells within a lat/lon bounding box.

        Args:
            lat_min/max: latitude bounds in degrees (-90 to +90)
            lon_min/max: longitude bounds in degrees (-180 to +180)
            grid_vertices: (N, 3) unit-sphere xyz coords from GeodesicGrid._vertices

        Returns:
            Dict with 'cell_indices' plus one key per channel name.
        """
        indices = cells_in_bounds(grid_vertices, lat_min, lat_max, lon_min, lon_max)
        result: Dict[str, Any] = {'cell_indices': indices.tolist()}
        for ch_id in range(NUM_CHANNELS):
            arr = self.get_channel(ch_id)
            result[CHANNEL_NAMES[ch_id]] = arr[indices].tolist()
        return result


# ── Spatial utilities ────────────────────────────────────────────────────────

def cells_in_bounds(
    vertices: np.ndarray,
    lat_min: float,
    lat_max: float,
    lon_min: float,
    lon_max: float,
) -> np.ndarray:
    """
    Return indices of cells whose (lat, lon) fall within the bounding box.

    Args:
        vertices:        (N, 3) unit-sphere xyz
        lat_min/max:     degrees, -90 to +90
        lon_min/max:     degrees, -180 to +180

    Returns:
        1-D int array of matching cell indices.
    """
    z   = np.clip(vertices[:, 2], -1.0, 1.0)
    lat = np.degrees(np.arcsin(z))
    lon = np.degrees(np.arctan2(vertices[:, 1], vertices[:, 0]))

    lat_mask = (lat >= lat_min) & (lat <= lat_max)

    # Handle antimeridian wrap-around (e.g. lon_min=170, lon_max=-170)
    if lon_min <= lon_max:
        lon_mask = (lon >= lon_min) & (lon <= lon_max)
    else:
        lon_mask = (lon >= lon_min) | (lon <= lon_max)

    return np.where(lat_mask & lon_mask)[0]


def decode_texture(
    texture_b64: str,
    grid_vertices: np.ndarray,
) -> Tuple[List[int], List[int], List[int]]:
    """
    Decode a base64-encoded equirectangular PNG (exported by the Three.js globe)
    into continental, craton, and rift cell index lists.

    Color mapping (matches globe.js PALETTES):
      ocean        #1a5a8e  → (26,  90, 142)
      continental  #7a6040  → (122, 96,  64)
      craton       #c8a020  → (200,160,  32)
      rift         #d04020  → (208, 64,  32)

    Args:
        texture_b64:    base64-encoded PNG string (no data-URI prefix)
        grid_vertices:  (N, 3) unit-sphere xyz

    Returns:
        (continental_cells, craton_cells, rift_cells) — lists of int indices
    """
    import base64
    from io import BytesIO
    from PIL import Image

    img   = Image.open(BytesIO(base64.b64decode(texture_b64))).convert('RGB')
    W, H  = img.size
    pix   = np.array(img, dtype=np.int32)  # (H, W, 3)

    z   = np.clip(grid_vertices[:, 2], -1.0, 1.0)
    lat = np.degrees(np.arcsin(z))
    lon = np.degrees(np.arctan2(grid_vertices[:, 1], grid_vertices[:, 0]))

    px = np.clip(((lon + 180.0) / 360.0 * W).astype(int), 0, W - 1)
    py = np.clip(((90.0 - lat)  / 180.0 * H).astype(int), 0, H - 1)

    sampled = pix[py, px]  # (N, 3)

    # Target colors as (4, 3) array  [ocean, continental, craton, rift]
    targets = np.array([
        [26,  90,  142],   # ocean
        [122, 96,   64],   # continental
        [200, 160,  32],   # craton
        [208, 64,   32],   # rift
    ], dtype=np.int32)

    # Nearest colour per cell (squared L2 distance)
    diffs      = sampled[:, None, :] - targets[None, :, :]   # (N, 4, 3)
    dist_sq    = (diffs ** 2).sum(axis=2)                     # (N, 4)
    cell_types = dist_sq.argmin(axis=1)                       # (N,) values 0-3

    continental = np.where(cell_types == 1)[0].tolist()
    craton      = np.where(cell_types == 2)[0].tolist()
    rift        = np.where(cell_types == 3)[0].tolist()

    return continental, craton, rift
