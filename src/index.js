import * as THREE from 'three'
import { GlobeVisualization } from './visualization/GlobeVisualization.js'
import { generateRiftPath } from './simulation/riftPathfinder.js'

const canvas = document.getElementById('canvas')
const globe = new GlobeVisualization(canvas)

// ── State ──────────────────────────────────────────────
let mode = 'navigate'
let drawPoints = []
let cratonDrawPoints = []
let cratons = []
let supercontinent = null
let riftCoords = null
let isPlaying = false
let simTime = 0

// ── UI refs ────────────────────────────────────────────
const modeIndicator = document.getElementById('mode-indicator')
const btnStartDraw = document.getElementById('btn-start-draw')
const btnClearDraw = document.getElementById('btn-clear-draw')
const btnMarkCratons = document.getElementById('btn-mark-cratons')
const btnSaveCraton = document.getElementById('btn-save-craton')
const btnClearCraton = document.getElementById('btn-clear-craton')
const btnFinishSetup = document.getElementById('btn-finish-setup')
const btnPlay = document.getElementById('btn-play')
const btnPause = document.getElementById('btn-pause')
const btnReset = document.getElementById('btn-reset')
const speedSlider = document.getElementById('speed-slider')
const speedValue = document.getElementById('speed-value')
const timeSlider = document.getElementById('time-slider')
const timeDisplay = document.getElementById('time-display')
const statTime = document.getElementById('stat-time')
const statPlates = document.getElementById('stat-plates')
const statSubzones = document.getElementById('stat-subzones')
const statCratons = document.getElementById('stat-cratons')
const statRifts = document.getElementById('stat-rifts')
const statCollisions = document.getElementById('stat-collisions')
const cyclePhase = document.getElementById('cycle-phase')
const outlinerList = document.getElementById('outliner-list')

// ── View controls ──────────────────────────────────────
document.getElementById('btn-view-up').addEventListener('click', () => globe.nudgeView(0, 1))
document.getElementById('btn-view-down').addEventListener('click', () => globe.nudgeView(0, -1))
document.getElementById('btn-view-left').addEventListener('click', () => globe.nudgeView(-1, 0))
document.getElementById('btn-view-right').addEventListener('click', () => globe.nudgeView(1, 0))
document.getElementById('btn-view-reset').addEventListener('click', () => globe.resetView())
document.getElementById('btn-view-home').addEventListener('click', () => globe.resetView())
document.getElementById('btn-view-tilt-reset').addEventListener('click', () => globe.resetPitch())
document.getElementById('btn-zoom-in').addEventListener('click', () => globe.zoomBy(-0.14))
document.getElementById('btn-zoom-out').addEventListener('click', () => globe.zoomBy(0.14))

// ── Helpers ────────────────────────────────────────────
function setMode(m) {
  mode = m
  globe.setInteractionMode(m)
  if (m === 'navigate') {
    modeIndicator.textContent = 'Navigate Mode'
    modeIndicator.classList.remove('active')
  } else if (m === 'draw') {
    modeIndicator.textContent = 'Draw Mode: Click to add points'
    modeIndicator.classList.add('active')
  } else if (m === 'mark') {
    modeIndicator.textContent = 'Mark Cratons: Click to add points'
    modeIndicator.classList.add('active')
  }
}

function updateOutliner() {
  const items = []

  if (supercontinent) {
    items.push({
      title: supercontinent.name || 'Supercontinent',
      color: '#8B7355',
      meta: `${supercontinent.lons.length} points`,
    })
  } else if (drawPoints.length > 0) {
    items.push({
      title: 'Supercontinent (draft)',
      color: '#ffffff',
      meta: `${drawPoints.length} points`,
    })
  }

  cratons.forEach((c, i) => {
    items.push({
      title: c.name || `Craton ${i + 1}`,
      color: '#ffff00',
      meta: `${c.lons.length} points`,
    })
  })

  if (cratonDrawPoints.length > 0) {
    items.push({
      title: 'Craton (draft)',
      color: '#ffaa00',
      meta: `${cratonDrawPoints.length} points`,
    })
  }

  if (riftCoords) {
    items.push({
      title: 'Auto-generated Rift',
      color: '#ff6600',
      meta: `${riftCoords.length} points`,
    })
  }

  if (items.length === 0) {
    outlinerList.innerHTML = '<div class="outliner-empty">No polygons yet. Start drawing to begin.</div>'
    return
  }

  outlinerList.innerHTML = items.map(item => `
    <div class="outliner-item">
      <div class="outliner-title">
        <span class="outliner-color" style="background:${item.color}"></span>
        ${item.title}
      </div>
      <div class="outliner-meta">${item.meta}</div>
    </div>
  `).join('')
}

function updateStats() {
  statTime.textContent = `${simTime} Mya`
  statPlates.textContent = supercontinent ? '1' : '0'
  statSubzones.textContent = '0'
  statCratons.textContent = cratons.length
  statRifts.textContent = riftCoords ? '1' : '0'
  statCollisions.textContent = '0'
}

// ── Canvas click handler ───────────────────────────────
canvas.addEventListener('click', (event) => {
  if (globe.consumeDragFlag()) return

  const rect = canvas.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width * 2 - 1
  const y = -(event.clientY - rect.top) / rect.height * 2 + 1

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2(x, y)
  raycaster.setFromCamera(mouse, globe.camera)

  const intersects = raycaster.intersectObject(globe.globe)
  if (intersects.length === 0) return

  const point = intersects[0].point.clone().normalize()
  const lat = Math.asin(point.y) * 180 / Math.PI
  const lon = Math.atan2(point.z, point.x) * 180 / Math.PI

  if (mode === 'draw') {
    drawPoints.push([lat, lon])
    globe.drawDrawingPreview(
      drawPoints.map(p => p[0]),
      drawPoints.map(p => p[1]),
      { color: 0xffffff, fillOpacity: 0.15, markerColor: 0xffffff }
    )
    modeIndicator.textContent = `Draw Mode: ${drawPoints.length} points (right-click to close)`
  } else if (mode === 'mark') {
    cratonDrawPoints.push([lat, lon])
    globe.drawDrawingPreview(
      cratonDrawPoints.map(p => p[0]),
      cratonDrawPoints.map(p => p[1]),
      { color: 0xffff00, fillOpacity: 0.15, markerColor: 0xffff00 }
    )
    modeIndicator.textContent = `Mark Cratons: ${cratonDrawPoints.length} points (right-click to close)`
  }
})

canvas.addEventListener('contextmenu', (event) => {
  if (mode === 'draw' && drawPoints.length >= 3) {
    closeSupercontinent()
    event.preventDefault()
  } else if (mode === 'mark' && cratonDrawPoints.length >= 3) {
    closeCraton()
    event.preventDefault()
  }
})

function closeSupercontinent() {
  if (drawPoints.length < 3) return

  const lats = drawPoints.map(p => p[0])
  const lons = drawPoints.map(p => p[1])

  globe.clearDrawingPreview()
  globe.drawContinent(lats, lons, 0x8B7355)

  supercontinent = {
    name: 'Supercontinent',
    lats,
    lons,
    coords: lons.map((lon, i) => [lon, lats[i]]),
  }

  drawPoints = []
  updateOutliner()
  updateStats()
  setMode('navigate')
}

function closeCraton() {
  if (cratonDrawPoints.length < 3) return

  const lats = cratonDrawPoints.map(p => p[0])
  const lons = cratonDrawPoints.map(p => p[1])

  globe.clearDrawingPreview()
  globe.drawPolygonOverlay(lats, lons, {
    lineColor: 0xffff00,
    fillColor: 0xffff00,
    fillOpacity: 0.12,
    radiusOffset: 0.006,
  })

  cratons.push({
    name: `Craton ${cratons.length + 1}`,
    lats,
    lons,
    coords: lons.map((lon, i) => [lon, lats[i]]),
  })

  cratonDrawPoints = []
  updateOutliner()
  updateStats()
}

// ── Button handlers ────────────────────────────────────
btnStartDraw.addEventListener('click', () => {
  drawPoints = []
  globe.clearDrawingPreview()
  setMode('draw')
})

btnClearDraw.addEventListener('click', () => {
  drawPoints = []
  globe.clearDrawingPreview()
})

btnMarkCratons.addEventListener('click', () => {
  cratonDrawPoints = []
  globe.clearDrawingPreview()
  setMode('mark')
})

btnSaveCraton.addEventListener('click', () => {
  if (cratonDrawPoints.length >= 3) {
    closeCraton()
    setMode('mark')
  }
})

btnClearCraton.addEventListener('click', () => {
  cratonDrawPoints = []
  globe.clearDrawingPreview()
})

btnFinishSetup.addEventListener('click', () => {
  if (!supercontinent) {
    alert('Draw a supercontinent polygon first.')
    return
  }
  setMode('navigate')
  cyclePhase.textContent = 'Setup complete. Press Play to generate rift.'
})

speedSlider.addEventListener('input', () => {
  speedValue.textContent = `${speedSlider.value} Myr`
})

btnPlay.addEventListener('click', () => {
  if (!supercontinent) {
    alert('Finish setup first: draw a supercontinent and press "Finish Setup".')
    return
  }

  if (isPlaying) return
  isPlaying = true

  cyclePhase.textContent = 'Generating rift...'

  const plateCoords = supercontinent.coords
  const cratonPolygons = cratons.map(c => c.coords)

  let riftPath
  try {
    riftPath = generateRiftPath(plateCoords, cratonPolygons, {
      resolutionDeg: 0.5,
      zigzagAmplitude: 1.5,
      zigzagInterval: 3,
    })
  } catch (e) {
    alert('Failed to generate rift: ' + e.message)
    isPlaying = false
    cyclePhase.textContent = 'Rift generation failed.'
    return
  }

  riftCoords = riftPath

  const riftLats = riftPath.map(p => p[1])
  const riftLons = riftPath.map(p => p[0])
  globe.drawRiftZone(riftLats, riftLons)

  simTime = 0
  timeSlider.value = 0
  timeDisplay.textContent = '0 Mya'
  updateStats()
  updateOutliner()

  cyclePhase.textContent = 'Embryonic Rift — rift generated, no further simulation.'
})

btnPause.addEventListener('click', () => {
  isPlaying = false
})

btnReset.addEventListener('click', () => {
  globe.clear()
  drawPoints = []
  cratonDrawPoints = []
  cratons = []
  supercontinent = null
  riftCoords = null
  isPlaying = false
  simTime = 0
  timeSlider.value = 0
  timeDisplay.textContent = '0 Mya'
  cyclePhase.textContent = 'Waiting for setup...'
  updateStats()
  updateOutliner()
  setMode('navigate')
})

timeSlider.addEventListener('input', () => {
  simTime = parseInt(timeSlider.value)
  timeDisplay.textContent = `${simTime} Mya`
  statTime.textContent = `${simTime} Mya`
})

// ── Init ───────────────────────────────────────────────
updateStats()
updateOutliner()
setMode('navigate')
