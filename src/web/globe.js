/**
 * globe.js — Three.js geodesic globe renderer
 *
 * Renders the 40,962-cell geodesic icosphere. Supports:
 *   - Per-cell coloring (crust type, elevation, temperature, precipitation, Köppen, plates)
 *   - Interactive cell painting with adjustable brush radius
 *   - Raycaster-based cell picking
 *   - OrbitControls for globe rotation/zoom
 *   - Wireframe overlay toggle
 */

'use strict';

// ============================================================================
// Color utilities
// ============================================================================

const Color = {
    // Lerp between two [r,g,b] triples (0-1 range)
    lerp(a, b, t) {
        t = Math.max(0, Math.min(1, t));
        return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
    },

    // Multi-stop gradient: stops = [[value, [r,g,b]], ...]
    gradient(stops, value) {
        if (value <= stops[0][0]) return stops[0][1];
        if (value >= stops[stops.length-1][0]) return stops[stops.length-1][1];
        for (let i = 1; i < stops.length; i++) {
            if (value <= stops[i][0]) {
                const t = (value - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
                return this.lerp(stops[i-1][1], stops[i][1], t);
            }
        }
        return stops[stops.length-1][1];
    },

    hex(h) {
        const v = parseInt(h.replace('#',''), 16);
        return [(v>>16&255)/255, (v>>8&255)/255, (v&255)/255];
    },
};

// Colour palettes per display mode
const PALETTES = {
    // Crust/paint mode colours
    OCEAN:       Color.hex('#1a5a8e'),
    CONTINENTAL: Color.hex('#7a6040'),
    CRATON:      Color.hex('#c8a020'),
    RIFT:        Color.hex('#d04020'),

    elevation(v) {
        return Color.gradient([
            [-8000, Color.hex('#08203a')],
            [-4000, Color.hex('#0a3a6a')],
            [-1000, Color.hex('#1a6a9e')],
            [   -1, Color.hex('#2090c0')],
            [    0, Color.hex('#c0b090')],  // shoreline
            [  500, Color.hex('#80a050')],
            [ 1500, Color.hex('#6a7a40')],
            [ 3000, Color.hex('#7a6040')],
            [ 5000, Color.hex('#d0c0b0')],
            [ 7000, Color.hex('#ffffff')],
        ], v);
    },

    temperature(v) {
        return Color.gradient([
            [-50, Color.hex('#1a00a0')],
            [-20, Color.hex('#2060e0')],
            [  0, Color.hex('#40a0e0')],
            [ 10, Color.hex('#60d060')],
            [ 20, Color.hex('#e0e040')],
            [ 30, Color.hex('#e06020')],
            [ 45, Color.hex('#8a0000')],
        ], v);
    },

    precipitation(v) {
        return Color.gradient([
            [   0, Color.hex('#e8c080')],
            [ 200, Color.hex('#c0d080')],
            [ 600, Color.hex('#60c060')],
            [1200, Color.hex('#20a080')],
            [2000, Color.hex('#1080c0')],
            [3000, Color.hex('#0050a0')],
            [5000, Color.hex('#002060')],
        ], v);
    },

    koppen(k) {
        // 1=A(tropical) 2=B(arid) 3=C(temperate) 4=D(continental) 5=E(polar)
        const MAP = {
            1: Color.hex('#2ea860'),
            2: Color.hex('#e8b840'),
            3: Color.hex('#78c838'),
            4: Color.hex('#4888c8'),
            5: Color.hex('#b8d8f0'),
        };
        return MAP[k] || Color.hex('#888888');
    },

    plate(id, maxId) {
        // Hue spread across 360° for distinct plate colours
        const hue = ((id * 137.508) % 360) / 360; // golden angle
        // HSL to RGB (s=0.7, l=0.45)
        const s = 0.7, l = 0.45;
        const c = (1 - Math.abs(2*l - 1)) * s;
        const x = c * (1 - Math.abs((hue*6) % 2 - 1));
        const m = l - c/2;
        let r=0,g=0,b=0;
        const h6 = hue * 6;
        if (h6<1){r=c;g=x;}else if(h6<2){r=x;g=c;}else if(h6<3){g=c;b=x;}
        else if(h6<4){g=x;b=c;}else if(h6<5){r=x;b=c;}else{r=c;b=x;}
        return [r+m, g+m, b+m];
    },
};


// ============================================================================
// GeodesicGlobe
// ============================================================================

class GeodesicGlobe {
    constructor(container) {
        this._container = container;
        this._scene     = null;
        this._camera    = null;
        this._renderer  = null;
        this._controls  = null;
        this._mesh      = null;       // main sphere mesh
        this._wireMesh  = null;       // wireframe overlay
        this._raycaster = new THREE.Raycaster();
        this._mouse     = new THREE.Vector2();

        // Grid data
        this._grid      = null;       // {cell_count, vertices, faces, adjacency}
        this._N         = 0;

        // Paint state — typed arrays tracking user-painted cell types
        // 0=ocean 1=continental 2=craton 3=rift
        this._paintState = null;

        // Simulation result channels
        this._simResult  = null;

        // Display mode: 'crust'|'elevation'|'temperature'|'precipitation'|'koppen'|'plates'
        this._colorMode  = 'crust';

        // Brush radius in adjacency hops (0=single cell, 1=1 ring, 2=2 rings)
        this._brushRadius = 1;

        // Current paint tool: 'ocean'|'continental'|'craton'|'rift'|'orbit'
        this._tool = 'continental';

        // Whether mouse is pressed (for drag-paint)
        this._mouseDown   = false;
        this._lastPainted = -1;       // avoid re-painting same cell per frame

        // Wireframe visibility
        this._wireVisible = false;

        // Rift edges: Set of 'minIdx_maxIdx' strings; rendered as red lines
        this._riftEdges    = new Set();
        this._riftLineMesh = null;    // THREE.LineSegments (red)
        this._hoverLineMesh = null;   // THREE.LineSegments (yellow highlight)
        this._hoveredEdge  = null;    // {cell_a, cell_b} | null

        // Edge-by-cell lookup: cellIdx → [{cell_a, cell_b}, ...]
        this._edgesByCell  = null;

        // Callbacks
        this.onCellHover = null;  // (cellIdx, lat, lon) => void
        this.onPaintChanged = null; // () => void
        this.onContiguityError = null; // (msg: string) => void

        this._errorTimer = null;

        this._init();
    }

    // ── Initialisation ──────────────────────────────────────────────────────

    _init() {
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;

        // Scene
        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(0x080810);

        // Camera
        this._camera = new THREE.PerspectiveCamera(45, w/h, 0.01, 100);
        this._camera.position.set(0, 0, 2.8);

        // Renderer
        this._renderer = new THREE.WebGLRenderer({ antialias: true });
        this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this._renderer.setSize(w, h);
        this._container.appendChild(this._renderer.domElement);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(3, 2, 2);
        this._scene.add(ambient, dir);

        // OrbitControls
        this._controls = new THREE.OrbitControls(this._camera, this._renderer.domElement);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;
        this._controls.minDistance = 1.2;
        this._controls.maxDistance = 8;

        // Event listeners
        const canvas = this._renderer.domElement;
        canvas.addEventListener('mousemove',  e => this._onMouseMove(e));
        canvas.addEventListener('mousedown',  e => this._onMouseDown(e));
        canvas.addEventListener('mouseup',    e => this._onMouseUp(e));
        canvas.addEventListener('mouseleave', e => this._mouseDown = false);

        window.addEventListener('resize', () => this._onResize());

        // Render loop
        this._animate();
    }

    // ── Grid loading ─────────────────────────────────────────────────────────

    async loadGrid() {
        const grid = await API.getGrid();
        this._grid = grid;
        this._N    = grid.cell_count;

        // Build Three.js geometry
        this._buildGeometry(grid);

        // Init paint state: 0 = ocean for all cells
        this._paintState = new Uint8Array(this._N);

        // Apply initial colouring
        this._refreshColors();

        return grid;
    }

    _buildGeometry(grid) {
        const N = grid.cell_count;
        const verts = grid.vertices;   // [[x,y,z], ...]
        const faces = grid.faces;      // [[a,b,c], ...]

        // --- Positions ---
        const positions = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            positions[i*3]   = verts[i][0];
            positions[i*3+1] = verts[i][1];
            positions[i*3+2] = verts[i][2];
        }

        // --- Indices ---
        const F = faces.length;
        const indices = new Uint32Array(F * 3);
        for (let f = 0; f < F; f++) {
            indices[f*3]   = faces[f][0];
            indices[f*3+1] = faces[f][1];
            indices[f*3+2] = faces[f][2];
        }

        // --- Per-vertex colours (will be updated by _refreshColors) ---
        const colors = new Float32Array(N * 3);

        // Main geometry
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
        geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.computeVertexNormals();

        const mat = new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.FrontSide,
        });

        this._mesh = new THREE.Mesh(geo, mat);
        this._scene.add(this._mesh);

        // --- Wireframe overlay (hidden by default) ---
        const wireMat = new THREE.LineBasicMaterial({
            color: 0x334455,
            transparent: true,
            opacity: 0.3,
        });
        const wireGeo = new THREE.WireframeGeometry(geo);
        this._wireMesh = new THREE.LineSegments(wireGeo, wireMat);
        this._wireMesh.visible = this._wireVisible;
        this._scene.add(this._wireMesh);

        // Store face→cell mapping for fast picking
        // For face f, the 3 vertices are cells a,b,c
        this._faceCells = faces;  // direct reference

        // --- Edge-by-cell lookup (for rift edge picking) ---
        this._edgesByCell = new Array(N).fill(null).map(() => []);
        if (grid.edges) {
            for (const [a, b] of grid.edges) {
                this._edgesByCell[a].push({ cell_a: a, cell_b: b });
                this._edgesByCell[b].push({ cell_a: a, cell_b: b });
            }
        }

        // --- Rift edge LineSegments (initially empty, red) ---
        const riftGeo = new THREE.BufferGeometry();
        riftGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
        const riftMat = new THREE.LineBasicMaterial({ color: 0xff2200 });
        this._riftLineMesh = new THREE.LineSegments(riftGeo, riftMat);
        this._scene.add(this._riftLineMesh);

        // --- Hover edge highlight (single line, yellow) ---
        const hoverPos = new Float32Array(6);
        const hoverGeo = new THREE.BufferGeometry();
        hoverGeo.setAttribute('position', new THREE.BufferAttribute(hoverPos, 3));
        const hoverMat = new THREE.LineBasicMaterial({ color: 0xffee00 });
        this._hoverLineMesh = new THREE.LineSegments(hoverGeo, hoverMat);
        this._hoverLineMesh.visible = false;
        this._scene.add(this._hoverLineMesh);
    }

    // ── Rift edge helpers ────────────────────────────────────────────────────

    _refreshRiftLines() {
        if (!this._riftLineMesh || !this._grid) return;
        const verts = this._grid.vertices;
        const SCALE = 1.003;

        const pts = new Float32Array(this._riftEdges.size * 6);
        let i = 0;
        for (const key of this._riftEdges) {
            const [a, b] = key.split('_').map(Number);
            const va = verts[a], vb = verts[b];
            pts[i++] = va[0]*SCALE; pts[i++] = va[1]*SCALE; pts[i++] = va[2]*SCALE;
            pts[i++] = vb[0]*SCALE; pts[i++] = vb[1]*SCALE; pts[i++] = vb[2]*SCALE;
        }

        this._riftLineMesh.geometry.setAttribute(
            'position', new THREE.BufferAttribute(pts, 3));
        this._riftLineMesh.geometry.attributes.position.needsUpdate = true;
        this._riftLineMesh.geometry.setDrawRange(0, this._riftEdges.size * 2);
    }

    _pickEdge(event) {
        if (!this._edgesByCell || !this._mesh) return null;

        // Step 1: find hovered cell
        const cellIdx = this._pickCell(event);
        if (cellIdx < 0) return null;

        // Step 2: gather edges of this cell and its immediate neighbors
        const candidates = [...(this._edgesByCell[cellIdx] || [])];
        for (const nb of this._grid.adjacency[cellIdx]) {
            for (const edge of (this._edgesByCell[nb] || [])) {
                candidates.push(edge);
            }
        }
        if (!candidates.length) return null;

        // Step 3: cast ray and find closest edge midpoint
        const rect = this._renderer.domElement.getBoundingClientRect();
        const mx   = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
        const my   = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
        this._raycaster.setFromCamera(new THREE.Vector2(mx, my), this._camera);
        const ray = this._raycaster.ray;

        const verts = this._grid.vertices;
        let bestEdge = null, bestDist = Infinity;

        for (const { cell_a, cell_b } of candidates) {
            const va = verts[cell_a], vb = verts[cell_b];
            const mid = new THREE.Vector3(
                (va[0]+vb[0])/2, (va[1]+vb[1])/2, (va[2]+vb[2])/2);
            const d = ray.distanceToPoint(mid);
            if (d < bestDist) { bestDist = d; bestEdge = { cell_a, cell_b }; }
        }

        return bestDist < 0.04 ? bestEdge : null;
    }

    _toggleRiftEdge({ cell_a, cell_b }) {
        const a = Math.min(cell_a, cell_b);
        const b = Math.max(cell_a, cell_b);
        const key = `${a}_${b}`;
        if (this._riftEdges.has(key)) {
            this._riftEdges.delete(key);
        } else {
            this._riftEdges.add(key);
        }
        this._refreshRiftLines();
        if (this.onPaintChanged) this.onPaintChanged();
    }

    getRiftEdges() {
        return Array.from(this._riftEdges).map(k => k.split('_').map(Number));
    }

    // ── Colour refresh ───────────────────────────────────────────────────────

    _refreshColors() {
        if (!this._mesh) return;
        const buf  = this._mesh.geometry.attributes.color;
        const data = buf.array;
        const N    = this._N;

        const mode   = this._colorMode;
        const paint  = this._paintState;
        const result = this._simResult;

        for (let i = 0; i < N; i++) {
            let c;

            if (mode === 'crust') {
                const ptype = paint[i];
                if (ptype === 2)      c = PALETTES.CRATON;
                else if (ptype === 3) c = PALETTES.RIFT;
                else if (ptype === 1) c = PALETTES.CONTINENTAL;
                else                  c = PALETTES.OCEAN;

            } else if (mode === 'elevation' && result) {
                c = PALETTES.elevation(result.elevation[i]);
            } else if (mode === 'temperature' && result) {
                c = PALETTES.temperature(result.temperature[i]);
            } else if (mode === 'precipitation' && result) {
                c = PALETTES.precipitation(result.precipitation[i]);
            } else if (mode === 'koppen' && result) {
                c = PALETTES.koppen(result.koppen[i]);
            } else if (mode === 'plates' && result) {
                c = PALETTES.plate(result.plate_id[i], 20);
            } else {
                // Fallback to crust
                const ptype = paint[i];
                if (ptype === 2)      c = PALETTES.CRATON;
                else if (ptype === 3) c = PALETTES.RIFT;
                else if (ptype === 1) c = PALETTES.CONTINENTAL;
                else                  c = PALETTES.OCEAN;
            }

            data[i*3]   = c[0];
            data[i*3+1] = c[1];
            data[i*3+2] = c[2];
        }

        buf.needsUpdate = true;
    }

    // ── Contiguity helpers ────────────────────────────────────────────────────

    _hasContinentalCells() {
        if (!this._paintState) return false;
        for (let i = 0; i < this._N; i++) {
            if (this._paintState[i] === 1 || this._paintState[i] === 2) return true;
        }
        return false;
    }

    _isAdjacentToContinent(cellIdx) {
        if (!this._paintState || !this._grid) return false;
        // The cell itself counts as adjacent (allows re-painting)
        if (this._paintState[cellIdx] === 1 || this._paintState[cellIdx] === 2) return true;
        // Any neighbor that is continental/craton counts
        for (const nb of this._grid.adjacency[cellIdx]) {
            if (this._paintState[nb] === 1 || this._paintState[nb] === 2) return true;
        }
        return false;
    }

    _countCratonRegions() {
        if (!this._paintState) return 0;
        const visited = new Set();
        let regions = 0;
        for (let start = 0; start < this._N; start++) {
            if (this._paintState[start] !== 2) continue;
            if (visited.has(start)) continue;
            regions++;
            const q = [start];
            visited.add(start);
            while (q.length) {
                const cur = q.pop();
                for (const nb of this._grid.adjacency[cur]) {
                    if (!visited.has(nb) && this._paintState[nb] === 2) {
                        visited.add(nb);
                        q.push(nb);
                    }
                }
            }
        }
        return regions;
    }

    // ── Cell painting ────────────────────────────────────────────────────────

    paintCell(cellIdx, toolType) {
        if (!this._paintState || cellIdx < 0 || cellIdx >= this._N) return;
        if (toolType === 'rift') return;  // rift is edge-based, not cell-based

        // Contiguity enforcement: new continental/craton cells must be adjacent to existing land
        if ((toolType === 'continental' || toolType === 'craton') && this._hasContinentalCells()) {
            // Check all cells in the brush radius — reject if none is adjacent
            const affected = this._getCellsInRadius(cellIdx, this._brushRadius);
            const anyAdjacent = affected.some(idx => this._isAdjacentToContinent(idx));
            if (!anyAdjacent) {
                if (this.onContiguityError) {
                    this.onContiguityError(
                        'Continental cells must be contiguous — paint adjacent to existing land.');
                }
                return;
            }
        }

        const typeMap = { ocean: 0, continental: 1, craton: 2 };
        const typeVal = typeMap[toolType] ?? 1;

        // Paint with brush radius
        const affected = this._getCellsInRadius(cellIdx, this._brushRadius);
        let changed = false;
        for (const idx of affected) {
            if (this._paintState[idx] !== typeVal) {
                this._paintState[idx] = typeVal;
                changed = true;
            }
        }

        if (changed) {
            this._refreshColors();
            if (this.onPaintChanged) this.onPaintChanged();
        }
    }

    _getCellsInRadius(startCell, hops) {
        if (hops === 0) return [startCell];
        const visited = new Set([startCell]);
        let frontier = [startCell];
        for (let h = 0; h < hops; h++) {
            const next = [];
            for (const c of frontier) {
                for (const nb of this._grid.adjacency[c]) {
                    if (!visited.has(nb)) {
                        visited.add(nb);
                        next.push(nb);
                    }
                }
            }
            frontier = next;
        }
        return Array.from(visited);
    }

    clearPaint() {
        if (!this._paintState) return;
        this._paintState.fill(0);
        this._refreshColors();
        if (this.onPaintChanged) this.onPaintChanged();
    }

    // ── Apply simulation result ───────────────────────────────────────────────

    applySimResult(result) {
        this._simResult = result;
        // Update paint state from simulation's crust_type so crust mode
        // shows the evolved state
        if (result.crust_type) {
            for (let i = 0; i < this._N; i++) {
                if (this._paintState[i] !== 2 && this._paintState[i] !== 3) {
                    this._paintState[i] = result.crust_type[i] === 1 ? 1 : 0;
                }
            }
        }
        this._refreshColors();
    }

    // ── Mode / tool setters ──────────────────────────────────────────────────

    setTool(tool) {
        this._tool = tool;
        const isOrbit = tool === 'orbit';
        this._controls.enabled = isOrbit;
        this._container.classList.toggle('orbit-mode', isOrbit);
    }

    setColorMode(mode) {
        this._colorMode = mode;
        this._refreshColors();
    }

    setBrushRadius(r) {
        this._brushRadius = Math.max(0, Math.min(4, r));
    }

    toggleWireframe() {
        this._wireVisible = !this._wireVisible;
        if (this._wireMesh) this._wireMesh.visible = this._wireVisible;
        return this._wireVisible;
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    getPaintedCells(type) {
        if (type === 'rift') return [];  // rift is now edge-based; use getRiftEdges()
        if (!this._paintState) return [];
        const typeMap = { ocean: 0, continental: 1, craton: 2 };
        const v = typeMap[type];
        if (v === undefined) return [];
        const result = [];
        for (let i = 0; i < this._N; i++) {
            if (this._paintState[i] === v) result.push(i);
        }
        return result;
    }

    getPaintStats() {
        if (!this._paintState) return { ocean: 0, continental: 0, craton: 0, craton_regions: 0, rift: 0, total: 0 };
        let ocean=0, cont=0, craton=0;
        for (let i = 0; i < this._N; i++) {
            const v = this._paintState[i];
            if (v===0) ocean++;
            else if (v===1) cont++;
            else if (v===2) craton++;
        }
        return {
            ocean, continental: cont, craton,
            craton_regions: this._countCratonRegions(),
            rift: this._riftEdges ? this._riftEdges.size : 0,
            total: this._N
        };
    }

    getBrushRadius()  { return this._brushRadius; }
    getColorMode()    { return this._colorMode; }
    getTool()         { return this._tool; }
    isLoaded()        { return this._grid !== null; }
    hasSimResult()    { return this._simResult !== null; }

    // ── Cell picking ─────────────────────────────────────────────────────────

    _pickCell(event) {
        if (!this._mesh) return -1;

        const rect = this._renderer.domElement.getBoundingClientRect();
        this._mouse.x = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
        this._mouse.y =-((event.clientY - rect.top)  / rect.height) * 2 + 1;

        this._raycaster.setFromCamera(this._mouse, this._camera);
        const hits = this._raycaster.intersectObject(this._mesh);
        if (!hits.length) return -1;

        const hit = hits[0];
        // hit.face.a/b/c are the 3 vertex (= cell) indices of the hit triangle
        // Find which of the 3 is closest to the actual hit point
        const { a, b, c } = hit.face;
        const pos = hit.point.clone().normalize(); // unit sphere

        const verts = this._grid.vertices;
        const d = (i) => {
            const vx = verts[i][0]-pos.x, vy = verts[i][1]-pos.y, vz = verts[i][2]-pos.z;
            return vx*vx + vy*vy + vz*vz;
        };
        const dists = [[d(a),a],[d(b),b],[d(c),c]];
        dists.sort((x,y) => x[0]-y[0]);
        return dists[0][1];
    }

    // ── Event handlers ───────────────────────────────────────────────────────

    _onMouseMove(e) {
        if (this._tool === 'orbit') return;

        const cellIdx = this._pickCell(e);
        if (cellIdx >= 0) {
            // Hover tooltip callback
            if (this.onCellHover) {
                const v = this._grid.vertices[cellIdx];
                const z = Math.max(-1, Math.min(1, v[2]));
                const lat = Math.degrees
                    ? Math.degrees(Math.asin(z))
                    : Math.asin(z) * (180 / Math.PI);
                const lon = Math.atan2(v[1], v[0]) * (180 / Math.PI);
                this.onCellHover(cellIdx, lat, lon);
            }

            // Drag-paint
            if (this._mouseDown && cellIdx !== this._lastPainted) {
                this._lastPainted = cellIdx;
                this.paintCell(cellIdx, this._tool);
            }
        }

        // Rift edge hover highlight
        if (this._tool === 'rift') {
            const edge = this._pickEdge(e);
            this._hoveredEdge = edge;
            if (edge && this._hoverLineMesh) {
                const verts = this._grid.vertices;
                const SCALE = 1.003;
                const va = verts[edge.cell_a], vb = verts[edge.cell_b];
                const pos = this._hoverLineMesh.geometry.attributes.position;
                pos.array[0] = va[0]*SCALE; pos.array[1] = va[1]*SCALE; pos.array[2] = va[2]*SCALE;
                pos.array[3] = vb[0]*SCALE; pos.array[4] = vb[1]*SCALE; pos.array[5] = vb[2]*SCALE;
                pos.needsUpdate = true;
                this._hoverLineMesh.visible = true;
            } else if (this._hoverLineMesh) {
                this._hoverLineMesh.visible = false;
            }
        }
    }

    _onMouseDown(e) {
        if (e.button !== 0 || this._tool === 'orbit') return;
        e.preventDefault();
        this._mouseDown = true;
        this._lastPainted = -1;

        if (this._tool === 'rift') {
            const edge = this._pickEdge(e);
            if (edge) this._toggleRiftEdge(edge);
            return;
        }

        const cellIdx = this._pickCell(e);
        if (cellIdx >= 0) {
            this._lastPainted = cellIdx;
            this.paintCell(cellIdx, this._tool);
        }
    }

    _onMouseUp(e) {
        this._mouseDown = false;
    }

    _onResize() {
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        this._camera.aspect = w / h;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(w, h);
    }

    // ── Render loop ───────────────────────────────────────────────────────────

    _animate() {
        requestAnimationFrame(() => this._animate());
        this._controls.update();
        this._renderer.render(this._scene, this._camera);
    }
}
