import { GlobeVisualization } from './visualization/GlobeVisualization.js'

// Global state
let simulation = null
let globe = null
let isPlaying = false
let isDrawingMode = false
let isMarkingCratonsMode = false
let simulationSpeed = 5  // Myr per frame
let drawingPoints = { lats: [], lons: [] }
let supercontinentPolygon = { lats: [], lons: [] }
let currentCratonDraft = { lats: [], lons: [] }
let cratonPolygons = []
let isSetupComplete = false

/**
 * Initialize the application
 */
async function init() {
  try {
    // Load the WebAssembly module
    console.log('Loading WebAssembly module...')

    // Load sim.js if not already loaded
    if (typeof window.createTectonicModule !== 'function') {
      console.log('Loading sim.js...')
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = '/sim.js'
        script.async = true
        script.onload = () => {
          console.log('sim.js loaded')
          if (typeof window.createTectonicModule !== 'function') {
            reject(new Error('createTectonicModule not found after loading sim.js'))
          } else {
            resolve()
          }
        }
        script.onerror = () => reject(new Error('Failed to load sim.js'))
        document.head.appendChild(script)
      })
    }

    const wasmModule = await window.createTectonicModule({
      // Ensure sim.wasm is resolved from public directory
      locateFile: (path) => {
        if (path.endsWith('.wasm')) {
          return '/' + path
        }
        return path
      }
    })
    const TectonicSimulation = wasmModule.TectonicSimulation

    if (!TectonicSimulation) {
      throw new Error('TectonicSimulation binding not found in WASM module.')
    }

    simulation = new TectonicSimulation()
    console.log('WebAssembly module loaded successfully')
    
    // Initialize globe visualization
    const canvas = document.getElementById('canvas')
    globe = new GlobeVisualization(canvas)
    globe.setInteractionMode('navigate')
    
    // Setup UI event handlers
    setupUIHandlers()
    
    // Start with a simple initial supercontinent
    initializeDefaultSupercontinent()
    
    // Start main loop
    mainLoop()
    
  } catch (error) {
    console.error('Failed to initialize:', error)
    alert(`Failed to load simulation engine: ${error?.message || error}`)
  }
}

/**
 * Setup UI control handlers
 */
function setupUIHandlers() {
  // Drawing controls
  document.getElementById('btn-start-draw').addEventListener('click', startDrawing)
  document.getElementById('btn-clear-draw').addEventListener('click', clearDrawing)
  document.getElementById('btn-mark-cratons').addEventListener('click', startMarkingCratons)
  document.getElementById('btn-save-craton').addEventListener('click', saveCurrentCratonPolygon)
  document.getElementById('btn-clear-craton').addEventListener('click', clearCurrentCratonDraft)
  document.getElementById('btn-finish-setup').addEventListener('click', finishSetup)
  
  // Simulation controls
  document.getElementById('btn-play').addEventListener('click', () => {
    isPlaying = false
    console.log('Automatic tectonic simulation on Play is disabled for manual workflow.')
  })
  document.getElementById('btn-pause').addEventListener('click', () => { isPlaying = false })
  document.getElementById('btn-reset').addEventListener('click', resetSimulation)
  
  // Speed control
  document.getElementById('speed-slider').addEventListener('input', (e) => {
    simulationSpeed = parseFloat(e.target.value)
    document.getElementById('speed-value').textContent = simulationSpeed.toFixed(1) + ' Myr'
  })
  
  // Time slider
  document.getElementById('time-slider').addEventListener('input', (e) => {
    const targetTime = parseFloat(e.target.value)
    const currentTime = simulation.getCurrentTime()
    const dt = targetTime - currentTime
    if (Math.abs(dt) > 0.1) {
      simulation.step(dt)
      updateVisualization()
    }
  })
  
  // Canvas click for drawing
  const canvas = document.getElementById('canvas')
  canvas.addEventListener('click', onCanvasClick)

  setupViewControls()

  refreshButtonStates()
  renderOutliner()
}

function setupViewControls() {
  const bind = (id, fn) => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('click', fn)
  }

  bind('btn-view-up', () => globe.nudgeView(0, 1))
  bind('btn-view-down', () => globe.nudgeView(0, -1))
  bind('btn-view-left', () => globe.nudgeView(-1, 0))
  bind('btn-view-right', () => globe.nudgeView(1, 0))
  bind('btn-zoom-in', () => globe.zoomBy(-0.14))
  bind('btn-zoom-out', () => globe.zoomBy(0.14))
  bind('btn-view-home', () => globe.resetView())
  bind('btn-view-reset', () => globe.resetView())
  bind('btn-view-tilt-reset', () => globe.resetPitch())
}

/**
 * Start drawing mode for supercontinent
 */
function startDrawing() {
  isSetupComplete = false
  isPlaying = false
  isDrawingMode = true
  isMarkingCratonsMode = false
  globe.setInteractionMode('draw')
  drawingPoints = { lats: [], lons: [] }
  supercontinentPolygon = { lats: [], lons: [] }
  currentCratonDraft = { lats: [], lons: [] }
  cratonPolygons = []

  refreshButtonStates()
  renderOutliner()
  updateVisualization()
  updateModeIndicator()
  console.log('Drawing mode started. Click on globe to draw supercontinent outline.')
}

/**
 * Clear current drawing
 */
function clearDrawing() {
  drawingPoints = { lats: [], lons: [] }
  supercontinentPolygon = { lats: [], lons: [] }
  currentCratonDraft = { lats: [], lons: [] }
  cratonPolygons = []

  refreshButtonStates()
  renderOutliner()
  updateVisualization()
  console.log('Drawing cleared.')
}

/**
 * Start marking cratons
 */
function startMarkingCratons() {
  const activeSupercontinent = getCurrentSupercontinentPolygon()
  if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
    alert('Draw a supercontinent polygon first, then mark craton polygons inside it.')
    return
  }

  isSetupComplete = false
  isMarkingCratonsMode = true
  isDrawingMode = false
  globe.setInteractionMode('mark')
  currentCratonDraft = { lats: [], lons: [] }

  refreshButtonStates()
  renderOutliner()
  updateVisualization()
  updateModeIndicator()
  console.log('Craton marking mode started. Click on globe to draw a craton polygon, then save it.')
}

/**
 * Save the currently drawn craton polygon (must be inside supercontinent polygon).
 */
function saveCurrentCratonPolygon() {
  if (currentCratonDraft.lats.length < 3) {
    alert('Need at least 3 points to save a craton polygon.')
    return
  }

  const activeSupercontinent = getCurrentSupercontinentPolygon()
  if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
    alert('No valid supercontinent polygon found for containment check.')
    return
  }

  const closedDraft = closePolygon(currentCratonDraft.lats, currentCratonDraft.lons)
  const closedSupercontinent = closePolygon(activeSupercontinent.lats, activeSupercontinent.lons)

  if (!isPolygonInsidePolygon(closedDraft, closedSupercontinent)) {
    alert('Craton polygon must be fully inside the supercontinent polygon.')
    return
  }

  cratonPolygons.push({
    id: cratonPolygons.length + 1,
    name: `Craton ${cratonPolygons.length + 1}`,
    lats: closedDraft.lats,
    lons: closedDraft.lons
  })

  currentCratonDraft = { lats: [], lons: [] }
  refreshButtonStates()
  renderOutliner()
  updateVisualization()
}

/**
 * Clear in-progress craton polygon draft.
 */
function clearCurrentCratonDraft() {
  currentCratonDraft = { lats: [], lons: [] }
  refreshButtonStates()
  renderOutliner()
  updateVisualization()
}

/**
 * Handle canvas clicks for drawing and craton marking
 */
function onCanvasClick(event) {
  if (event.button !== 0) return
  if (!isDrawingMode && !isMarkingCratonsMode) return

  // Ignore click events that are the end of a drag-pan gesture.
  if (globe.consumeDragFlag()) return
  
  // Get click position on screen
  const rect = event.target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  // Convert to normalized device coordinates
  const ndc_x = (2 * x) / rect.width - 1
  const ndc_y = 1 - (2 * y) / rect.height
  
  // Cast ray from camera
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera({ x: ndc_x, y: ndc_y }, globe.camera)
  
  // Find intersection with sphere
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1)
  const intersection = raycaster.ray.intersectSphere(sphere, new THREE.Vector3())
  
  if (intersection) {
    const point = intersection
    
    // Convert to lat/lon
    const lat = Math.asin(point.y) * 180 / Math.PI
    const lon = Math.atan2(point.z, point.x) * 180 / Math.PI
    
    if (isDrawingMode) {
      drawingPoints.lats.push(lat)
      drawingPoints.lons.push(lon)

      refreshButtonStates()
      renderOutliner()
      updateVisualization()
      console.log(`Added point: (${lat.toFixed(1)}, ${lon.toFixed(1)})`)
    } else if (isMarkingCratonsMode) {
      currentCratonDraft.lats.push(lat)
      currentCratonDraft.lons.push(lon)

      refreshButtonStates()
      renderOutliner()
      updateVisualization()
      console.log(`Added craton: (${lat.toFixed(1)}, ${lon.toFixed(1)})`)
    }
  }
}

/**
 * Finish setup and initialize simulation
 */
function finishSetup() {
  const activeSupercontinent = getCurrentSupercontinentPolygon()
  if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
    alert('Need a closed supercontinent polygon with at least 3 vertices.')
    return
  }
  
  isDrawingMode = false
  isMarkingCratonsMode = false
  globe.setInteractionMode('navigate')

  const closed = closePolygon(activeSupercontinent.lats, activeSupercontinent.lons)
  supercontinentPolygon = closed
  drawingPoints = { lats: [...closed.lats], lons: [...closed.lons] }
  isSetupComplete = true

  // Initialize simulation
  simulation.initSupercontinent(closed.lats, closed.lons)
  
  // Add cratons as centroid/radius approximations of craton polygons.
  for (const cratonPolygon of cratonPolygons) {
    const approx = approximateCratonCenterRadius(cratonPolygon)
    simulation.addCraton(approx.lat, approx.lon, approx.radiusDegrees)
  }
  
  // Update visualization
  globe.clearDrawingPreview()
  updateVisualization()
  renderOutliner()
  refreshButtonStates()
  
  // Enable playback controls
  document.getElementById('btn-play').disabled = false
  document.getElementById('btn-pause').disabled = false
  document.getElementById('btn-reset').disabled = false
  
  // Disable drawing controls
  document.getElementById('btn-save-craton').disabled = true
  document.getElementById('btn-clear-craton').disabled = true
  
  updateModeIndicator()
  console.log('Simulation initialized!')
}

/**
 * Initialize with a default supercontinent for testing
 */
function initializeDefaultSupercontinent() {
  // Create a simple supercontinent shape
  const lats = [
    45, 40, 35, 30, 25, 30, 35, 40, 45, 50, 55,
    50, 45
  ]
  const lons = [
    -60, -40, -20, 0, 20, 40, 60, 70, 80, 70, 60,
    40, -60
  ]
  
  const closed = closePolygon(lats, lons)
  supercontinentPolygon = closed
  drawingPoints = { lats: [...closed.lats], lons: [...closed.lons] }
  currentCratonDraft = { lats: [], lons: [] }
  cratonPolygons = []
  isSetupComplete = true

  simulation.initSupercontinent(closed.lats, closed.lons)
  globe.setInteractionMode('navigate')
  updateVisualization()
  renderOutliner()
  refreshButtonStates()
  
  // Enable playback
  document.getElementById('btn-play').disabled = false
  document.getElementById('btn-pause').disabled = false
  document.getElementById('btn-reset').disabled = false
}

/**
 * Reset simulation
 */
function resetSimulation() {
  simulation.reset()
  isPlaying = false
  isDrawingMode = false
  isMarkingCratonsMode = false
  drawingPoints = { lats: [], lons: [] }
  supercontinentPolygon = { lats: [], lons: [] }
  currentCratonDraft = { lats: [], lons: [] }
  cratonPolygons = []
  isSetupComplete = false
  updateVisualization()
  window.location.reload()
}

/**
 * Ensure the first and last vertices are identical so the polygon is closed.
 */
function closePolygon(lats, lons) {
  const result = {
    lats: [...lats],
    lons: [...lons]
  }

  if (result.lats.length < 3 || result.lons.length < 3) {
    return result
  }

  const lastIdx = result.lats.length - 1
  const isClosed = Math.abs(result.lats[0] - result.lats[lastIdx]) < 1e-6 &&
    Math.abs(result.lons[0] - result.lons[lastIdx]) < 1e-6

  if (!isClosed) {
    result.lats.push(result.lats[0])
    result.lons.push(result.lons[0])
  }

  return result
}

function stripClosedPolygon(polygon) {
  if (!polygon || polygon.lats.length === 0 || polygon.lons.length === 0) {
    return { lats: [], lons: [] }
  }

  const lats = [...polygon.lats]
  const lons = [...polygon.lons]
  if (lats.length > 1) {
    const last = lats.length - 1
    const isClosed = Math.abs(lats[0] - lats[last]) < 1e-6 && Math.abs(lons[0] - lons[last]) < 1e-6
    if (isClosed) {
      lats.pop()
      lons.pop()
    }
  }

  return { lats, lons }
}

function getCurrentSupercontinentPolygon() {
  if (drawingPoints.lats.length >= 3) {
    return closePolygon(drawingPoints.lats, drawingPoints.lons)
  }
  if (supercontinentPolygon.lats.length >= 3) {
    return closePolygon(supercontinentPolygon.lats, supercontinentPolygon.lons)
  }
  return null
}

function latLonToUnitVector(lat, lon) {
  const latRad = lat * Math.PI / 180
  const lonRad = lon * Math.PI / 180
  return new THREE.Vector3(
    Math.cos(latRad) * Math.cos(lonRad),
    Math.sin(latRad),
    Math.cos(latRad) * Math.sin(lonRad)
  ).normalize()
}

function approximateCratonCenterRadius(cratonPolygon) {
  const ring = stripClosedPolygon(cratonPolygon)
  const centerVec = new THREE.Vector3()
  for (let i = 0; i < ring.lats.length; ++i) {
    centerVec.add(latLonToUnitVector(ring.lats[i], ring.lons[i]))
  }

  if (centerVec.lengthSq() < 1e-12) {
    centerVec.copy(latLonToUnitVector(ring.lats[0], ring.lons[0]))
  }
  centerVec.normalize()

  let maxAngleRad = 0
  for (let i = 0; i < ring.lats.length; ++i) {
    const v = latLonToUnitVector(ring.lats[i], ring.lons[i])
    const angle = Math.acos(THREE.MathUtils.clamp(centerVec.dot(v), -1, 1))
    maxAngleRad = Math.max(maxAngleRad, angle)
  }

  const lat = Math.asin(centerVec.y) * 180 / Math.PI
  const lon = Math.atan2(centerVec.z, centerVec.x) * 180 / Math.PI

  return {
    lat,
    lon,
    radiusDegrees: Math.max(1, maxAngleRad * 180 / Math.PI)
  }
}

function isPointInsideSphericalPolygon(lat, lon, polygon) {
  const ring = stripClosedPolygon(polygon)
  if (ring.lats.length < 3) return false

  const p = latLonToUnitVector(lat, lon)
  let angleSum = 0

  for (let i = 0; i < ring.lats.length; ++i) {
    const next = (i + 1) % ring.lats.length
    const vi = latLonToUnitVector(ring.lats[i], ring.lons[i])
    const vj = latLonToUnitVector(ring.lats[next], ring.lons[next])

    const a = vi.clone().sub(p.clone().multiplyScalar(vi.dot(p)))
    const b = vj.clone().sub(p.clone().multiplyScalar(vj.dot(p)))
    if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) {
      continue
    }

    a.normalize()
    b.normalize()

    const cross = new THREE.Vector3().crossVectors(a, b)
    const sin = cross.dot(p)
    const cos = THREE.MathUtils.clamp(a.dot(b), -1, 1)
    angleSum += Math.atan2(sin, cos)
  }

  return Math.abs(angleSum) > Math.PI
}

function isPolygonInsidePolygon(innerPolygon, outerPolygon) {
  const inner = stripClosedPolygon(innerPolygon)
  if (inner.lats.length < 3) return false

  for (let i = 0; i < inner.lats.length; ++i) {
    if (!isPointInsideSphericalPolygon(inner.lats[i], inner.lons[i], outerPolygon)) {
      return false
    }
  }

  const centroid = approximateCratonCenterRadius(innerPolygon)
  return isPointInsideSphericalPolygon(centroid.lat, centroid.lon, outerPolygon)
}

function renderPolygonLayers() {
  // Draw committed supercontinent in editing mode so containment is visible.
  if (!isSetupComplete) {
    const activeSupercontinent = getCurrentSupercontinentPolygon()
    if (activeSupercontinent && activeSupercontinent.lats.length >= 4) {
      globe.drawPolygonOverlay(activeSupercontinent.lats, activeSupercontinent.lons, {
        lineColor: 0x8B7355,
        fillColor: 0x8B7355,
        fillOpacity: 0.28,
        radiusOffset: 0.003
      })
    }
  }

  // Draw all saved craton polygons.
  for (const craton of cratonPolygons) {
    globe.drawPolygonOverlay(craton.lats, craton.lons, {
      lineColor: 0xffd54f,
      fillColor: 0xffc107,
      fillOpacity: 0.24,
      radiusOffset: 0.007
    })
  }

  if (isDrawingMode) {
    globe.drawDrawingPreview(drawingPoints.lats, drawingPoints.lons, {
      color: 0xffffff,
      fillOpacity: 0.15
    })
  } else if (isMarkingCratonsMode) {
    globe.drawDrawingPreview(currentCratonDraft.lats, currentCratonDraft.lons, {
      color: 0xffd54f,
      fillOpacity: 0.22
    })
  } else {
    globe.clearDrawingPreview()
  }
}

function refreshButtonStates() {
  const hasSupercontinent = !!getCurrentSupercontinentPolygon()
  const hasCratonDraft = currentCratonDraft.lats.length >= 3
  const hasAnyCratonDraft = currentCratonDraft.lats.length > 0

  document.getElementById('btn-finish-setup').disabled = !hasSupercontinent
  document.getElementById('btn-mark-cratons').disabled = !hasSupercontinent
  document.getElementById('btn-save-craton').disabled = !(isMarkingCratonsMode && hasCratonDraft)
  document.getElementById('btn-clear-craton').disabled = !(isMarkingCratonsMode && hasAnyCratonDraft)
  document.getElementById('btn-play').disabled = !isSetupComplete
  document.getElementById('btn-pause').disabled = !isSetupComplete
}

function renderOutliner() {
  const container = document.getElementById('outliner-list')
  if (!container) return

  const rows = []
  const activeSupercontinent = getCurrentSupercontinentPolygon()

  if (activeSupercontinent && activeSupercontinent.lats.length >= 4) {
    const ring = stripClosedPolygon(activeSupercontinent)
    const stateLabel = isSetupComplete ? 'committed' : 'draft'
    rows.push(`
      <div class="outliner-item">
        <div class="outliner-title">
          <span class="outliner-color" style="background:#8B7355"></span>
          <span>Supercontinent</span>
        </div>
        <div class="outliner-meta">${ring.lats.length} vertices • ${stateLabel}</div>
      </div>
    `)
  }

  for (const craton of cratonPolygons) {
    const ring = stripClosedPolygon(craton)
    rows.push(`
      <div class="outliner-item">
        <div class="outliner-title">
          <span class="outliner-color" style="background:#ffcf55"></span>
          <span>${craton.name}</span>
        </div>
        <div class="outliner-meta">${ring.lats.length} vertices • inside supercontinent</div>
      </div>
    `)
  }

  if (currentCratonDraft.lats.length >= 2) {
    const draftRing = stripClosedPolygon(closePolygon(currentCratonDraft.lats, currentCratonDraft.lons))
    rows.push(`
      <div class="outliner-item">
        <div class="outliner-title">
          <span class="outliner-color" style="background:#ffe082"></span>
          <span>Craton Draft</span>
        </div>
        <div class="outliner-meta">${draftRing.lats.length} vertices • unsaved</div>
      </div>
    `)
  }

  if (rows.length === 0) {
    container.innerHTML = '<div class="outliner-empty">No polygons yet. Draw supercontinent first.</div>'
  } else {
    container.innerHTML = rows.join('')
  }
}

/**
 * Update visualization from current simulation state
 */
function updateVisualization() {
  if (!simulation || !globe) return

  if (isSetupComplete) {
    globe.updateFromSimulation(simulation)
  } else {
    globe.clear()
  }

  renderPolygonLayers()
  
  // Update statistics
  const time = simulation.getCurrentTime()
  document.getElementById('stat-time').textContent = `${time.toFixed(1)} Mya`
  document.getElementById('stat-plates').textContent = isSetupComplete ? simulation.getPlateCount() : 0
  document.getElementById('stat-subzones').textContent = simulation.getSubductionZoneCount()
  document.getElementById('stat-rifts').textContent = simulation.getRiftZoneCount()
  document.getElementById('stat-collisions').textContent = simulation.getCollisionZoneCount()
  document.getElementById('stat-cratons').textContent = cratonPolygons.length
  
  document.getElementById('time-display').textContent = `${time.toFixed(1)} Mya`
  document.getElementById('time-slider').max = Math.max(1000, time + 100)
  document.getElementById('time-slider').value = time
  
  // Update phase
  const phase = getCurrentPhase(time)
  document.getElementById('cycle-phase').textContent = phase
}

/**
 * Determine current phase of Wilson Cycle
 */
function getCurrentPhase(time) {
  if (time < 50) return '🔄 Early Tenure'
  if (time < 200) return '🔄 Tenure'
  if (time < 300) return '🌊 Early Breakup'
  if (time < 500) return '📍 Spreading'
  if (time < 700) return '🔀 Reassembly'
  if (time < 900) return '⛰️ Collision'
  return '🔄 Late Stage'
}

/**
 * Update mode indicator
 */
function updateModeIndicator() {
  const indicator = document.getElementById('mode-indicator')
  
  if (isDrawingMode) {
    indicator.textContent = '✏️ Draw Mode: Click to draw supercontinent'
    indicator.classList.remove('active')
  } else if (isMarkingCratonsMode) {
    indicator.textContent = '📍 Craton Polygon Mode: Click to draw and save craton polygons'
    indicator.classList.remove('active')
  } else {
    indicator.textContent = '▶️ Ready to Simulate'
    indicator.classList.add('active')
  }
}

/**
 * Main simulation loop
 */
async function mainLoop() {
  requestAnimationFrame(mainLoop)
}

// Three.js import - will be bundled with Vite
import * as THREE from 'three'
window.THREE = THREE

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
