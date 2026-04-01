"""
server.py — GeoForge FastAPI development server.

Serves:
  - Static web files from ../web/
  - GET  /api/grid      → geodesic grid JSON (gzipped)
  - POST /api/simulate  → run sim, write .geoforge, return results + path
  - GET  /api/tile      → tile bounds → 24 channels from .geoforge
  - GET  /api/status    → simulation progress

Run with:
    uvicorn server:app --reload --port 8000
Then open: http://localhost:8000
"""

import os
import sys
import json
import gzip
import asyncio
import threading
import time
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

# Add grid module to path
_SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(_SCRIPT_DIR / '..' / 'grid'))

import sim_runner
import grid_export
from geoforge import write_geoforge, GeoForgeFile, cells_in_bounds, decode_texture

# ============================================================================
# App setup
# ============================================================================

app = FastAPI(title='GeoForge API', version='1.0')

_WEB_DIR       = _SCRIPT_DIR / '..' / 'web'
_DATA_DIR      = _WEB_DIR / 'data'
_GEOFORGE_DIR  = _DATA_DIR / 'geoforge'
_GRID_LEVEL    = 3   # level 3 = 642 cells (fast); level 6 = 40,962 (production)

# ============================================================================
# Simulation state (one sim at a time)
# ============================================================================

_sim_state = {
    'running':       False,
    'current_time':  0.0,
    'max_time':      500.0,
    'result':        None,
    'error':         None,
    'geoforge_path': None,   # path of last written .geoforge file
}
_sim_lock = threading.Lock()


# ============================================================================
# Grid endpoint
# ============================================================================

@app.get('/api/grid')
async def get_grid():
    """Return the level-6 geodesic grid as gzipped JSON."""
    gz_path   = _DATA_DIR / f'grid_level{_GRID_LEVEL}.json.gz'
    json_path = _DATA_DIR / f'grid_level{_GRID_LEVEL}.json'

    if not gz_path.exists():
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: grid_export.export_grid(level=_GRID_LEVEL)
        )

    if gz_path.exists():
        with open(gz_path, 'rb') as f:
            data = f.read()
        return Response(
            content=data,
            media_type='application/json',
            headers={
                'Content-Encoding': 'gzip',
                'Cache-Control': 'public, max-age=86400',
            }
        )
    elif json_path.exists():
        with open(json_path, 'rb') as f:
            data = f.read()
        return Response(content=data, media_type='application/json')

    raise HTTPException(status_code=500, detail='Grid data not found')


# ============================================================================
# Simulation endpoints
# ============================================================================

class SimRequest(BaseModel):
    # Cell index arrays (from globe paint state)
    continental_cells: List[int] = []
    craton_cells:      List[int] = []
    rift_cells:        List[int] = []
    # Optional: base64 PNG exported by globe.exportPaintTexture()
    # If provided and cell arrays are empty, decoded to cell indices.
    texture_b64: Optional[str] = None
    # Planet parameters — defaults tuned for fast testing
    time_ma:    float = 50.0
    seed:       int   = 42
    co2_ppm:    float = 400.0
    num_plates: int   = 7
    grid_level: int   = 3


@app.post('/api/simulate', status_code=202, response_model=None)
async def simulate(req: SimRequest):
    """
    Start a tectonic + climate simulation in the background.

    Returns 202 immediately. Poll GET /api/status for progress.
    Fetch the result from GET /api/result when has_result=true.
    """
    with _sim_lock:
        if _sim_state['running']:
            raise HTTPException(status_code=409, detail='Simulation already running')
        _sim_state['running']       = True
        _sim_state['current_time']  = 0.0
        _sim_state['max_time']      = req.time_ma
        _sim_state['result']        = None
        _sim_state['error']         = None
        _sim_state['geoforge_path'] = None

    def progress_cb(current, max_t):
        with _sim_lock:
            _sim_state['current_time'] = current

    def run():
        try:
            cont_cells = list(req.continental_cells)
            crat_cells = list(req.craton_cells)
            rift_cells = list(req.rift_cells)

            if not cont_cells and not crat_cells and req.texture_b64:
                grid = sim_runner.get_grid(req.grid_level)
                cont_cells, crat_cells, rift_cells = decode_texture(
                    req.texture_b64, grid._vertices
                )

            result = sim_runner.simulate(
                continental_cells=cont_cells,
                craton_cells=crat_cells,
                rift_cells=rift_cells,
                time_ma=req.time_ma,
                seed=req.seed,
                co2_ppm=req.co2_ppm,
                num_plates=req.num_plates,
                grid_level=req.grid_level,
                progress_cb=progress_cb,
            )

            _GEOFORGE_DIR.mkdir(parents=True, exist_ok=True)
            fname   = f'planet_{int(time.time())}.geoforge'
            gf_path = write_geoforge(
                result,
                str(_GEOFORGE_DIR / fname),
                co2_ppm=req.co2_ppm,
                grid_level=req.grid_level,
            )
            result['geoforge_path'] = gf_path

            with _sim_lock:
                _sim_state['result']        = result
                _sim_state['geoforge_path'] = gf_path

        except Exception as e:
            with _sim_lock:
                _sim_state['error'] = str(e)
        finally:
            with _sim_lock:
                _sim_state['running'] = False

    # Fire and forget — don't await
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, run)

    return {'status': 'started', 'time_ma': req.time_ma}


@app.get('/api/result', response_model=None)
async def get_result():
    """
    Return simulation result once complete.
    Returns summary stats + geoforge_path (not raw arrays).
    Use /api/tile to extract channel data for a specific region.
    """
    with _sim_lock:
        if _sim_state['running']:
            raise HTTPException(status_code=425, detail='Simulation still running')
        if _sim_state['error']:
            raise HTTPException(status_code=500, detail=_sim_state['error'])
        if _sim_state['result'] is None:
            raise HTTPException(status_code=404, detail='No result yet — run /simulate first')
        r = _sim_state['result']

    import numpy as np
    elev = np.array(r['elevation'], dtype=np.float32)
    temp = np.array(r['temperature'], dtype=np.float32)
    prec = np.array(r['precipitation'], dtype=np.float32)

    return {
        'geoforge_path': r['geoforge_path'],
        'cell_count':    r['cell_count'],
        'elevation':     r['elevation'],     # kept for globe colorization
        'crust_type':    r['crust_type'],
        'temperature':   r['temperature'],
        'precipitation': r['precipitation'],
        'koppen':        r['koppen'],
        'plate_id':      r['plate_id'],
        'orogeny_type':  r['orogeny_type'],
        'stats': {
            'elev_min':  float(elev.min()),
            'elev_max':  float(elev.max()),
            'elev_mean': float(elev.mean()),
            'temp_min':  float(temp.min()),
            'temp_max':  float(temp.max()),
            'prec_min':  float(prec.min()),
            'prec_max':  float(prec.max()),
        },
    }


@app.get('/api/status')
async def get_status():
    """Return current simulation progress."""
    with _sim_lock:
        return {
            'running':       _sim_state['running'],
            'current_time':  _sim_state['current_time'],
            'max_time':      _sim_state['max_time'],
            'progress':      (
                _sim_state['current_time'] / _sim_state['max_time']
                if _sim_state['max_time'] > 0 else 0.0
            ),
            'has_result':    _sim_state['result'] is not None,
            'error':         _sim_state['error'],
            'geoforge_path': _sim_state['geoforge_path'],
        }


# ============================================================================
# Tile endpoint  (#32 / #33)
# ============================================================================

@app.get('/api/tile', response_model=None)
async def get_tile(
    lat_min: float = Query(..., description='South latitude  (-90 to +90)'),
    lat_max: float = Query(..., description='North latitude  (-90 to +90)'),
    lon_min: float = Query(..., description='West longitude  (-180 to +180)'),
    lon_max: float = Query(..., description='East longitude  (-180 to +180)'),
    file:    Optional[str] = Query(None, description='Path to .geoforge file; defaults to latest sim'),
):
    """
    Extract 24 channels for all cells within a lat/lon bounding box.

    Query params:
        lat_min, lat_max, lon_min, lon_max — bounding box in degrees
        file — optional path to a specific .geoforge file

    Returns JSON with 'cell_indices' + one array per channel name.
    """
    # Resolve file path
    gf_path = file
    if not gf_path:
        with _sim_lock:
            gf_path = _sim_state['geoforge_path']
    if not gf_path:
        raise HTTPException(status_code=404, detail='No .geoforge file available; run /simulate first')

    if not Path(gf_path).exists():
        raise HTTPException(status_code=404, detail=f'.geoforge file not found: {gf_path}')

    def read_tile():
        gf   = GeoForgeFile(gf_path)
        grid = sim_runner.get_grid(gf.grid_level)
        return gf.query_tile(lat_min, lat_max, lon_min, lon_max, grid._vertices)

    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, read_tile)

    if not result['cell_indices']:
        raise HTTPException(status_code=404, detail='No cells found in the specified bounds')

    return JSONResponse(content=result)


@app.get('/api/health')
async def health():
    return {'status': 'ok', 'grid_level': _GRID_LEVEL}


# ============================================================================
# Static file serving (must be last — catches all remaining routes)
# ============================================================================

@app.on_event('startup')
async def startup():
    gz_path = _DATA_DIR / f'grid_level{_GRID_LEVEL}.json.gz'
    if not gz_path.exists():
        print(f'Pre-generating grid JSON (level {_GRID_LEVEL})...')
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: grid_export.export_grid(level=_GRID_LEVEL)
        )
        print('Grid ready.')
    sim_runner.get_grid(_GRID_LEVEL)
    print('Server ready. Open http://localhost:8000')


if _WEB_DIR.exists():
    app.mount('/', StaticFiles(directory=str(_WEB_DIR), html=True), name='static')
