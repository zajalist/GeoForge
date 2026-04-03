'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  CheckCircle2,
  Circle,
  Clock3,
  Compass,
  Eye,
  Layers,
  MapPin,
  MoveDown,
  MoveLeft,
  MoveRight,
  MoveUp,
  Pause,
  PencilLine,
  Play,
  RotateCcw,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { GlobeVisualization } from '../src/visualization/GlobeVisualization.js'
import { generateRiftPath } from '../src/simulation/riftPathfinder.js'
import { generatePlanet, renderPlanetToCanvas, WIDTH, HEIGHT } from '../src/simulation/planetGenerator.js'

function getCurrentPhase(time) {
  if (time < 50) return 'Embryonic Rifting'
  if (time < 200) return 'Young Ocean Opening'
  if (time < 350) return 'Mature Ocean Basin'
  if (time < 550) return 'Declining Ocean / Subduction'
  if (time < 750) return 'Terminal Closure'
  return 'Orogeny and Suturing'
}

function createManualSimulationStub() {
  return {
    _time: 0,
    _cratonCount: 0,
    initSupercontinent() {},
    addCraton() {
      this._cratonCount += 1
    },
    step(dt) {
      this._time = Math.max(0, this._time + dt)
    },
    reset() {
      this._time = 0
      this._cratonCount = 0
    },
    getCurrentTime() {
      return this._time
    },
    getPlateCount() {
      return 0
    },
    getSubductionZoneCount() {
      return 0
    },
    getRiftZoneCount() {
      return 0
    },
    getCollisionZoneCount() {
      return 0
    },
    getCratonCount() {
      return this._cratonCount
    },
    getPlumeCount() {
      return 0
    },
    getSutureCount() {
      return 0
    }
  }
}

export default function WilsonCyclesApp() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  const simRef = useRef(null)
  const globeRef = useRef(null)

  const drawingPointsRef = useRef({ lats: [], lons: [] })
  const supercontinentPolygonRef = useRef({ lats: [], lons: [] })
  const currentCratonDraftRef = useRef({ lats: [], lons: [] })
  const cratonPolygonsRef = useRef([])
  const riftPathRef = useRef([])

  const interactionModeRef = useRef('navigate')
  const isPlayingRef = useRef(false)
  const isSetupCompleteRef = useRef(false)
  const simSpeedRef = useRef(5)

  const updateVisualizationRef = useRef(() => {})
  const onCanvasClickRef = useRef(() => {})

  const [isLoaded, setIsLoaded] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [interactionMode, setInteractionMode] = useState('navigate')
  const [simSpeed, setSimSpeed] = useState(5)
  const [simTime, setSimTime] = useState(0)
  const [phaseText, setPhaseText] = useState('Waiting for setup')
  const [statusText, setStatusText] = useState('Click Start Drawing to place supercontinent vertices.')
  const [lastGpmlFileName, setLastGpmlFileName] = useState('')
  const [isSavingGpml, setIsSavingGpml] = useState(false)
  const [uiVersion, setUiVersion] = useState(0)
  const [stats, setStats] = useState({
    plates: 0,
    subzones: 0,
    rifts: 0,
    collisions: 0,
    cratons: 0,
    plumes: 0,
    sutures: 0
  })

  const bumpUi = () => setUiVersion((v) => v + 1)

  const closePolygon = (lats, lons) => {
    const result = {
      lats: [...lats],
      lons: [...lons]
    }

    if (result.lats.length < 3 || result.lons.length < 3) {
      return result
    }

    const lastIdx = result.lats.length - 1
    const isClosed =
      Math.abs(result.lats[0] - result.lats[lastIdx]) < 1e-6 &&
      Math.abs(result.lons[0] - result.lons[lastIdx]) < 1e-6

    if (!isClosed) {
      result.lats.push(result.lats[0])
      result.lons.push(result.lons[0])
    }

    return result
  }

  const stripClosedPolygon = (polygon) => {
    if (!polygon || polygon.lats.length === 0 || polygon.lons.length === 0) {
      return { lats: [], lons: [] }
    }

    const lats = [...polygon.lats]
    const lons = [...polygon.lons]

    if (lats.length > 1) {
      const last = lats.length - 1
      const isClosed =
        Math.abs(lats[0] - lats[last]) < 1e-6 &&
        Math.abs(lons[0] - lons[last]) < 1e-6
      if (isClosed) {
        lats.pop()
        lons.pop()
      }
    }

    return { lats, lons }
  }

  const escapeXml = (value) => {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const polygonToGpmlPosList = (polygon) => {
    const closed = closePolygon(polygon.lats, polygon.lons)
    const count = Math.min(closed.lats.length, closed.lons.length)
    const pairs = []
    for (let i = 0; i < count; ++i) {
      pairs.push(`${closed.lons[i].toFixed(6)} ${closed.lats[i].toFixed(6)}`)
    }
    return pairs.join(' ')
  }

  const buildGpmlFeatureXml = ({ id, name, role, plateId, polygon }) => {
    return `
    <gpml:featureMember>
      <gpml:UnclassifiedFeature gml:id="${escapeXml(id)}">
        <gpml:name>${escapeXml(name)}</gpml:name>
        <gpml:description>${escapeXml(role)}</gpml:description>
        <gpml:reconstructionPlateId>${plateId}</gpml:reconstructionPlateId>
        <gpml:validTime>
          <gpml:TimePeriod>
            <gpml:begin>0.0</gpml:begin>
            <gpml:end>1000.0</gpml:end>
          </gpml:TimePeriod>
        </gpml:validTime>
        <gpml:geometry>
          <gml:Polygon srsName="urn:ogc:def:crs:EPSG::4326">
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList>${polygonToGpmlPosList(polygon)}</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </gpml:geometry>
      </gpml:UnclassifiedFeature>
    </gpml:featureMember>`
  }

  const buildGpmlRiftFeatureXml = ({ id, name, role, plateId, coordinates }) => {
    const posList = coordinates.map(([lon, lat]) => `${lon.toFixed(6)} ${lat.toFixed(6)}`).join(' ')
    return `
    <gpml:featureMember>
      <gpml:UnclassifiedFeature gml:id="${escapeXml(id)}">
        <gpml:name>${escapeXml(name)}</gpml:name>
        <gpml:description>${escapeXml(role)}</gpml:description>
        <gpml:reconstructionPlateId>${plateId}</gpml:reconstructionPlateId>
        <gpml:validTime>
          <gpml:TimePeriod>
            <gpml:begin>0.0</gpml:begin>
            <gpml:end>1000.0</gpml:end>
          </gpml:TimePeriod>
        </gpml:validTime>
        <gpml:geometry>
          <gml:LineString srsName="urn:ogc:def:crs:EPSG::4326">
            <gml:posList>${posList}</gml:posList>
          </gml:LineString>
        </gpml:geometry>
      </gpml:UnclassifiedFeature>
    </gpml:featureMember>`
  }

  const buildGpmlDocument = (supercontinentPolygon, cratonPolygons, riftCoordinates = []) => {
    const nowIso = new Date().toISOString()

    const featureBlocks = [
      buildGpmlFeatureXml({
        id: 'feature-supercontinent-1',
        name: 'Supercontinent',
        role: 'supercontinent-outline',
        plateId: 0,
        polygon: supercontinentPolygon
      })
    ]

    for (let i = 0; i < cratonPolygons.length; ++i) {
      const craton = cratonPolygons[i]
      featureBlocks.push(
        buildGpmlFeatureXml({
          id: `feature-craton-${i + 1}`,
          name: craton.name || `Craton ${i + 1}`,
          role: 'craton-polygon',
          plateId: 0,
          polygon: craton
        })
      )
    }

    if (riftCoordinates.length >= 2) {
      featureBlocks.push(
        buildGpmlRiftFeatureXml({
          id: 'feature-rift-1',
          name: 'Auto-generated Rift',
          role: 'rift-line',
          plateId: 0,
          coordinates: riftCoordinates
        })
      )
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpml:FeatureCollection
  xmlns:gpml="http://www.gplates.org/gplates"
  xmlns:gml="http://www.opengis.net/gml"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.gplates.org/gplates gpml.xsd">
  <gpml:metadata>
    <gpml:creator>GeoForge manual export</gpml:creator>
    <gpml:created>${escapeXml(nowIso)}</gpml:created>
  </gpml:metadata>
${featureBlocks.join('\n')}
</gpml:FeatureCollection>
`
  }

  const exportCurrentGpml = async (options = {}) => {
    const { setStatus = true } = options

    const activeSupercontinent = getCurrentSupercontinentPolygon()
    if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
      if (setStatus) {
        setStatusText('Draw and close a supercontinent polygon before exporting GPML.')
      }
      return null
    }

    const supercontinentClosed = closePolygon(activeSupercontinent.lats, activeSupercontinent.lons)
    const cratonsClosed = cratonPolygonsRef.current.map((craton) => ({
      ...craton,
      ...closePolygon(craton.lats, craton.lons)
    }))

    const gpml = buildGpmlDocument(supercontinentClosed, cratonsClosed, riftPathRef.current)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `gplates-input-${stamp}.gpml`

    setIsSavingGpml(true)
    try {
      const response = await fetch('/api/gpml/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName,
          gpmlContent: gpml
        })
      })

      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      if (!response.ok) {
        const message = payload?.error || 'Unable to save GPML in project.'
        throw new Error(message)
      }

      const savedName = payload?.fileName || fileName
      const currentPath = payload?.currentPath || '/gpml/current.gpml'
      setLastGpmlFileName(savedName)

      if (setStatus) {
        setStatusText(`Saved GPML to project at ${currentPath}.`)
      }

      return {
        fileName: savedName,
        currentPath,
        publicPath: payload?.publicPath || `/gpml/${savedName}`
      }
    } catch (error) {
      if (setStatus) {
        setStatusText(`Failed to save GPML in project: ${error?.message || error}`)
      }
      return null
    } finally {
      setIsSavingGpml(false)
    }
  }

  const getCurrentSupercontinentPolygon = () => {
    if (drawingPointsRef.current.lats.length >= 3) {
      return closePolygon(drawingPointsRef.current.lats, drawingPointsRef.current.lons)
    }
    if (supercontinentPolygonRef.current.lats.length >= 3) {
      return closePolygon(supercontinentPolygonRef.current.lats, supercontinentPolygonRef.current.lons)
    }
    return null
  }

  const latLonToUnitVector = (lat, lon) => {
    const latRad = (lat * Math.PI) / 180
    const lonRad = (lon * Math.PI) / 180
    return new THREE.Vector3(
      Math.cos(latRad) * Math.cos(lonRad),
      Math.sin(latRad),
      Math.cos(latRad) * Math.sin(lonRad)
    ).normalize()
  }

  const approximateCratonCenterRadius = (cratonPolygon) => {
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

    const lat = (Math.asin(centerVec.y) * 180) / Math.PI
    const lon = (Math.atan2(centerVec.z, centerVec.x) * 180) / Math.PI

    return {
      lat,
      lon,
      radiusDegrees: Math.max(1, (maxAngleRad * 180) / Math.PI)
    }
  }

  const isPointInsideSphericalPolygon = (lat, lon, polygon) => {
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

  const isPolygonInsidePolygon = (innerPolygon, outerPolygon) => {
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

  const setInteraction = (mode) => {
    interactionModeRef.current = mode
    setInteractionMode(mode)
    if (globeRef.current) {
      globeRef.current.setInteractionMode(mode)
    }
  }

  const syncDerivedUiState = () => {
    bumpUi()
  }

  const renderPolygonLayers = () => {
    const globe = globeRef.current
    if (!globe) return

    const activeSupercontinent = getCurrentSupercontinentPolygon()
    if (activeSupercontinent && activeSupercontinent.lats.length >= 4) {
      globe.drawPolygonOverlay(activeSupercontinent.lats, activeSupercontinent.lons, {
        lineColor: 0x8b7355,
        fillColor: 0x8b7355,
        fillOpacity: isSetupCompleteRef.current ? 0.2 : 0.28,
        radiusOffset: 0.003
      })
    }

    for (const craton of cratonPolygonsRef.current) {
      globe.drawPolygonOverlay(craton.lats, craton.lons, {
        lineColor: isSetupCompleteRef.current ? 0xffee58 : 0xffd54f,
        fillColor: 0xffc107,
        fillOpacity: isSetupCompleteRef.current ? 0.3 : 0.24,
        radiusOffset: isSetupCompleteRef.current ? 0.012 : 0.007
      })
    }

    if (riftPathRef.current.length >= 2) {
      const lons = riftPathRef.current.map(([lon]) => lon)
      const lats = riftPathRef.current.map(([, lat]) => lat)
      globe.drawRiftZone(lats, lons)
    }

    if (interactionModeRef.current === 'draw') {
      globe.drawDrawingPreview(drawingPointsRef.current.lats, drawingPointsRef.current.lons, {
        color: 0xffffff,
        fillOpacity: 0.16
      })
    } else if (interactionModeRef.current === 'mark') {
      globe.drawDrawingPreview(currentCratonDraftRef.current.lats, currentCratonDraftRef.current.lons, {
        color: 0xffd54f,
        fillOpacity: 0.22
      })
    } else {
      globe.clearDrawingPreview()
    }
  }

  const updateVisualization = () => {
    const sim = simRef.current
    const globe = globeRef.current
    if (!sim || !globe) return

    if (isSetupCompleteRef.current) {
      globe.updateFromSimulation(sim)
    } else {
      globe.clear()
    }

    renderPolygonLayers()

    const time = sim.getCurrentTime()
    setSimTime(time)
    setPhaseText(getCurrentPhase(time))
    setStats({
      plates: isSetupCompleteRef.current ? sim.getPlateCount() : 0,
      subzones: sim.getSubductionZoneCount(),
      rifts: Math.max(sim.getRiftZoneCount(), riftPathRef.current.length >= 2 ? 1 : 0),
      collisions: sim.getCollisionZoneCount(),
      cratons:
        isSetupCompleteRef.current && typeof sim.getCratonCount === 'function'
          ? sim.getCratonCount()
          : cratonPolygonsRef.current.length,
      plumes: typeof sim.getPlumeCount === 'function' ? sim.getPlumeCount() : 0,
      sutures: typeof sim.getSutureCount === 'function' ? sim.getSutureCount() : 0
    })
  }

  updateVisualizationRef.current = updateVisualization

  const resetSceneData = () => {
    drawingPointsRef.current = { lats: [], lons: [] }
    supercontinentPolygonRef.current = { lats: [], lons: [] }
    currentCratonDraftRef.current = { lats: [], lons: [] }
    cratonPolygonsRef.current = []
    riftPathRef.current = []
  }

  const startDrawing = () => {
    isPlayingRef.current = false
    setIsPlaying(false)

    isSetupCompleteRef.current = false
    setIsSetupComplete(false)

    resetSceneData()
    setInteraction('draw')
    setStatusText('Drawing supercontinent. Left-click to place vertices.')

    syncDerivedUiState()
    updateVisualizationRef.current()
  }

  const clearDrawing = () => {
    resetSceneData()
    isSetupCompleteRef.current = false
    setIsSetupComplete(false)
    setStatusText('Cleared polygons. Start drawing again.')

    syncDerivedUiState()
    updateVisualizationRef.current()
  }

  const startMarkingCratons = () => {
    const activeSupercontinent = getCurrentSupercontinentPolygon()
    if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
      setStatusText('Draw a valid supercontinent polygon first.')
      return
    }

    isSetupCompleteRef.current = false
    setIsSetupComplete(false)

    currentCratonDraftRef.current = { lats: [], lons: [] }
    setInteraction('mark')
    setStatusText('Marking cratons. Left-click to draw a craton polygon.')

    syncDerivedUiState()
    updateVisualizationRef.current()
  }

  const clearCurrentCratonDraft = () => {
    currentCratonDraftRef.current = { lats: [], lons: [] }
    setStatusText('Cleared current craton draft.')

    syncDerivedUiState()
    updateVisualizationRef.current()
  }

  const saveCurrentCratonPolygon = () => {
    if (currentCratonDraftRef.current.lats.length < 3) {
      setStatusText('Need at least 3 points to save a craton polygon.')
      return
    }

    const activeSupercontinent = getCurrentSupercontinentPolygon()
    if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
      setStatusText('No valid supercontinent available for containment check.')
      return
    }

    const closedDraft = closePolygon(currentCratonDraftRef.current.lats, currentCratonDraftRef.current.lons)
    const closedSupercontinent = closePolygon(activeSupercontinent.lats, activeSupercontinent.lons)

    if (!isPolygonInsidePolygon(closedDraft, closedSupercontinent)) {
      setStatusText('Craton polygon must be fully inside the supercontinent polygon.')
      return
    }

    cratonPolygonsRef.current.push({
      id: cratonPolygonsRef.current.length + 1,
      name: `Craton ${cratonPolygonsRef.current.length + 1}`,
      lats: closedDraft.lats,
      lons: closedDraft.lons
    })

    currentCratonDraftRef.current = { lats: [], lons: [] }
    setStatusText('Saved craton polygon.')

    syncDerivedUiState()
    updateVisualizationRef.current()
  }

  const finishSetup = async () => {
    const sim = simRef.current
    if (!sim) return

    const activeSupercontinent = getCurrentSupercontinentPolygon()
    if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
      setStatusText('Need a closed supercontinent polygon with at least 3 vertices.')
      return
    }

    const closed = closePolygon(activeSupercontinent.lats, activeSupercontinent.lons)
    supercontinentPolygonRef.current = closed
    drawingPointsRef.current = { lats: [...closed.lats], lons: [...closed.lons] }

    // If the user has an unfinished craton draft, commit it on finish when valid.
    if (currentCratonDraftRef.current.lats.length >= 3) {
      const closedDraft = closePolygon(currentCratonDraftRef.current.lats, currentCratonDraftRef.current.lons)
      if (isPolygonInsidePolygon(closedDraft, closed)) {
        cratonPolygonsRef.current.push({
          id: cratonPolygonsRef.current.length + 1,
          name: `Craton ${cratonPolygonsRef.current.length + 1}`,
          lats: closedDraft.lats,
          lons: closedDraft.lons
        })
      }
      currentCratonDraftRef.current = { lats: [], lons: [] }
    }

    sim.initSupercontinent(closed.lats, closed.lons)
    for (const polygon of cratonPolygonsRef.current) {
      const approx = approximateCratonCenterRadius(polygon)
      sim.addCraton(approx.lat, approx.lon, approx.radiusDegrees)
    }

    try {
      const plateCoords = closed.lats.map((lat, i) => [closed.lons[i], lat])
      const cratonCoords = cratonPolygonsRef.current.map((craton) =>
        craton.lats.map((lat, i) => [craton.lons[i], lat])
      )
      riftPathRef.current = generateRiftPath(plateCoords, cratonCoords, {
        resolutionDeg: 1.0,
        zigzagAmplitude: 2.0,
        zigzagInterval: 4
      })
    } catch {
      riftPathRef.current = []
    }

    setInteraction('navigate')

    isSetupCompleteRef.current = true
    setIsSetupComplete(true)

    const exported = await exportCurrentGpml({ setStatus: false })
    if (exported) {
      setStatusText(
        `Setup complete. Saved GPML in project at ${exported.currentPath} with supercontinent + ${cratonPolygonsRef.current.length} cratons${riftPathRef.current.length >= 2 ? ' + rift path' : ''}.`
      )
    } else {
      setStatusText('Setup complete. Manual mode active (no tectonic simulation).')
    }

    syncDerivedUiState()
    updateVisualizationRef.current()
  }

  const resetSimulation = () => {
    const sim = simRef.current
    if (!sim) return

    sim.reset()
    isPlayingRef.current = false
    setIsPlaying(false)

    isSetupCompleteRef.current = false
    setIsSetupComplete(false)

    setInteraction('navigate')
    if (globeRef.current) {
      globeRef.current.resetView()
      globeRef.current.clearHeuristicMarker()
    }

    // Clear planet canvas
    const planetCanvas = document.getElementById('planet-canvas')
    if (planetCanvas) {
      const ctx = planetCanvas.getContext('2d')
      ctx.clearRect(0, 0, planetCanvas.width, planetCanvas.height)
      
      // Reset globe material to default
      if (globeRef.current) {
        globeRef.current.resetGlobeMaterial()
      }
    }

    resetSceneData()
    setSimTime(0)
    setPhaseText('Waiting for setup')
    setStatusText('Simulation reset. Draw a supercontinent to begin again.')

    syncDerivedUiState()
    updateVisualizationRef.current()
  }

  const jumpToTime = (value) => {
    const sim = simRef.current
    if (!sim) return

    const targetTime = parseFloat(value)
    const currentTime = sim.getCurrentTime()
    const dt = targetTime - currentTime

    if (Math.abs(dt) > 0.05) {
      sim.step(dt)
      updateVisualizationRef.current()
    }
  }

  const hasSupercontinent = useMemo(() => {
    const poly = getCurrentSupercontinentPolygon()
    return !!poly && poly.lats.length >= 4
  }, [uiVersion])

  const hasCratonDraft = useMemo(() => {
    return currentCratonDraftRef.current.lats.length > 0
  }, [uiVersion])

  const canSaveCraton = useMemo(() => {
    return interactionMode === 'mark' && currentCratonDraftRef.current.lats.length >= 3
  }, [interactionMode, uiVersion])

  const outlinerRows = useMemo(() => {
    const rows = []
    const activeSupercontinent = getCurrentSupercontinentPolygon()

    if (activeSupercontinent && activeSupercontinent.lats.length >= 4) {
      const ring = stripClosedPolygon(activeSupercontinent)
      rows.push({
        key: 'supercontinent',
        color: '#9a8055',
        label: 'Supercontinent',
        meta: `${ring.lats.length} vertices • ${isSetupComplete ? 'committed' : 'draft'}`
      })
    }

    for (const craton of cratonPolygonsRef.current) {
      const ring = stripClosedPolygon(craton)
      rows.push({
        key: `craton-${craton.id}`,
        color: '#ffcf55',
        label: craton.name,
        meta: `${ring.lats.length} vertices • inside supercontinent`
      })
    }

    if (currentCratonDraftRef.current.lats.length >= 2) {
      const draftRing = stripClosedPolygon(
        closePolygon(currentCratonDraftRef.current.lats, currentCratonDraftRef.current.lons)
      )
      rows.push({
        key: 'craton-draft',
        color: '#ffe082',
        label: 'Craton Draft',
        meta: `${draftRing.lats.length} vertices • unsaved`
      })
    }

    return rows
  }, [uiVersion, isSetupComplete])

  onCanvasClickRef.current = (event) => {
    if (!globeRef.current) return
    if (interactionModeRef.current === 'navigate') return

    if (globeRef.current.consumeDragFlag()) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const ndcX = (2 * x) / rect.width - 1
    const ndcY = 1 - (2 * y) / rect.height

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, globeRef.current.camera)

    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1)
    const point = raycaster.ray.intersectSphere(sphere, new THREE.Vector3())
    if (!point) return

    const lat = (Math.asin(point.y) * 180) / Math.PI
    const lon = (Math.atan2(point.z, point.x) * 180) / Math.PI

    if (interactionModeRef.current === 'draw') {
      drawingPointsRef.current.lats.push(lat)
      drawingPointsRef.current.lons.push(lon)
      setStatusText(`Supercontinent point added (${lat.toFixed(1)}, ${lon.toFixed(1)}).`)
    } else if (interactionModeRef.current === 'mark') {
      currentCratonDraftRef.current.lats.push(lat)
      currentCratonDraftRef.current.lons.push(lon)
      setStatusText(`Craton point added (${lat.toFixed(1)}, ${lon.toFixed(1)}).`)
    }

    syncDerivedUiState()
    updateVisualizationRef.current()
  }

  useEffect(() => {
    
    let cancelled = false

    simRef.current = createManualSimulationStub()

    if (canvasRef.current && !globeRef.current) {
      globeRef.current = new GlobeVisualization(canvasRef.current)
      globeRef.current.setInteractionMode('navigate')
    }

    setIsLoaded(true)
    setStatusText('Manual mode ready. Tectonics engine files are archived.')
    updateVisualizationRef.current()

    const clickHandler = (event) => onCanvasClickRef.current(event)
    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('click', clickHandler)
    }

    return () => {
      cancelled = true
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      if (canvas) {
        canvas.removeEventListener('click', clickHandler)
      }
    }
  }, [])

  const onSpeedChange = (value) => {
    const parsed = parseFloat(value)
    simSpeedRef.current = parsed
    setSimSpeed(parsed)
  }

  // Calculate heuristic candidate location based on existing continents/cratons
  const calculateHeuristicCandidate = () => {
    const continent = supercontinentPolygonRef.current
    const cratons = cratonPolygonsRef.current

    if (!continent.lats || continent.lats.length < 3) {
      return null
    }

    // Compute continent centroid
    const centroidLat = continent.lats.reduce((a, b) => a + b, 0) / continent.lats.length
    const centroidLon = continent.lons.reduce((a, b) => a + b, 0) / continent.lons.length

    // Get bounding box
    const minLat = Math.min(...continent.lats)
    const maxLat = Math.max(...continent.lats)
    const minLon = Math.min(...continent.lons)
    const maxLon = Math.max(...continent.lons)

    let bestScore = -Infinity
    let bestLat = centroidLat
    let bestLon = centroidLon

    // Grid search over continent interior (every ~2 degrees)
    const step = 2.0
    for (let lat = minLat; lat <= maxLat; lat += step) {
      for (let lon = minLon; lon <= maxLon; lon += step) {
        // Check if point is inside supercontinent
        const inSuper = pointInPoly(lat, lon, continent.lats, continent.lons)
        if (!inSuper) continue

        // Check if point is inside any craton (avoid those)
        let inCraton = false
        for (const craton of cratons) {
          if (pointInPoly(lat, lon, craton.lats, craton.lons)) {
            inCraton = true
            break
          }
        }
        if (inCraton) continue

        // Score based on latitude (equatorial plume zones) and distance from cratons
        const latBonus = Math.cos((Math.abs(lat) * Math.PI) / 180) // Peak at equator
        let craton_dist = Infinity
        for (const craton of cratons) {
          for (let i = 0; i < craton.lats.length; i++) {
            const d = Math.sqrt(
              (lat - craton.lats[i]) ** 2 + (lon - craton.lons[i]) ** 2
            )
            craton_dist = Math.min(craton_dist, d)
          }
        }
        const craton_bonus = Math.min(craton_dist / 10, 0.5) // Reward for proximity to craton edges
        const score = latBonus * 0.6 + craton_bonus * 0.4

        if (score > bestScore) {
          bestScore = score
          bestLat = lat
          bestLon = lon
        }
      }
    }

    return { lat: bestLat, lon: bestLon, score: bestScore }
  }

  const pointInPoly = (lat, lon, lats, lons) => {
    let inside = false
    const n = lats.length
    let j = n - 1
    for (let i = 0; i < n; i++) {
      const xi = lons[i], yi = lats[i]
      const xj = lons[j], yj = lats[j]
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
      j = i
    }
    return inside
  }

  const onPlay = () => {
  if (!isSetupCompleteRef.current) {
    setStatusText('Finish setup before playing the simulation.')
    return
  }

  // Calculate and display heuristic candidate
  const candidate = calculateHeuristicCandidate()
  if (candidate && globeRef.current) {
    globeRef.current.drawHeuristicCandidate(candidate.lat, candidate.lon, 0xff0000)
    setStatusText(`Heuristic rift candidate identified at (${candidate.lat.toFixed(1)}°, ${candidate.lon.toFixed(1)}°)`)
  }

  // Only generate planet on client-side (use fixed seed to avoid mismatch)
  if (typeof window !== 'undefined') {
    const planetCanvas = document.getElementById('planet-canvas')
    if (planetCanvas) {
      planetCanvas.width = WIDTH
      planetCanvas.height = HEIGHT
      // Use a fixed seed based on continent data, not Date.now()
      const seed = (supercontinentPolygonRef.current?.lats?.length || 1) * 12345
      const lats = supercontinentPolygonRef.current?.lats || []
      const lons = supercontinentPolygonRef.current?.lons || []
      generatePlanet(seed, lats, lons)
      renderPlanetToCanvas(planetCanvas)
      
      // Apply the generated texture to the 3D globe
      if (globeRef.current) {
        globeRef.current.applyCelestialTexture(planetCanvas)
      }
    }
  }

  isPlayingRef.current = false
  setIsPlaying(false)
}

  const onPause = () => {
    isPlayingRef.current = false
    setIsPlaying(false)
  }

  return (
    <div className='app-shell'>
      <canvas ref={canvasRef} id='canvas' />
      <canvas 
  id='planet-canvas' 
  style={{
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    border: '2px solid #00ff00',
    width: '256px',
    height: '128px',
    zIndex: 100
  }}
/>

      {!isLoaded && <div className='loading-overlay'>Loading manual workspace...</div>}

      <div id='ui-overlay'>
        <section className='panel controls-panel'>
          <header className='panel-header'>
            <h2>
              <Layers size={16} />
              Simulation Controls
            </h2>
            <div className={`mode-pill mode-${interactionMode}`}>
              {interactionMode === 'navigate' && <Compass size={14} />}
              {interactionMode === 'draw' && <PencilLine size={14} />}
              {interactionMode === 'mark' && <MapPin size={14} />}
              <span>
                {interactionMode === 'navigate' && 'Navigate'}
                {interactionMode === 'draw' && 'Draw Supercontinent'}
                {interactionMode === 'mark' && 'Mark Cratons'}
              </span>
            </div>
          </header>

          <div className='control-section'>
            <h3>Step 1: Draw Supercontinent</h3>
            <div className='btn-row'>
              <button className='btn' onClick={startDrawing}>
                <PencilLine size={14} />
                Start Drawing
              </button>
              <button className='btn btn-subtle' onClick={clearDrawing}>
                <Trash2 size={14} />
                Clear
              </button>
            </div>
          </div>

          <div className='control-section'>
            <h3>Step 2: Mark Cratons</h3>
            <button className='btn' onClick={startMarkingCratons} disabled={!hasSupercontinent}>
              <MapPin size={14} />
              Mark Cratons
            </button>
            <div className='btn-row'>
              <button className='btn' onClick={saveCurrentCratonPolygon} disabled={!canSaveCraton}>
                <Save size={14} />
                Save Draft
              </button>
              <button
                className='btn btn-subtle'
                onClick={clearCurrentCratonDraft}
                disabled={interactionMode !== 'mark' || !hasCratonDraft}
              >
                <Trash2 size={14} />
                Clear Draft
              </button>
            </div>
            <button className='btn btn-accent' onClick={finishSetup} disabled={!hasSupercontinent}>
              <CheckCircle2 size={14} />
              Finish Setup
            </button>
            <button
              className='btn btn-subtle'
              onClick={() => {
                void exportCurrentGpml()
              }}
              disabled={!hasSupercontinent || isSavingGpml}
            >
              <Save size={14} />
              {isSavingGpml ? 'Saving GPML...' : 'Save GPML In Project'}
            </button>
            {lastGpmlFileName && <div className='hint'>Saved: /gpml/{lastGpmlFileName} (current: /gpml/current.gpml)</div>}
          </div>

          <div className='control-section'>
            <h3>Simulation</h3>
            <label className='slider-label'>Speed: {simSpeed.toFixed(1)} Myr/frame</label>
            <input
              type='range'
              min='0.5'
              max='50'
              step='0.5'
              value={simSpeed}
              onChange={(e) => onSpeedChange(e.target.value)}
            />
            <div className='btn-row'>
              <button className='btn' onClick={onPlay} disabled={!isSetupComplete || isPlaying}>
                <Play size={14} />
                Play
              </button>
              <button className='btn' onClick={onPause} disabled={!isSetupComplete || !isPlaying}>
                <Pause size={14} />
                Pause
              </button>
              <button className='btn btn-subtle' onClick={resetSimulation}>
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
          </div>

          <div className='status-box'>
            <Circle size={12} />
            <span>{statusText}</span>
          </div>
        </section>

        <aside className='right-stack'>
          <section className='panel data-panel'>
            <h2>
              <Eye size={16} />
              Tectonic Data
            </h2>
            <div className='stats-grid'>
              <div>
                Time <strong>{simTime.toFixed(1)} Mya</strong>
              </div>
              <div>
                Phase <strong>{phaseText}</strong>
              </div>
              <div>
                Plates <strong>{stats.plates}</strong>
              </div>
              <div>
                Subduction <strong>{stats.subzones}</strong>
              </div>
              <div>
                Rift Zones <strong>{stats.rifts}</strong>
              </div>
              <div>
                Collisions <strong>{stats.collisions}</strong>
              </div>
              <div>
                Cratons <strong>{stats.cratons}</strong>
              </div>
              <div>
                Plumes/Sutures <strong>{stats.plumes} / {stats.sutures}</strong>
              </div>
            </div>
          </section>

          <section className='panel view-panel'>
            <h2>
              <Compass size={16} />
              View Controls
            </h2>
            <div className='hint'>
              Navigate: left drag. Draw mode: right or middle drag, or Shift + left drag.
            </div>
            <div className='nav-grid'>
              <button className='btn-icon' onClick={() => globeRef.current?.nudgeView(0, 1)}>
                <MoveUp size={15} />
              </button>
              <button className='btn-icon' onClick={() => globeRef.current?.resetView()}>
                <RotateCcw size={15} />
              </button>
              <button className='btn-icon' onClick={() => globeRef.current?.zoomBy(-0.14)}>
                <ZoomIn size={15} />
              </button>

              <button className='btn-icon' onClick={() => globeRef.current?.nudgeView(-1, 0)}>
                <MoveLeft size={15} />
              </button>
              <button className='btn-icon' onClick={() => globeRef.current?.resetPitch()}>
                <Compass size={15} />
              </button>
              <button className='btn-icon' onClick={() => globeRef.current?.nudgeView(1, 0)}>
                <MoveRight size={15} />
              </button>

              <button className='btn-icon' onClick={() => globeRef.current?.nudgeView(0, -1)}>
                <MoveDown size={15} />
              </button>
              <button className='btn-icon' onClick={() => globeRef.current?.zoomBy(0.14)}>
                <ZoomOut size={15} />
              </button>
              <button className='btn-icon' onClick={() => globeRef.current?.resetView()}>
                <Eye size={15} />
              </button>
            </div>
          </section>

          <section className='panel outliner-panel'>
            <h2>
              <Layers size={16} />
              Polygon Outliner
            </h2>
            <div className='outliner-list'>
              {outlinerRows.length === 0 && <div className='outliner-empty'>No polygons yet. Draw supercontinent first.</div>}
              {outlinerRows.map((row) => (
                <div className='outliner-item' key={row.key}>
                  <span className='outliner-color' style={{ backgroundColor: row.color }} />
                  <div className='outliner-copy'>
                    <div className='outliner-title'>{row.label}</div>
                    <div className='outliner-meta'>{row.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className='panel playback-panel'>
            <h2>
              <Clock3 size={16} />
              Time Control
            </h2>
            <div className='time-readout'>{simTime.toFixed(1)} Mya</div>
            <input
              type='range'
              min='0'
              max={Math.max(1000, simTime + 100)}
              value={simTime}
              step='1'
              onChange={(e) => jumpToTime(e.target.value)}
            />
          </section>
        </aside>
      </div>
    </div>
  )
}
