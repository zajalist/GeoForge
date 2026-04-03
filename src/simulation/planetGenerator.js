/**
 * High-performance planetary rasterization for tectonic simulation
 * Uses Float32Array, Uint32Array, bitwise operations, and heuristic geophysics
 */

const WIDTH = 512
const HEIGHT = 256
const TOTAL_PIXELS = WIDTH * HEIGHT

// Pre-allocate data layers
const elevationMap = new Float32Array(TOTAL_PIXELS)
const temperatureMap = new Float32Array(TOTAL_PIXELS)
const moistureMap = new Float32Array(TOTAL_PIXELS)
const colorBuffer = new Uint32Array(TOTAL_PIXELS)

/**
 * Hash function for value noise - creates consistent pseudo-random values
 */
function hash(x, y, seed) {
  let h = seed + x * 73856093 ^ y * 19349663
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) & 2147483647) / 2147483647
}

/**
 * Interpolation function - smooth transitions between hash values
 */
function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

/**
 * Perlin-like value noise - creates coherent terrain
 */
function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi

  // Get corner values
  const n00 = hash(xi, yi, seed)
  const n10 = hash(xi + 1, yi, seed)
  const n01 = hash(xi, yi + 1, seed)
  const n11 = hash(xi + 1, yi + 1, seed)

  // Smooth interpolation
  const u = smoothstep(xf)
  const v = smoothstep(yf)

  // Bilinear interpolation
  const nx0 = n00 * (1 - u) + n10 * u
  const nx1 = n01 * (1 - u) + n11 * u
  return nx0 * (1 - v) + nx1 * v
}

/**
 * Simple seamless Perlin-like noise using sine/cosine
 * Fast approximation suitable for real-time (not true Perlin)
 */
function simplexNoise(x, y, seed = 0) {
  return valueNoise(x, y, seed)
}

/**
 * Fractional Brownian Motion (fBm) for elevation
 * Octaves = 6, Persistence = 0.5, Lacunarity = 2.0
 */
function fBmNoise(x, y, octaves = 5, persistence = 0.6, lacunarity = 2.0, seed = 0) {
  let amplitude = 1.0
  let frequency = 1.0
  let noiseValue = 0
  let maxAmplitude = 0

  for (let i = 0; i < octaves; i++) {
    noiseValue += valueNoise(x * frequency, y * frequency, seed + i) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }

  return Math.max(0, Math.min(1, noiseValue / maxAmplitude))
}

/**
 * Calculate temperature based on latitude (Y) and elevation lapse rate
 * Equator = hot, Poles = cold, High elevation = colder
 */
function calculateTemperature(y, elevation) {
  // Normalize y to [-1, 1] where -1 is north pole, 1 is south pole
  const normalizedY = (y / HEIGHT) * 2 - 1

  // Cosine curve: max 1.0 at equator (y=0), min -1.0 at poles
  const latitudeEffect = Math.cos(Math.abs(normalizedY) * Math.PI / 2)

  // Base temperature: range [0, 40°C] mapped from [-1, 1]
  let temperature = (latitudeEffect + 1) * 20 // 0-40°C range

  // Lapse rate: ~6.5°C per 1000m elevation
  // Assume 1.0 elevation = 4000m
  const lapseRate = elevation * 4000 * 0.0065
  temperature -= lapseRate

  return Math.max(-50, Math.min(50, temperature)) // Clamp to [-50, 50]°C
}

/**
 * Calculate moisture based on Hadley cell circulation
 * High at equator (0°), low at 30°, high again at 60°, low at poles
 */
function calculateMoisture(y) {
  // Normalize y to [0, 1]
  const normalizedY = y / HEIGHT

  // Convert to latitude [-90°, 90°]
  const latitude = (normalizedY * 2 - 1) * 90
  const absLat = Math.abs(latitude)

  // Hadley cell pattern: sine wave with peaks/troughs
  // High at equator (0°) and 60°, low at 30°
  const hadleyCell = Math.sin((latitude + 90) * Math.PI / 180)

  // Add secondary peak at 60° latitude
  const secondaryPeak = Math.exp(-Math.pow((absLat - 60) / 15, 2)) * 0.6

  const moisture = (hadleyCell + 1) * 0.5 + secondaryPeak
  return Math.max(0, Math.min(1, moisture))
}

/**
 * Biome classification based on Whittaker Diagram
 * Returns packed 32-bit RGBA color (0xAABBGGRR in little-endian)
 */
function getBiomeColor(elevation, temperature, moisture) {
  const oceanThreshold = 0.42

  // Ocean
  if (elevation < oceanThreshold) {
    return 0xFF1a527a // Deep blue (AABBGGRR format)
  }

  // Coastal/shallow water
  if (elevation < oceanThreshold + 0.05) {
    return 0xFF2980b9 // Light blue
  }

  // Beach/sand
  if (elevation < oceanThreshold + 0.1 && moisture < 0.3) {
    return 0xFFf4d03f // Sand yellow
  }

  // Snow/ice (high elevation, cold)
  if (elevation > 0.7 || temperature < -10) {
    return 0xFFffffff // White
  }

  // Tundra (cold, low moisture)
  if (temperature < 0 && moisture < 0.4) {
    return 0xFF9db4c4 // Light gray-blue
  }

  // Desert (hot, very dry)
  if (temperature > 20 && moisture < 0.2) {
    return 0xFFd4a574 // Tan/desert
  }

  // Savanna (warm, moderate moisture)
  if (temperature > 10 && moisture < 0.5) {
    return 0xFFc8b88b // Grassland tan
  }

  // Rainforest (warm, wet)
  if (temperature > 15 && moisture > 0.6) {
    return 0xFF27ae60 // Dark green
  }

  // Temperate forest (moderate temp/moisture)
  if (temperature > 5 && temperature < 20 && moisture > 0.4) {
    return 0xFF52be80 // Forest green
  }

  // Grassland/plains (moderate conditions)
  if (temperature > 10 && moisture > 0.3 && moisture < 0.6) {
    return 0xFF7cb342 // Light green
  }

  // Mountain/rocky (high elevation)
  if (elevation > 0.6) {
    return 0xFF8b7355 // Brown
  }

  // Default: temperate
  return 0xFF58d68d // Bright green
}

/**
 * Check if a point is inside a polygon using ray-casting algorithm
 */
function pointInPolygon(lat, lon, lats = [], lons = []) {
  if (lats.length < 3 || lons.length < 3) return false

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

/**
 * Create heatmap color based on temperature and elevation
 * Returns purple for supercontinent area
 */
function getHeatmapColor(temperature, elevation) {
  // Purple color for the supercontinent (format: 0xAARRGGBB)
  return 0xFFFF00FF // Purple (A=FF, R=FF, G=00, B=FF)
}

/**
 * Main rasterization loop - generates entire planet in one pass
 * Uses 1D indexing for cache efficiency
 * analyzes temperature and elevation within supercontinent boundary only
 */
function generatePlanet(seed = Math.random() * 10000, supercontinentLats = [], supercontinentLons = []) {
  
  // ===== PASS 1: Generate elevation via fBm =====
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const x = i % WIDTH
    const y = Math.floor(i / WIDTH)

    // Normalize to [0, 1] tile space (allows seamless wrapping)
    const tileX = (x / WIDTH) * 2 // Larger, clearer continents
    const tileY = (y / HEIGHT) * 2

    elevationMap[i] = fBmNoise(tileX, tileY, 5, 0.6, 2.0, seed)
  }

  // ===== PASS 2: Calculate temperature and moisture =====
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const y = Math.floor(i / WIDTH)

    temperatureMap[i] = calculateTemperature(y, elevationMap[i])
    moistureMap[i] = calculateMoisture(y)
  }

  // ===== PASS 3: Classify biomes based on supercontinent boundary =====
  let insideCount = 0
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const x = i % WIDTH
    const y = Math.floor(i / WIDTH)
    
    // Convert pixel coords to lat/lon for boundary checking
    const lat = (y / HEIGHT) * 180 - 90
    const lon = (x / WIDTH) * 360 - 180

    const elevation = elevationMap[i]
    const temperature = temperatureMap[i]
    const moisture = moistureMap[i]

    // Check if pixel is inside supercontinent
    const insideContinent = pointInPolygon(lat, lon, supercontinentLats, supercontinentLons)
    if (insideContinent) insideCount++

    if (!insideContinent) {
      // Non-supercontinent area: green
      colorBuffer[i] = 0xFF2d7a2d // Green
    } else {
      // Inside continent: purple
      colorBuffer[i] = getHeatmapColor(temperature, elevation)
    }
  }

  return colorBuffer
}

/**
 * Render to canvas
 */
function renderPlanetToCanvas(canvasElement) {
  const ctx = canvasElement.getContext('2d')
  const imageData = ctx.createImageData(WIDTH, HEIGHT)

  // colorBuffer is already in RGBA format as Uint32Array
  // Copy directly to ImageData
  const dataView = new Uint8Array(imageData.data.buffer)
  dataView.set(new Uint8Array(colorBuffer.buffer))

  ctx.putImageData(imageData, 0, 0)
}

/**
 * Example usage
 */
function initPlanetSim() {
  const canvas = document.getElementById('planet-canvas')
  if (!canvas) return

  canvas.width = WIDTH
  canvas.height = HEIGHT

  console.time('Planet Generation')
  generatePlanet(12345)
  console.timeEnd('Planet Generation')

  renderPlanetToCanvas(canvas)
  console.log('Planet rendered to canvas')
}

// Export for use in Next.js or module systems
export { generatePlanet, renderPlanetToCanvas, initPlanetSim, WIDTH, HEIGHT }
