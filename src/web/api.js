/**
 * api.js — GeoForge API client
 * Thin fetch wrappers for /api/grid, /api/simulate, /api/status
 */

const API = {

    /** Fetch the geodesic grid JSON from the server. */
    async getGrid() {
        const res = await fetch('/api/grid');
        if (!res.ok) throw new Error(`Grid fetch failed: ${res.status}`);
        return res.json();
    },

    /**
     * Run a tectonic + climate simulation.
     *
     * @param {object} params
     *   continental_cells  int[]   cell indices painted continental
     *   craton_cells       int[]   cell indices marked as cratons
     *   rift_cells         int[]   cell indices forming rift line
     *   texture_b64        string  optional base64 PNG from globe.exportPaintTexture()
     *   time_ma            float   simulation duration (Ma)
     *   seed               int     RNG seed
     *   co2_ppm            float   atmospheric CO2 (ppm)
     *   num_plates         int     number of tectonic plates
     *
     * @returns Promise<SimResult>  channels + geoforge_path
     */
    /**
     * Start simulation (returns immediately, 202).
     * Poll getStatus() until has_result, then call getResult().
     */
    async simulate(params) {
        const body = {
            continental_cells: params.continental_cells || [],
            craton_cells:      params.craton_cells      || [],
            rift_cells:        params.rift_cells        || [],
            time_ma:    params.time_ma    ?? 500,
            seed:       params.seed       ?? 42,
            co2_ppm:    params.co2_ppm    ?? 400,
            num_plates: params.num_plates ?? 7,
            grid_level: params.grid_level ?? 6,
        };
        if (params.texture_b64) body.texture_b64 = params.texture_b64;

        const res = await fetch('/api/simulate', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });

        if (res.status === 409) throw new Error('Simulation already running');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Simulate failed: ${res.status}`);
        }
        // 202 — sim started in background
    },

    /** Poll simulation progress. */
    async getStatus() {
        const res = await fetch('/api/status');
        if (!res.ok) return null;
        return res.json();
    },

    /** Fetch the completed simulation result (call after has_result=true). */
    async getResult() {
        const res = await fetch('/api/result');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Result fetch failed: ${res.status}`);
        }
        return res.json();
    },

    /**
     * Fetch channel data for all cells within a lat/lon bounding box.
     *
     * @param {object} params
     *   lat_min, lat_max  float  latitude bounds (degrees)
     *   lon_min, lon_max  float  longitude bounds (degrees)
     *   file              string optional path to .geoforge file
     *
     * @returns Promise<TileResult>  cell_indices + 24 channel arrays
     */
    async getTile({ lat_min, lat_max, lon_min, lon_max, file } = {}) {
        let url = `/api/tile?lat_min=${lat_min}&lat_max=${lat_max}&lon_min=${lon_min}&lon_max=${lon_max}`;
        if (file) url += `&file=${encodeURIComponent(file)}`;
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Tile fetch failed: ${res.status}`);
        }
        return res.json();
    },
};
