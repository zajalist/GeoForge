"""
server.py — GeoForge FastAPI development server.

Serves:
  - Static web files from ../web/
  - GET  /api/grid      → geodesic grid JSON (gzipped)
  - POST /api/simulate  → run tectonic + climate sim, return results
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
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

# Add grid module to path
_SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(_SCRIPT_DIR / '..' / 'grid'))

import sim_runner
import grid_export

# ============================================================================
# App setup
# ============================================================================

app = FastAPI(title='GeoForge API', version='1.0')

_WEB_DIR  = _SCRIPT_DIR / '..' / 'web'
_DATA_DIR = _WEB_DIR / 'data'
_GRID_LEVEL = 7

# ============================================================================
# Simulation state (one sim at a time)
# ============================================================================

_sim_state = {
    'running':      False,
    'current_time': 0.0,
    'max_time':     500.0,
    'result':       None,
    'error':        None,
}
_sim_lock = threading.Lock()

# Step-by-step session state
_session: dict = {
    'active':        False,
    'stepping':      False,  # True while a /api/sim/step call is executing
    'cells':         None,
    'plates':        None,
    'grid':          None,
    'current_time':  0.0,
    'co2_ppm':       400.0,
    'timestep_ma':   10.0,
    'last_rift_ma':  0.0,
}
_session_lock = threading.Lock()


# ============================================================================
# Grid endpoint
# ============================================================================

@app.get('/api/grid')
async def get_grid():
    """Return the level-6 geodesic grid as gzipped JSON."""
    gz_path = _DATA_DIR / f'grid_level{_GRID_LEVEL}.json.gz'
    json_path = _DATA_DIR / f'grid_level{_GRID_LEVEL}.json'

    # Generate on first request if missing
    if not gz_path.exists():
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        loop = asyncio.get_running_loop()
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

class SimInitRequest(BaseModel):
    continental_cells: List[int] = []
    craton_cells:      List[int] = []
    rift_edges:        List[List[int]] = []  # [[cell_a, cell_b], ...]
    seed:        int   = 42
    co2_ppm:     float = 400.0
    num_plates:  int   = 7
    grid_level:  int   = 7
    timestep_ma: float = 10.0


class SimStepRequest(BaseModel):
    steps: int = 1


class SimRequest(BaseModel):
    continental_cells: List[int] = []
    craton_cells:      List[int] = []
    rift_cells:        List[int] = []
    time_ma:    float = 500.0
    seed:       int   = 42
    co2_ppm:    float = 400.0
    num_plates: int   = 7
    grid_level: int   = 6


@app.post('/api/simulate')
async def simulate(req: SimRequest):
    """
    Start a tectonic simulation. Returns results synchronously
    (runs in thread pool to avoid blocking the event loop).
    For 500 Ma at level 6: expect ~15-30 seconds.
    """
    with _sim_lock:
        if _sim_state['running']:
            raise HTTPException(status_code=409, detail='Simulation already running')
        _sim_state['running'] = True
        _sim_state['current_time'] = 0.0
        _sim_state['max_time'] = req.time_ma
        _sim_state['result'] = None
        _sim_state['error'] = None

    def progress_cb(current, max_t):
        with _sim_lock:
            _sim_state['current_time'] = current

    def run():
        try:
            result = sim_runner.simulate(
                continental_cells=req.continental_cells,
                craton_cells=req.craton_cells,
                rift_cells=req.rift_cells,
                time_ma=req.time_ma,
                seed=req.seed,
                co2_ppm=req.co2_ppm,
                num_plates=req.num_plates,
                grid_level=req.grid_level,
                progress_cb=progress_cb,
            )
            with _sim_lock:
                _sim_state['result'] = result
        except Exception as e:
            with _sim_lock:
                _sim_state['error'] = str(e)
        finally:
            with _sim_lock:
                _sim_state['running'] = False

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, run)

    with _sim_lock:
        if _sim_state['error']:
            raise HTTPException(status_code=500, detail=_sim_state['error'])
        return JSONResponse(content=_sim_state['result'])


@app.get('/api/status')
async def get_status():
    """Return current simulation progress."""
    with _sim_lock:
        return {
            'running':      _sim_state['running'],
            'current_time': _sim_state['current_time'],
            'max_time':     _sim_state['max_time'],
            'progress':     (
                _sim_state['current_time'] / _sim_state['max_time']
                if _sim_state['max_time'] > 0 else 0.0
            ),
            'has_result': _sim_state['result'] is not None,
        }


@app.get('/api/health')
async def health():
    return {'status': 'ok', 'grid_level': _GRID_LEVEL}


# ============================================================================
# Step-by-step simulation endpoints
# ============================================================================

@app.post('/api/sim/init')
async def sim_init(req: SimInitRequest):
    """Initialise a step-by-step simulation session."""
    grid = sim_runner.get_grid(req.grid_level)

    cells, plates = sim_runner.initialize_cells(
        grid,
        continental_cells=req.continental_cells,
        craton_cells=req.craton_cells,
        rift_edges=req.rift_edges,
        num_plates=req.num_plates,
        seed=req.seed,
    )

    with _session_lock:
        _session['active']       = True
        _session['stepping']     = False
        _session['cells']        = cells
        _session['plates']       = plates
        _session['grid']         = grid
        _session['current_time'] = 0.0
        _session['co2_ppm']      = req.co2_ppm
        _session['timestep_ma']  = req.timestep_ma
        _session['last_rift_ma'] = 0.0

    snapshot = sim_runner.build_snapshot(cells, grid, req.co2_ppm, 0.0, [])
    return JSONResponse(content=snapshot)


@app.post('/api/sim/step')
async def sim_step(req: SimStepRequest):
    """Advance simulation by N timesteps."""
    with _session_lock:
        if not _session['active']:
            raise HTTPException(status_code=400, detail='No active session. Call /api/sim/init first.')
        if _session['stepping']:
            raise HTTPException(status_code=409, detail='Step already in progress.')
        _session['stepping'] = True
        cells      = _session['cells']
        plates     = _session['plates']
        grid       = _session['grid']
        co2_ppm    = _session['co2_ppm']
        dt         = _session['timestep_ma']
        t          = _session['current_time']
        last_rift  = _session['last_rift_ma']

    try:
        boundaries = []
        for _ in range(req.steps):
            boundaries, last_rift = sim_runner.step_once(
                cells, plates, grid, dt, t, last_rift)
            t += dt
    finally:
        with _session_lock:
            _session['current_time'] = t
            _session['last_rift_ma'] = last_rift
            _session['stepping'] = False

    snapshot = sim_runner.build_snapshot(cells, grid, co2_ppm, t, boundaries)
    return JSONResponse(content=snapshot)


@app.post('/api/sim/reset')
async def sim_reset():
    """Clear the active session."""
    with _session_lock:
        _session['active'] = False
        _session['cells']  = None
        _session['plates'] = None
        _session['grid']   = None
    return {'ok': True}


# ============================================================================
# Static file serving (must be last — catches all remaining routes)
# ============================================================================

# Pre-warm grid on startup
@app.on_event('startup')
async def startup():
    gz_path = _DATA_DIR / f'grid_level{_GRID_LEVEL}.json.gz'
    if not gz_path.exists():
        print(f'Pre-generating grid JSON (level {_GRID_LEVEL})...')
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: grid_export.export_grid(level=_GRID_LEVEL)
        )
        print('Grid ready.')
    # Pre-load grid singleton into sim_runner for fast first simulation
    sim_runner.get_grid(_GRID_LEVEL)
    print('Server ready. Open http://localhost:8000')


if _WEB_DIR.exists():
    app.mount('/', StaticFiles(directory=str(_WEB_DIR), html=True), name='static')
