import * as THREE from 'three'

/**
 * 3D Globe visualization using Three.js
 * Displays plates, continents, subduction zones, rifts, and collisions
 */
export class GlobeVisualization {
  constructor(canvas) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })

    // Camera orbit state for left-drag navigation.
    this.cameraDistance = 2.5
    this.cameraYaw = 0
    this.cameraPitch = 0
    this.isDragging = false
    this.didDrag = false
    this.lastPointerX = 0
    this.lastPointerY = 0
    this.rotateSpeed = 0.005
    this.nudgeStep = 0.18
    this.interactionMode = 'navigate'
    this.surfaceRadius = 1.002
    this.previewRadius = 1.01
    this.maxArcStepRad = THREE.MathUtils.degToRad(2)
    this.minCameraDistance = 1.25
    this.maxCameraDistance = 7.5

    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setClearColor(0x0a0e27, 1)
    this.renderer.sortObjects = true
    this.updateCameraPosition()
    
    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, 0.8)
    light.position.set(5, 3, 5)
    this.scene.add(light)
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambientLight)
    
    // Globe base (sphere)
    const globeGeometry = new THREE.SphereGeometry(1, 64, 64)
    const globeMaterial = new THREE.MeshPhongMaterial({
      color: 0x2a4a7c,
      shininess: 5
    })
    this.globe = new THREE.Mesh(globeGeometry, globeMaterial)
    this.scene.add(this.globe)
    
    // Container for tectonic features
    this.tectonicsGroup = new THREE.Group()
    this.scene.add(this.tectonicsGroup)

    // Separate overlay group for in-progress drawing previews.
    this.previewGroup = new THREE.Group()
    this.scene.add(this.previewGroup)
    
    // Store visualization objects
    this.continents = []
    this.subductionZones = []
    this.volcanicArcs = []
    this.riftZones = []
    this.collisionZones = []
    this.mountainRanges = []
    this.sutureZones = []
    this.boundaryLines = []
    this.plumeMarkers = []
    this.craton_markers = []

    // Mouse drag navigation.
    this.canvas.style.cursor = 'grab'
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault())
    this.canvas.addEventListener('mousedown', this.onMouseDown)
    this.canvas.addEventListener('wheel', this.onMouseWheel, { passive: false })
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('keydown', this.onKeyDown)
    
    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize())
    
    this.animate()
  }

  onMouseDown = (event) => {
    const inDrawMode = this.interactionMode === 'draw' || this.interactionMode === 'mark'
    const canPanInDrawMode = event.button === 1 || event.button === 2 || (event.button === 0 && (event.shiftKey || event.altKey))
    const canPanInNavigateMode = event.button === 0 || event.button === 1 || event.button === 2

    if ((inDrawMode && !canPanInDrawMode) || (!inDrawMode && !canPanInNavigateMode)) {
      return
    }

    if (event.button === 2) {
      event.preventDefault()
    }

    this.isDragging = true
    this.didDrag = false
    this.lastPointerX = event.clientX
    this.lastPointerY = event.clientY
    this.canvas.style.cursor = 'grabbing'
  }

  onMouseMove = (event) => {
    if (!this.isDragging) return

    const dx = event.clientX - this.lastPointerX
    const dy = event.clientY - this.lastPointerY

    if (Math.abs(dx) + Math.abs(dy) > 1) {
      this.didDrag = true
    }

    this.cameraYaw -= dx * this.rotateSpeed
    this.cameraPitch += dy * this.rotateSpeed
    this.cameraPitch = Math.max(-1.35, Math.min(1.35, this.cameraPitch))
    this.updateCameraPosition()

    this.lastPointerX = event.clientX
    this.lastPointerY = event.clientY
  }

  onMouseUp = (event) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
    this.isDragging = false
    this.canvas.style.cursor = (this.interactionMode === 'draw' || this.interactionMode === 'mark') ? 'crosshair' : 'grab'
  }

  setInteractionMode(mode) {
    this.interactionMode = mode
    if (!this.isDragging) {
      this.canvas.style.cursor = (mode === 'draw' || mode === 'mark') ? 'crosshair' : 'grab'
    }
  }

  onMouseWheel = (event) => {
    event.preventDefault()
    // Negative deltaY zooms in, positive zooms out.
    this.zoomBy(event.deltaY * 0.0012)
  }

  onKeyDown = (event) => {
    if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
      return
    }

    if (event.key === '+' || event.key === '=') {
      this.zoomBy(-0.14)
    } else if (event.key === '-' || event.key === '_') {
      this.zoomBy(0.14)
    } else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
      this.nudgeView(-1, 0)
    } else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
      this.nudgeView(1, 0)
    } else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
      this.nudgeView(0, 1)
    } else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
      this.nudgeView(0, -1)
    } else if (event.key.toLowerCase() === 'r') {
      this.resetView()
    }
  }

  zoomBy(amount) {
    const scale = 1 + amount
    const safeScale = Math.max(0.5, Math.min(1.5, scale))
    this.cameraDistance = THREE.MathUtils.clamp(
      this.cameraDistance * safeScale,
      this.minCameraDistance,
      this.maxCameraDistance
    )
    this.updateCameraPosition()
  }

  nudgeView(yawSteps, pitchSteps) {
    this.cameraYaw += yawSteps * this.nudgeStep
    this.cameraPitch += pitchSteps * this.nudgeStep
    this.cameraPitch = Math.max(-1.35, Math.min(1.35, this.cameraPitch))
    this.updateCameraPosition()
  }

  resetPitch() {
    this.cameraPitch = 0
    this.updateCameraPosition()
  }

  resetView() {
    this.cameraDistance = 2.5
    this.cameraYaw = 0
    this.cameraPitch = 0
    this.updateCameraPosition()
  }

  updateCameraPosition() {
    const cosPitch = Math.cos(this.cameraPitch)
    this.camera.position.set(
      this.cameraDistance * Math.sin(this.cameraYaw) * cosPitch,
      this.cameraDistance * Math.sin(this.cameraPitch),
      this.cameraDistance * Math.cos(this.cameraYaw) * cosPitch
    )
    this.camera.lookAt(0, 0, 0)
  }

  consumeDragFlag() {
    const wasDragged = this.didDrag
    this.didDrag = false
    return wasDragged
  }
  
  onWindowResize() {
    const width = window.innerWidth
    const height = window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }
  
  /**
   * Convert lat/lon degrees to 3D point on sphere
   */
  latLonToXYZ(lat, lon) {
    const latRad = lat * Math.PI / 180
    const lonRad = lon * Math.PI / 180

    const x = Math.cos(latRad) * Math.cos(lonRad)
    const y = Math.sin(latRad)
    const z = Math.cos(latRad) * Math.sin(lonRad)
    
    return new THREE.Vector3(x, y, z)
  }

  stripClosingDuplicate(points) {
    if (!points || points.length === 0) return []
    if (points.length === 1) return [points[0].clone()]

    const result = points.map((p) => p.clone())
    const first = result[0]
    const last = result[result.length - 1]
    if (first.distanceToSquared(last) < 1e-10) {
      result.pop()
    }
    return result
  }

  slerpOnSphere(a, b, t, radius) {
    const aN = a.clone().normalize()
    const bN = b.clone().normalize()
    const dot = THREE.MathUtils.clamp(aN.dot(bN), -1, 1)

    if (dot > 0.9995) {
      return aN.lerp(bN, t).normalize().multiplyScalar(radius)
    }

    const theta = Math.acos(dot)
    const sinTheta = Math.sin(theta)
    const wA = Math.sin((1 - t) * theta) / sinTheta
    const wB = Math.sin(t * theta) / sinTheta
    return aN.multiplyScalar(wA).add(bN.multiplyScalar(wB)).normalize().multiplyScalar(radius)
  }

  tessellateGreatCircle(points, closed, radius) {
    if (!points || points.length === 0) return []

    const ring = this.stripClosingDuplicate(points)
    if (ring.length === 0) return []
    if (ring.length === 1) return [ring[0].clone().normalize().multiplyScalar(radius)]

    const result = []
    const segmentCount = closed ? ring.length : ring.length - 1

    for (let i = 0; i < segmentCount; ++i) {
      const start = ring[i].clone().normalize()
      const end = ring[(i + 1) % ring.length].clone().normalize()
      const angle = Math.acos(THREE.MathUtils.clamp(start.dot(end), -1, 1))
      const subdivisions = Math.max(1, Math.ceil(angle / this.maxArcStepRad))

      if (i === 0) {
        result.push(start.clone().multiplyScalar(radius))
      }

      for (let step = 1; step <= subdivisions; ++step) {
        const t = step / subdivisions
        result.push(this.slerpOnSphere(start, end, t, radius))
      }
    }

    return result
  }

  drawSphericalLine(points, color, closed, targetGroup = this.tectonicsGroup, radius = this.surfaceRadius, depthTest = true) {
    const tessellated = this.tessellateGreatCircle(points, closed, radius)
    if (tessellated.length < 2) return null

    const geometry = new THREE.BufferGeometry().setFromPoints(tessellated)
    const material = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest })
    const line = closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material)
    targetGroup.add(line)
    return line
  }

  sphericalTrianglePoint(a, b, c, i, j, subdivisions, radius) {
    const u = i / subdivisions
    const v = j / subdivisions
    const w = 1 - u - v
    return new THREE.Vector3()
      .addScaledVector(a, w)
      .addScaledVector(b, u)
      .addScaledVector(c, v)
      .normalize()
      .multiplyScalar(radius)
  }

  appendSphericalTrianglePatch(a, b, c, radius, subdivisions, addVertex, indices) {
    for (let i = 0; i < subdivisions; ++i) {
      for (let j = 0; j < subdivisions - i; ++j) {
        const pA = this.sphericalTrianglePoint(a, b, c, i, j, subdivisions, radius)
        const pB = this.sphericalTrianglePoint(a, b, c, i + 1, j, subdivisions, radius)
        const pC = this.sphericalTrianglePoint(a, b, c, i, j + 1, subdivisions, radius)

        const iA = addVertex(pA)
        const iB = addVertex(pB)
        const iC = addVertex(pC)
        indices.push(iA, iB, iC)

        if (i + j < subdivisions - 1) {
          const pD = this.sphericalTrianglePoint(a, b, c, i + 1, j + 1, subdivisions, radius)
          const iD = addVertex(pD)
          indices.push(iB, iD, iC)
        }
      }
    }
  }

  sphericalAngle(a, b) {
    return Math.acos(THREE.MathUtils.clamp(a.clone().normalize().dot(b.clone().normalize()), -1, 1))
  }

  projectRingToLocal2D(ring) {
    const center = new THREE.Vector3()
    for (const point of ring) {
      center.add(point)
    }

    if (center.lengthSq() < 1e-12) {
      center.copy(ring[0])
    }
    center.normalize()

    const reference = Math.abs(center.y) < 0.95
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)

    const east = new THREE.Vector3().crossVectors(reference, center).normalize()
    const north = new THREE.Vector3().crossVectors(center, east).normalize()

    return ring.map((point) => new THREE.Vector2(point.dot(east), point.dot(north)))
  }
  
  /**
   * Draw a continent polygon
   */
  drawContinent(lats, lons, color = 0x8B7355) {
    if (lats.length === 0) return
    
    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    const ring = this.stripClosingDuplicate(points)
    if (ring.length < 2) return

    const line = this.drawSphericalLine(ring, color, true, this.tectonicsGroup, this.surfaceRadius)
    if (!line) return
    this.continents.push(line)
    
    // Also add a filled polygon on the sphere surface
    if (ring.length >= 3) {
      this.drawSurfacePolygon(ring, color, 0.3, this.tectonicsGroup, this.surfaceRadius)
    }
  }

  drawPolygonOverlay(lats, lons, options = {}) {
    if (!lats || !lons || lats.length < 2 || lons.length < 2) return

    const lineColor = options.lineColor ?? 0xffffff
    const fillColor = options.fillColor ?? lineColor
    const fillOpacity = options.fillOpacity ?? 0.2
    const radiusOffset = options.radiusOffset ?? 0.006
    const depthTest = options.depthTest ?? true

    const points = []
    const count = Math.min(lats.length, lons.length)
    for (let i = 0; i < count; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    const ring = this.stripClosingDuplicate(points)
    if (ring.length < 2) return

    this.drawSphericalLine(
      ring,
      lineColor,
      true,
      this.tectonicsGroup,
      this.surfaceRadius + radiusOffset,
      depthTest
    )

    if (ring.length >= 3 && fillOpacity > 0) {
      this.drawSurfacePolygon(
        ring,
        fillColor,
        fillOpacity,
        this.tectonicsGroup,
        this.surfaceRadius + radiusOffset
      )
    }
  }
  
  /**
   * Draw a polygon filled on the sphere surface
   */
  drawSurfacePolygon(points, color, opacity, targetGroup = this.tectonicsGroup, radius = this.surfaceRadius) {
    const ring = this.stripClosingDuplicate(points)
    if (ring.length < 3) return

    const normalisedRing = ring.map((p) => p.clone().normalize().multiplyScalar(radius))

    const contour2D = this.projectRingToLocal2D(normalisedRing)
    const triangles = THREE.ShapeUtils.triangulateShape(contour2D, [])
    if (!triangles || triangles.length === 0) return

    const positions = []
    const indices = []
    const addVertex = (v) => {
      const index = positions.length / 3
      positions.push(v.x, v.y, v.z)
      return index
    }

    for (const tri of triangles) {
      const a = normalisedRing[tri[0]]
      const b = normalisedRing[tri[1]]
      const c = normalisedRing[tri[2]]

      const maxEdgeAngle = Math.max(
        this.sphericalAngle(a, b),
        this.sphericalAngle(b, c),
        this.sphericalAngle(c, a)
      )
      const subdivisions = Math.max(1, Math.ceil(maxEdgeAngle / this.maxArcStepRad))
      this.appendSphericalTrianglePatch(a, b, c, radius, subdivisions, addVertex, indices)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    })

    const mesh = new THREE.Mesh(geometry, material)
    targetGroup.add(mesh)
  }

  drawDrawingPreview(lats, lons, options = {}) {
    this.clearDrawingPreview()

    if (!lats || lats.length === 0) return

    const color = options.color ?? 0xffffff
    const fillOpacity = options.fillOpacity ?? 0.2
    const markerColor = options.markerColor ?? color

    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    // Point markers
    const markerGeometry = new THREE.SphereGeometry(0.02, 10, 10)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: markerColor, depthTest: false })
    for (const p of points) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.position.copy(p.clone().normalize().multiplyScalar(this.previewRadius))
      marker.renderOrder = 1000
      this.previewGroup.add(marker)
    }

    // Always close preview polygon once 2+ points are present.
    if (points.length >= 2) {
      const line = this.drawSphericalLine(points, color, true, this.previewGroup, this.previewRadius, false)
      if (line) {
        line.renderOrder = 999
      }
    }

    if (points.length >= 3) {
      this.drawSurfacePolygon(points, color, fillOpacity, this.previewGroup, this.previewRadius)
    }
  }

  clearDrawingPreview() {
    while (this.previewGroup.children.length > 0) {
      this.previewGroup.remove(this.previewGroup.children[0])
    }
  }
  
  /**
   * Draw subduction zone (dark vibrant blue lines)
   */
  drawSubductionZone(lats, lons) {
    if (lats.length === 0) return
    
    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    const line = this.drawSphericalLine(points, 0x0a32d6, false, this.tectonicsGroup, this.surfaceRadius + 0.001)
    if (!line) return
    this.subductionZones.push(line)
  }

  drawVolcanicArc(lats, lons) {
    if (lats.length === 0) return

    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    const line = this.drawSphericalLine(points, 0xffcc44, false, this.tectonicsGroup, this.surfaceRadius + 0.002)
    if (!line) return
    this.volcanicArcs.push(line)
  }
  
  /**
   * Draw rift zone (neon red for active continental rifts)
   */
  drawRiftZone(lats, lons) {
    if (lats.length === 0) return
    
    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }
    
    const line = this.drawSphericalLine(points, 0xff1744, false, this.tectonicsGroup, this.surfaceRadius + 0.001)
    if (!line) return
    this.riftZones.push(line)
  }

  /**
   * Draw mid-ocean ridge (orange-yellow for seafloor spreading centers)
   */
  drawMidOceanRidge(lats, lons) {
    if (lats.length === 0) return

    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    const line = this.drawSphericalLine(points, 0xffa726, false, this.tectonicsGroup, this.surfaceRadius + 0.002)
    if (!line) return
    this.riftZones.push(line)
  }
  
  /**
   * Draw collision zone (red lines)
   */
  drawCollisionZone(lats, lons) {
    if (lats.length === 0) return
    
    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }
    
    const line = this.drawSphericalLine(points, 0xff0000, false, this.tectonicsGroup, this.surfaceRadius + 0.001)
    if (!line) return
    this.collisionZones.push(line)
  }

  drawMountainRange(lats, lons) {
    if (lats.length === 0) return

    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    const line = this.drawSphericalLine(points, 0xff88aa, false, this.tectonicsGroup, this.surfaceRadius + 0.004)
    if (!line) return
    this.mountainRanges.push(line)
  }

  drawBoundary(lats, lons) {
    if (lats.length === 0) return

    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    const line = this.drawSphericalLine(points, 0x66bbff, false, this.tectonicsGroup, this.surfaceRadius + 0.0004)
    if (!line) return
    this.boundaryLines.push(line)
  }

  drawSutureZone(lats, lons) {
    if (lats.length === 0) return

    const points = []
    for (let i = 0; i < lats.length; ++i) {
      points.push(this.latLonToXYZ(lats[i], lons[i]))
    }

    const line = this.drawSphericalLine(points, 0x9c6bff, false, this.tectonicsGroup, this.surfaceRadius + 0.003)
    if (!line) return
    this.sutureZones.push(line)
  }

  drawPlume(lat, lon, strength = 1) {
    const pos = this.latLonToXYZ(lat, lon).multiplyScalar(this.surfaceRadius + 0.012)
    const size = THREE.MathUtils.clamp(0.03 + strength * 0.02, 0.03, 0.08)
    const geometry = new THREE.SphereGeometry(size, 10, 10)
    const material = new THREE.MeshBasicMaterial({ color: 0xff4f3d })
    const marker = new THREE.Mesh(geometry, material)
    marker.position.copy(pos)
    this.tectonicsGroup.add(marker)
    this.plumeMarkers.push(marker)
  }
  
  /**
   * Draw craton marker (colored sphere)
   */
  drawCraton(lat, lon, color = 0xffff00) {
    const pos = this.latLonToXYZ(lat, lon).multiplyScalar(this.surfaceRadius + 0.01)
    const geometry = new THREE.SphereGeometry(0.05, 16, 16)
    const material = new THREE.MeshBasicMaterial({ color })
    const sphere = new THREE.Mesh(geometry, material)
    sphere.position.copy(pos)
    
    this.tectonicsGroup.add(sphere)
    this.craton_markers.push(sphere)
  }

  /**
   * Draw heuristic candidate marker (red dot overlay)
   */
  drawHeuristicCandidate(lat, lon, color = 0xff0000) {
    const pos = this.latLonToXYZ(lat, lon).multiplyScalar(this.surfaceRadius + 0.005)
    const geometry = new THREE.SphereGeometry(0.008, 12, 12)
    const material = new THREE.MeshBasicMaterial({ 
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      wireframe: false
    })
    const marker = new THREE.Mesh(geometry, material)
    marker.position.copy(pos)
    marker.renderOrder = 100
    this.scene.add(marker)
  }
  
  /**
   * Clear all visualization
   */
  clear() {
    while (this.tectonicsGroup.children.length > 0) {
      this.tectonicsGroup.remove(this.tectonicsGroup.children[0])
    }
    this.clearDrawingPreview()
    this.continents = []
    this.subductionZones = []
    this.volcanicArcs = []
    this.riftZones = []
    this.collisionZones = []
    this.mountainRanges = []
    this.sutureZones = []
    this.boundaryLines = []
    this.plumeMarkers = []
    this.craton_markers = []
  }
  
  /**
   * Update visualization from simulation state
   */
  updateFromSimulation(sim) {
    this.clear()
    
    const plateCount = sim.getPlateCount()
    
    for (let p = 0; p < plateCount; ++p) {
      // Draw all continents on this plate
      for (let c = 0; c < 10; ++c) {  // Max 10 continents per plate
        const lats = sim.getContinentLats(p, c)
        if (lats.length > 0) {
          const lons = sim.getContinentLons(p, c)
          // Color continents differently based on plate
          const color = 0x8B7355 + (p * 0x1111)
          this.drawContinent(lats, lons, color)
        }
      }
    }
    
    // Draw subduction zones (blue)
    const subductionCount = sim.getSubductionZoneCount()
    for (let s = 0; s < subductionCount; ++s) {
      const lats = sim.getSubductionZoneLats(s)
      if (lats.length > 0) {
        const lons = sim.getSubductionZoneLons(s)
        this.drawSubductionZone(lats, lons)
      }

      if (typeof sim.getSubductionVolcanicArcLats === 'function') {
        const arcLats = sim.getSubductionVolcanicArcLats(s)
        if (arcLats.length > 0) {
          const arcLons = sim.getSubductionVolcanicArcLons(s)
          this.drawVolcanicArc(arcLats, arcLons)
        }
      }
    }

    if (
      typeof sim.getRiftZoneCount === 'function' &&
      typeof sim.getRiftZoneLats === 'function' &&
      typeof sim.getRiftZoneLons === 'function'
    ) {
      const riftCount = sim.getRiftZoneCount()
      for (let r = 0; r < riftCount; ++r) {
        const lats = sim.getRiftZoneLats(r)
        if (lats.length > 0) {
          const lons = sim.getRiftZoneLons(r)
          // Draw oceanic rifts as mid-ocean ridges (orange), continental rifts as red
          if (typeof sim.isRiftZoneOceanic === 'function' && sim.isRiftZoneOceanic(r)) {
            this.drawMidOceanRidge(lats, lons)
          } else {
            this.drawRiftZone(lats, lons)
          }
        }
      }
    }

    if (
      typeof sim.getCollisionZoneCount === 'function' &&
      typeof sim.getCollisionZoneLats === 'function' &&
      typeof sim.getCollisionZoneLons === 'function'
    ) {
      const collisionCount = sim.getCollisionZoneCount()
      for (let c = 0; c < collisionCount; ++c) {
        const lats = sim.getCollisionZoneLats(c)
        if (lats.length > 0) {
          const lons = sim.getCollisionZoneLons(c)
          this.drawCollisionZone(lats, lons)
        }

        if (
          typeof sim.getMountainRangeLats === 'function' &&
          typeof sim.getMountainRangeLons === 'function'
        ) {
          const mLats = sim.getMountainRangeLats(c)
          if (mLats.length > 0) {
            const mLons = sim.getMountainRangeLons(c)
            this.drawMountainRange(mLats, mLons)
          }
        }
      }
    }

    // Boundary segments are kept internal for logic and not rendered by default to avoid UI clutter.

    if (
      typeof sim.getCratonCount === 'function' &&
      typeof sim.getCratonLat === 'function' &&
      typeof sim.getCratonLon === 'function'
    ) {
      // Cratons are only shown during setup, not during simulation playback
      // to avoid visual clutter with unlabeled dots
    }

    if (
      typeof sim.getSutureCount === 'function' &&
      typeof sim.getSutureZoneLats === 'function' &&
      typeof sim.getSutureZoneLons === 'function'
    ) {
      const sutureCount = sim.getSutureCount()
      for (let s = 0; s < sutureCount; ++s) {
        const lats = sim.getSutureZoneLats(s)
        if (lats.length > 0) {
          const lons = sim.getSutureZoneLons(s)
          this.drawSutureZone(lats, lons)
        }
      }
    }
  }
  
  /**
   * Start animation loop
   */
  animate = () => {
    requestAnimationFrame(this.animate)
    
    this.renderer.render(this.scene, this.camera)
  }
}
