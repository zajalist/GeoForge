/**
 * ui.js — GeoForge UI controller
 * Wires toolbar buttons, sidebar controls, keyboard shortcuts, and status bar.
 */

'use strict';

class GeoForgeUI {
    constructor(globe) {
        this._globe      = globe;
        this._running    = false;
        this._snapshots    = [];    // [{time_ma, result}, ...]
        this._snapshotIdx  = -1;    // index of currently displayed snapshot
        this._playing      = false;
        this._playInterval = null;
        this._initialized  = false;
        this._errorTimer   = null;
    }

    init() {
        this._bindToolbar();
        this._bindSidebar();
        this._bindTimeline();
        this._bindKeyboard();
        this._bindGlobeCallbacks();
        this._updateStats();
        this._setTool('continental');
        this._setColorMode('crust');
    }

    // ── Toolbar ──────────────────────────────────────────────────────────────

    _bindToolbar() {
        // Paint tool buttons
        document.getElementById('btn-ocean')      ?.addEventListener('click', () => this._setTool('ocean'));
        document.getElementById('btn-continental') ?.addEventListener('click', () => this._setTool('continental'));
        document.getElementById('btn-craton')      ?.addEventListener('click', () => this._setTool('craton'));
        document.getElementById('btn-rift')        ?.addEventListener('click', () => this._setTool('rift'));
        document.getElementById('btn-orbit')       ?.addEventListener('click', () => this._setTool('orbit'));
        document.getElementById('btn-clear')       ?.addEventListener('click', () => {
            if (confirm('Clear all painted cells?')) {
                this._globe.clearPaint();
                this._updateStats();
            }
        });

        // Wireframe toggle
        document.getElementById('btn-wire')?.addEventListener('click', () => {
            const on = this._globe.toggleWireframe();
            document.getElementById('btn-wire')?.classList.toggle('active', on);
        });

        // Brush size
        document.getElementById('btn-brush-dec')?.addEventListener('click', () => {
            this._globe.setBrushRadius(this._globe.getBrushRadius() - 1);
            this._updateBrushIndicator();
        });
        document.getElementById('btn-brush-inc')?.addEventListener('click', () => {
            this._globe.setBrushRadius(this._globe.getBrushRadius() + 1);
            this._updateBrushIndicator();
        });
    }

    _setTool(tool) {
        this._globe.setTool(tool);
        // Update active state on buttons
        ['ocean','continental','craton','rift','orbit'].forEach(t => {
            document.getElementById(`btn-${t}`)?.classList.toggle('active', t === tool);
        });
        this._updateStatus(`Tool: ${tool}`);
    }

    // ── Colour mode tabs ──────────────────────────────────────────────────────

    _bindSidebar() {
        // Color mode tabs
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                this._setColorMode(mode);
            });
        });

        document.getElementById('btn-boundaries')?.addEventListener('click', () => {
            const btn = document.getElementById('btn-boundaries');
            const on  = !btn.classList.contains('active');
            btn.classList.toggle('active', on);
            this._globe.toggleBoundaries(on);
        });
    }

    _setColorMode(mode) {
        const hasResult = this._globe.hasSimResult();
        const needsResult = ['elevation','temperature','precipitation','koppen','plates'];
        if (needsResult.includes(mode) && !hasResult) {
            this._updateStatus('Run a simulation first to see ' + mode);
            return;
        }
        this._globe.setColorMode(mode);
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });
        this._updateLegend(mode);
    }

    _updateLegend(mode) {
        const legendEl = document.getElementById('legend');
        if (!legendEl) return;

        const legends = {
            crust: [
                ['#1a5a8e','Ocean'],
                ['#7a6040','Continental'],
                ['#c8a020','Craton'],
                ['#d04020','Rift'],
            ],
            elevation: [
                ['#08203a','< -4000 m'],
                ['#2090c0','-1000 – 0 m'],
                ['#80a050','0 – 1500 m'],
                ['#7a6040','1500 – 3000 m'],
                ['#ffffff','> 5000 m'],
            ],
            temperature: [
                ['#2060e0','< 0°C'],
                ['#40a0e0','0 – 10°C'],
                ['#60d060','10 – 20°C'],
                ['#e0e040','20 – 30°C'],
                ['#e06020','> 30°C'],
            ],
            precipitation: [
                ['#e8c080','< 200 mm/yr'],
                ['#60c060','200 – 800 mm/yr'],
                ['#1080c0','800 – 2000 mm/yr'],
                ['#002060','> 2000 mm/yr'],
            ],
            koppen: [
                ['#2ea860','A — Tropical'],
                ['#e8b840','B — Arid'],
                ['#78c838','C — Temperate'],
                ['#4888c8','D — Continental'],
                ['#b8d8f0','E — Polar/Alpine'],
            ],
            plates: [['#aaaaaa','Each colour = one plate']],
        };

        const items = legends[mode] || [];
        legendEl.innerHTML = items.map(([col, label]) =>
            `<div class="legend-item">
               <div class="legend-swatch" style="background:${col}"></div>
               <span>${label}</span>
             </div>`
        ).join('');
    }

    // ── Timeline ─────────────────────────────────────────────────────────────

    _bindTimeline() {
        document.getElementById('btn-sim-init')?.addEventListener('click', () => {
            this._initSimulation();
        });
        document.getElementById('btn-step-fwd')?.addEventListener('click', () => {
            this._stepForward();
        });
        document.getElementById('btn-step-back')?.addEventListener('click', () => {
            this._stepBack();
        });
        document.getElementById('btn-play-pause')?.addEventListener('click', () => {
            this._togglePlay();
        });
        document.getElementById('timeline-slider')?.addEventListener('input', e => {
            this._stopPlay();
            this._setSnapshotIdx(parseInt(e.target.value));
        });
        document.getElementById('btn-use-state')?.addEventListener('click', () => {
            this._finaliseState();
        });
    }

    async _initSimulation() {
        const stats = this._globe.getPaintStats();
        if (stats.continental + stats.craton === 0) {
            alert('Paint some continental cells first.');
            return;
        }

        const numPlates  = parseInt(document.getElementById('param-plates')?.value  || 7);
        const co2        = parseFloat(document.getElementById('param-co2')?.value   || 400);
        const seed       = parseInt(document.getElementById('param-seed')?.value    || 42);
        const timestepMa = parseFloat(document.getElementById('param-timestep')?.value || 10);

        const btn = document.getElementById('btn-sim-init');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Initialising…'; }

        try {
            const result = await API.simInit({
                continental_cells: this._globe.getPaintedCells('continental'),
                craton_cells:      this._globe.getPaintedCells('craton'),
                rift_edges:        this._globe.getRiftEdges(),
                seed,
                co2_ppm:     co2,
                num_plates:  numPlates,
                grid_level:  7,
                timestep_ma: timestepMa,
            });

            this._snapshots   = [{ time_ma: 0, result }];
            this._snapshotIdx = 0;
            this._initialized = true;

            this._globe.applySimResult(result);
            this._setColorMode('elevation');

            document.getElementById('timeline-section').style.display = 'block';
            this._updateTimelineUI();
            this._updateStatus('Initialised — Step or Play to advance');
            this._updateSimStats(result);
            document.getElementById('sim-stats-section').style.display = 'block';

        } catch (err) {
            this._updateStatus('Init error: ' + err.message);
            alert('Init failed: ' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⚙ Initialise'; }
        }
    }

    async _stepForward() {
        if (!this._initialized || this._running) return;
        this._running = true;
        const btn = document.getElementById('btn-step-fwd');
        if (btn) btn.disabled = true;
        try {
            const result = await API.simStep(1);
            this._snapshots.push({ time_ma: result.current_time_ma, result });
            this._snapshotIdx = this._snapshots.length - 1;
            this._globe.applySimResult(result);
            this._updateTimelineUI();
            this._updateSimStats(result);
            this._updateStatus(`${result.current_time_ma} Ma — ${result.boundaries?.length || 0} boundary segments`);
        } catch (err) {
            this._updateStatus('Step error: ' + err.message);
            this._stopPlay();
        } finally {
            this._running = false;
            if (btn) btn.disabled = false;
        }
    }

    _stepBack() {
        if (this._snapshotIdx > 0) {
            this._setSnapshotIdx(this._snapshotIdx - 1);
        }
    }

    _togglePlay() {
        if (this._playing) {
            this._stopPlay();
        } else {
            this._startPlay();
        }
    }

    _startPlay() {
        if (!this._initialized) return;
        this._playing = true;
        const btn = document.getElementById('btn-play-pause');
        if (btn) btn.textContent = '⏸';
        this._playInterval = setInterval(() => {
            if (!this._running) this._stepForward();
        }, 800);
    }

    _stopPlay() {
        this._playing = false;
        clearInterval(this._playInterval);
        this._playInterval = null;
        const btn = document.getElementById('btn-play-pause');
        if (btn) btn.textContent = '▶';
    }

    _setSnapshotIdx(idx) {
        if (idx < 0 || idx >= this._snapshots.length) return;
        this._snapshotIdx = idx;
        const snap = this._snapshots[idx];
        this._globe.applySimResult(snap.result);
        this._updateTimelineUI();
        this._updateSimStats(snap.result);
        this._updateStatus(`Viewing ${snap.time_ma} Ma`);
    }

    _finaliseState() {
        if (this._snapshotIdx < 0) return;
        this._stopPlay();
        const snap = this._snapshots[this._snapshotIdx];
        this._globe.applySimResult(snap.result);
        this._setColorMode('elevation');
        document.getElementById('sim-stats-section').style.display = 'block';
        this._updateSimStats(snap.result);
        this._updateStatus(`Finalised at ${snap.time_ma} Ma`);
    }

    _updateTimelineUI() {
        const snap = this._snapshots[this._snapshotIdx];
        if (!snap) return;
        const el = document.getElementById('tl-time');
        if (el) el.textContent = `${snap.time_ma} Ma`;
        const slider = document.getElementById('timeline-slider');
        if (slider) {
            slider.max   = String(this._snapshots.length - 1);
            slider.value = String(this._snapshotIdx);
        }
    }

    // ── Stats display ─────────────────────────────────────────────────────────

    _bindGlobeCallbacks() {
        this._globe.onPaintChanged = () => this._updateStats();
        this._globe.onCellHover = (idx, lat, lon) => this._updateTooltip(idx, lat, lon);
        this._globe.onContiguityError = (msg) => this._flashError(msg);
    }

    _flashError(msg) {
        const el = document.getElementById('sb-status');
        if (!el) return;
        el.textContent = '⚠ ' + msg;
        el.style.color = '#ff6644';
        clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => {
            el.style.color = '';
            el.textContent = 'Ready';
        }, 3000);
    }

    _updateStats() {
        const s = this._globe.getPaintStats();
        const pct = s.total > 0 ? (s.continental + s.craton) / s.total * 100 : 0;

        this._setStatValue('stat-total',    s.total.toLocaleString());
        this._setStatValue('stat-cont',     `${s.continental.toLocaleString()} (${pct.toFixed(1)}%)`);
        this._setStatValue('stat-cratons',  s.craton_regions !== undefined
            ? `${s.craton_regions} region${s.craton_regions !== 1 ? 's' : ''}`
            : s.craton.toLocaleString());
        this._setStatValue('stat-rift',     s.rift.toLocaleString());

        // Statusbar
        document.getElementById('sb-cont')?.querySelectorAll('b').forEach(b => {
            b.textContent = pct.toFixed(1) + '%';
        });
        document.getElementById('sb-cratons')?.querySelectorAll('b').forEach(b => {
            b.textContent = s.craton_regions !== undefined ? s.craton_regions : s.craton;
        });
        document.getElementById('sb-rift')?.querySelectorAll('b').forEach(b => {
            b.textContent = s.rift + ' edges';
        });
    }

    _updateSimStats(result) {
        if (!result) return;
        const elev = result.elevation;
        const N = elev.length;
        let emin=Infinity, emax=-Infinity, esum=0;
        for (let i=0;i<N;i++){emin=Math.min(emin,elev[i]);emax=Math.max(emax,elev[i]);esum+=elev[i];}
        const emean = esum/N;

        this._setStatValue('stat-elev-range', `${Math.round(emin)} – ${Math.round(emax)} m`);
        this._setStatValue('stat-elev-mean',  `${Math.round(emean)} m`);

        const temp = result.temperature;
        if (temp) {
            let tmin=Infinity, tmax=-Infinity;
            for (const t of temp){ tmin=Math.min(tmin,t);tmax=Math.max(tmax,t); }
            this._setStatValue('stat-temp-range', `${tmin.toFixed(0)} – ${tmax.toFixed(0)} °C`);
        }
    }

    _setStatValue(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    _updateBrushIndicator() {
        const r = this._globe.getBrushRadius();
        document.getElementById('brush-size-label')
            && (document.getElementById('brush-size-label').textContent = `Brush: ${r === 0 ? '1 cell' : `${r} ring${r>1?'s':''}`}`);
    }

    _updateStatus(msg) {
        const el = document.getElementById('sb-status');
        if (el) el.textContent = msg;
    }

    _updateTooltip(cellIdx, lat, lon) {
        const tip = document.getElementById('tooltip');
        if (!tip) return;

        const result = this._globe._simResult;
        const paint  = this._globe._paintState;
        const typeNames = ['Ocean','Continental','Craton','Rift'];

        let html = `<b>Cell ${cellIdx}</b><br>`;
        html += `${lat.toFixed(2)}°, ${lon.toFixed(2)}°<br>`;
        html += `Type: ${typeNames[paint?.[cellIdx] ?? 0]}<br>`;

        if (result) {
            html += `Elev: ${Math.round(result.elevation[cellIdx])} m<br>`;
            html += `T: ${result.temperature[cellIdx].toFixed(1)}°C<br>`;
            html += `P: ${Math.round(result.precipitation[cellIdx])} mm/yr`;
        }

        tip.innerHTML = html;
        tip.classList.add('visible');

        // Position near mouse (will be updated by mousemove on body)
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    _bindKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT') return;
            switch (e.key.toLowerCase()) {
                case 'o': this._setTool('ocean');         break;
                case 'c': this._setTool('continental');   break;
                case 'k': this._setTool('craton');        break;
                case 'r': this._setTool('rift');          break;
                case ' ': e.preventDefault(); this._setTool('orbit'); break;
                case 'g': this._globe.toggleWireframe();  break;
                case 'p': this._togglePlay(); break;
                case '[': this._globe.setBrushRadius(this._globe.getBrushRadius()-1);
                          this._updateBrushIndicator(); break;
                case ']': this._globe.setBrushRadius(this._globe.getBrushRadius()+1);
                          this._updateBrushIndicator(); break;
                case '1': this._setColorMode('crust');         break;
                case '2': this._setColorMode('elevation');     break;
                case '3': this._setColorMode('temperature');   break;
                case '4': this._setColorMode('precipitation'); break;
                case '5': this._setColorMode('koppen');        break;
                case '6': this._setColorMode('plates');        break;
                case 'b': document.getElementById('btn-boundaries')?.click(); break;
            }
        });

        // Tooltip positioning follows mouse
        document.addEventListener('mousemove', e => {
            const tip = document.getElementById('tooltip');
            if (tip) {
                tip.style.left = (e.clientX + 14) + 'px';
                tip.style.top  = (e.clientY - 10) + 'px';
            }
        });

        // Hide tooltip when not hovering globe
        document.getElementById('globe-container')
            ?.addEventListener('mouseleave', () => {
                document.getElementById('tooltip')?.classList.remove('visible');
            });
    }
}
