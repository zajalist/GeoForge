/**
 * One-shot heuristic mantle heat field for rift/subduction candidate scoring.
 * Pure function — no side effects, no imports.
 */

function pointInPolygon(lon, lat, polygon) {
  const n = polygon.length
  let inside = false
  let j = n - 1
  for (let i = 0; i < n; i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-10) + xi) {
      inside = !inside
    }
    j = i
  }
  return inside
}

function haversineDeg(lon1, lat1, lon2, lat2) {
  const R = 6371.0
  const dlat = ((lat2 - lat1) * Math.PI) / 180
  const dlon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dlon / 2) ** 2
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return km / 111.0 // approximate degrees
}

/**
 * Score a single candidate point.
 */
function scorePoint(lon, lat, plateCoords, cratonPolygons, centroidLon, centroidLat) {
  const thermalEquatorLat = 15.0
  const mantleTemp = Math.max(0, Math.cos(((lat - thermalEquatorLat) * Math.PI) / 180))

  const perturbation = Math.sin((lon * Math.PI) / 120) * 0.08
  const upwellingFlux = Math.max(0, Math.min(1, mantleTemp + perturbation))

  const crustBonus = 0.20

  let cratonPenalty = 0
  for (const craton of cratonPolygons) {
    if (craton.length === 0) continue
    const cLon = craton.reduce((s, p) => s + p[0], 0) / craton.length
    const cLat = craton.reduce((s, p) => s + p[1], 0) / craton.length
    if (haversineDeg(lon, lat, cLon, cLat) < 4.0) {
      cratonPenalty -= 0.05
    }
  }

  const distToCentroid = haversineDeg(lon, lat, centroidLon, centroidLat)
  const sutureProxy = distToCentroid < 6.0 ? 0.05 : 0

  const raw = mantleTemp * 0.35 + upwellingFlux * 0.30 + crustBonus + cratonPenalty + sutureProxy
  return Math.max(0, Math.min(1, raw))
}

/**
 * Compute the highest-scoring mantle candidate across the plate.
 *
 * @param {number[][]} plateCoords  [[lon, lat], ...]
 * @param {number[][][]} cratonPolygons  [ [[lon, lat], ...], ... ]
 * @returns {{ lat: number, lon: number, type: string, confidence: number, reasoning: string, plumes: object[], slabs: object[] } | null}
 */
export function computeMantleCandidate(plateCoords, cratonPolygons) {
  if (!plateCoords || plateCoords.length < 3) {
    return null
  }

  const lons = plateCoords.map((p) => p[0])
  const lats = plateCoords.map((p) => p[1])
  const minLon = Math.min(...lons) - 5
  const maxLon = Math.max(...lons) + 5
  const minLat = Math.max(-85, Math.min(...lats) - 5)
  const maxLat = Math.min(85, Math.max(...lats) + 5)

  const centroidLon = lons.reduce((s, v) => s + v, 0) / lons.length
  const centroidLat = lats.reduce((s, v) => s + v, 0) / lats.length

  const STEP = 5.0
  const candidates = []

  for (let lat = minLat; lat <= maxLat; lat += STEP) {
    for (let lon = minLon; lon <= maxLon; lon += STEP) {
      if (!pointInPolygon(lon, lat, plateCoords)) continue
      const score = scorePoint(lon, lat, plateCoords, cratonPolygons, centroidLon, centroidLat)
      candidates.push({ lat, lon, score })
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score)

  const best = candidates[0]
  const worst = candidates[candidates.length - 1]

  const plumes = candidates.slice(0, 3).map((c) => ({ lat: c.lat, lon: c.lon, strength: c.score }))
  const slabs = candidates.slice(-2).map((c) => ({ lat: c.lat, lon: c.lon, strength: 1 - c.score }))

  const riftScore = best.score
  const subScore = 1 - worst.score
  const isRift = riftScore >= subScore

  const winner = isRift ? best : worst
  const type = isRift ? 'rift' : 'subduction'
  const confidence = isRift ? riftScore : subScore

  const reasoning =
    `${type} candidate at (${winner.lat.toFixed(1)}°, ${winner.lon.toFixed(1)}°). ` +
    `Score: ${confidence.toFixed(3)}. ` +
    `Thermal equator proxy peaked at lat ${winner.lat.toFixed(1)}°. ` +
    `${cratonPolygons.length} craton(s) evaluated for proximity penalty. ` +
    `Suture proxy: ${Math.abs(winner.lat - centroidLat) < 6 ? 'active' : 'inactive'}.`

  return { lat: winner.lat, lon: winner.lon, type, confidence, reasoning, plumes, slabs }
}
