"""
grid_export.py — Export geodesic grid to JSON for Three.js consumption.

Produces src/web/data/grid_level{N}.json with vertices, faces, adjacency, and edges.
For level 6 (~40k cells): ~29 MB JSON, ~8 MB gzipped.
Cached: only regenerates if the output file is missing.

Usage:
    python grid_export.py              # level 6 (default)
    python grid_export.py --level 4   # smaller grid for dev/testing
"""

import sys
import os
import json
import gzip
import argparse
import time

# Locate the geodesic grid module
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_GRID_DIR = os.path.join(_SCRIPT_DIR, '..', 'grid')
sys.path.insert(0, _GRID_DIR)

from geodesic_grid import GeodesicGrid


def export_grid(level: int = 6, output_path: str = None, force: bool = False) -> str:
    """
    Build and export the geodesic grid to JSON.

    Args:
        level: Subdivision level (default 6 → 40,962 cells)
        output_path: Where to write the JSON. Defaults to
                     src/web/data/grid_level{level}.json
        force: Regenerate even if output already exists

    Returns:
        Path to the written JSON file
    """
    if output_path is None:
        data_dir = os.path.join(_SCRIPT_DIR, '..', 'web', 'data')
        os.makedirs(data_dir, exist_ok=True)
        output_path = os.path.join(data_dir, f'grid_level{level}.json')

    output_path = os.path.abspath(output_path)

    if not force and os.path.exists(output_path):
        print(f'Grid JSON already exists: {output_path}  (use --force to regenerate)')
        return output_path

    print(f'Building geodesic grid (level {level})...')
    t0 = time.time()
    grid = GeodesicGrid(level=level)
    t1 = time.time()
    print(f'  {grid.cell_count} cells built in {t1 - t0:.2f}s')

    # --- Vertices: list of [x, y, z] on unit sphere ---
    verts = grid._vertices.tolist()  # (N, 3) float64 → list of lists

    # --- Faces: triangular faces connecting adjacent cells ---
    # grid._faces is the raw subdivision face list: list of (a, b, c) tuples
    faces = [list(f) for f in grid._faces]

    # --- Adjacency: per-cell neighbour indices (sorted ascending) ---
    adjacency = grid._adjacency  # list of sorted int lists

    # Build unique edge list: [[cell_a, cell_b], ...] where cell_a < cell_b
    # Edges exported for rift edge tool in Three.js globe UI
    print('Building edge list...')
    edges_out = []
    for i, neighbors in enumerate(adjacency):
        for j in neighbors:
            if j > i:
                edges_out.append([i, j])

    payload = {
        'cell_count': grid.cell_count,
        'level': level,
        'vertices': verts,
        'faces': faces,
        'adjacency': adjacency,
        'edges': edges_out,
    }

    print(f'Writing {output_path}...')
    t2 = time.time()
    with open(output_path, 'w') as f:
        json.dump(payload, f, separators=(',', ':'))
    t3 = time.time()

    size_mb = os.path.getsize(output_path) / 1_048_576
    print(f'  Written: {size_mb:.1f} MB in {t3 - t2:.1f}s')

    # Write gzip version for fast serving
    gz_path = output_path + '.gz'
    with open(output_path, 'rb') as f_in, gzip.open(gz_path, 'wb') as f_out:
        f_out.write(f_in.read())
    gz_mb = os.path.getsize(gz_path) / 1_048_576
    print(f'  Gzipped: {gz_path} ({gz_mb:.1f} MB)')

    return output_path


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Export geodesic grid to JSON')
    parser.add_argument('--level', type=int, default=6)
    parser.add_argument('--force', action='store_true', help='Regenerate even if exists')
    args = parser.parse_args()
    export_grid(level=args.level, force=args.force)
    print('Done.')
