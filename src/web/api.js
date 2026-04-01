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
     *   time_ma            float   simulation duration (Ma)
     *   seed               int     RNG seed
     *   co2_ppm            float   atmospheric CO2 (ppm)
     *   num_plates         int     number of tectonic plates
     *
     * @returns Promise<SimResult>  all channels as typed arrays
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

        return res.json();
    },

    /** Poll simulation progress. */
    async getStatus() {
        const res = await fetch('/api/status');
        if (!res.ok) return null;
        return res.json();
    },

    /**
     * Initialise a step-by-step simulation session.
     *
     * @param {object} params
     *   continental_cells  int[]        cell indices painted continental
     *   craton_cells       int[]        cell indices marked as cratons
     *   rift_edges         int[][]      pairs [[cell_a, cell_b], ...] forming rift lines
     *   seed               int          RNG seed
     *   co2_ppm            float        atmospheric CO2 (ppm)
     *   num_plates         int          number of tectonic plates
     *   grid_level         int          geodesic grid subdivision level
     *   timestep_ma        float        Ma per step
     *
     * @returns Promise<Snapshot>  initial state at t=0
     */
    async simInit(params) {
        const r = await fetch('/api/sim/init', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(params),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
        return r.json();
    },

    /**
     * Advance the active session by N timesteps.
     *
     * @param {number} steps  number of timesteps to advance (default 1)
     * @returns Promise<Snapshot>  state after advancing
     */
    async simStep(steps = 1) {
        const r = await fetch('/api/sim/step', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ steps }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
        return r.json();
    },

    /** Clear the active step-by-step session. */
    async simReset() {
        const r = await fetch('/api/sim/reset', { method: 'POST' });
        if (!r.ok) throw new Error(`Reset failed: ${r.status}`);
    },
};
