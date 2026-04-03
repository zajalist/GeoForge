/**
 * Rift pathfinding with A* search, zigzag generation, and craton avoidance.
 * Ported from Python rift_pathfinder.py for browser use.
 */

class GridCell {
  constructor(row, col, lon, lat, isPlate = false, isOceanEdge = false, isCraton = false) {
    this.row = row
    this.col = col
    this.lon = lon
    this.lat = lat
    this.isPlate = isPlate
    this.isOceanEdge = isOceanEdge
    this.isCraton = isCraton
    this.g = Infinity
    this.h = 0
    this.f = Infinity
    this.parent = null
    this._distToCentroid = 0
    this._moveCost = 1.0
  }
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const R = 6371.0
  const dlat = ((lat2 - lat1) * Math.PI) / 180
  const dlon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dlon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function pointInPolygon(lon, lat, polygon, tolerance = 0.1) {
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
  if (!inside) {
    for (const [px, py] of polygon) {
      if (Math.abs(px - lon) < tolerance && Math.abs(py - lat) < tolerance) {
        inside = true
        break
      }
    }
  }
  return inside
}

function buildGrid(plateCoords, cratonPolygons, resolutionDeg = 1.0) {
  const lons = plateCoords.map(c => c[0])
  const lats = plateCoords.map(c => c[1])
  let minLon = Math.min(...lons), maxLon = Math.max(...lons)
  let minLat = Math.min(...lats), maxLat = Math.max(...lats)

  const margin = resolutionDeg * 2
  minLon -= margin; maxLon += margin
  minLat -= margin; maxLat += margin

  const rows = Math.max(1, Math.floor((maxLat - minLat) / resolutionDeg) + 1)
  const cols = Math.max(1, Math.floor((maxLon - minLon) / resolutionDeg) + 1)

  const grid = []
  for (let r = 0; r < rows; r++) {
    const rowCells = []
    for (let c = 0; c < cols; c++) {
      const lon = minLon + c * resolutionDeg
      const lat = maxLat - r * resolutionDeg
      const inPlate = pointInPolygon(lon, lat, plateCoords)
      const inCraton = cratonPolygons.some(cr => pointInPolygon(lon, lat, cr))
      rowCells.push(new GridCell(r, c, lon, lat, inPlate, false, inCraton && inPlate))
    }
    grid.push(rowCells)
  }

  markOceanEdges(grid, rows, cols)
  return { grid, rows, cols, minLon, minLat, maxLon, maxLat }
}

function markOceanEdges(grid, rows, cols) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c]
      if (!cell.isPlate) continue
      let isEdge = false
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || !grid[nr][nc].isPlate) {
          isEdge = true
          break
        }
      }
      if (isEdge) cell.isOceanEdge = true
    }
  }
}

function selectRiftEndpoints(edgeCells, plateCoords) {
  if (edgeCells.length < 2) throw new Error('Need at least 2 ocean edge cells')

  const centroidLon = plateCoords.reduce((s, c) => s + c[0], 0) / plateCoords.length
  const centroidLat = plateCoords.reduce((s, c) => s + c[1], 0) / plateCoords.length

  for (const cell of edgeCells) {
    cell._distToCentroid = haversineKm(cell.lon, cell.lat, centroidLon, centroidLat)
  }

  edgeCells.sort((a, b) => b._distToCentroid - a._distToCentroid)

  let bestPair = [edgeCells[0], edgeCells[1]]
  let bestDist = haversineKm(edgeCells[0].lon, edgeCells[0].lat, edgeCells[1].lon, edgeCells[1].lat)

  const limit = Math.min(edgeCells.length, 50)
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      const d = haversineKm(edgeCells[i].lon, edgeCells[i].lat, edgeCells[j].lon, edgeCells[j].lat)
      if (d > bestDist) {
        bestDist = d
        bestPair = [edgeCells[i], edgeCells[j]]
      }
    }
  }
  return bestPair
}

function heuristic(a, b) {
  const dlon = a.lon - b.lon, dlat = a.lat - b.lat
  return Math.sqrt(dlon * dlon + dlat * dlat)
}

function getNeighbors(cell, grid, rows, cols, goal) {
  const neighbors = []
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]
  for (const [dr, dc] of dirs) {
    const nr = cell.row + dr, nc = cell.col + dc
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      const neighbor = grid[nr][nc]
      if (neighbor.isPlate && !neighbor.isCraton) {
        let cost = (dr !== 0 && dc !== 0) ? 1.414 : 1.0
        const distToGoal = Math.sqrt((neighbor.lon - goal.lon) ** 2 + (neighbor.lat - goal.lat) ** 2)
        if (distToGoal < 5.0) cost *= 0.5
        neighbor._moveCost = cost
        neighbors.push(neighbor)
      }
    }
  }
  return neighbors
}

function astar(start, goal, grid, rows, cols) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[r][c].g = Infinity
      grid[r][c].f = Infinity
      grid[r][c].parent = null
    }
  }

  start.g = 0
  start.h = heuristic(start, goal)
  start.f = start.h

  const openSet = [{ f: start.f, counter: 0, cell: start }]
  let counter = 1
  const closedSet = new Set()

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f || a.counter - b.counter)
    const current = openSet.shift().cell

    if (current.row === goal.row && current.col === goal.col) {
      const path = []
      let node = current
      while (node) {
        path.push(node)
        node = node.parent
      }
      return path.reverse()
    }

    const key = `${current.row},${current.col}`
    if (closedSet.has(key)) continue
    closedSet.add(key)

    for (const neighbor of getNeighbors(current, grid, rows, cols, goal)) {
      if (closedSet.has(`${neighbor.row},${neighbor.col}`)) continue
      const tentativeG = current.g + neighbor._moveCost
      if (tentativeG < neighbor.g) {
        neighbor.parent = current
        neighbor.g = tentativeG
        neighbor.h = heuristic(neighbor, goal)
        neighbor.f = neighbor.g + neighbor.h
        openSet.push({ f: neighbor.f, counter: counter++, cell: neighbor })
      }
    }
  }
  return null
}

function generateZigzag(basePath, grid, rows, cols, amplitudeCells = 2, zigzagInterval = 4) {
  if (basePath.length < 3) return basePath

  const zigzagged = [basePath[0]]
  const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]]

  for (let i = 1; i < basePath.length - 1; i++) {
    if (i % zigzagInterval === 0) {
      const direction = (Math.floor(i / zigzagInterval) % 2 === 0) ? 1 : -1
      let prevLon = zigzagged[zigzagged.length - 1].lon
      let prevLat = zigzagged[zigzagged.length - 1].lat

      let bestOffset = null
      let bestScore = Infinity

      for (let offset = 1; offset <= amplitudeCells; offset++) {
        for (const [dr, dc] of dirs) {
          const nr = basePath[i].row + dr * offset * direction
          const nc = basePath[i].col + dc * offset * direction
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const candidate = grid[nr][nc]
            if (candidate.isPlate && !candidate.isCraton) {
              const distFromBase = haversineKm(candidate.lon, candidate.lat, basePath[i].lon, basePath[i].lat)
              const distToNext = haversineKm(candidate.lon, candidate.lat, prevLon, prevLat)
              const score = distFromBase * 0.3 + distToNext * 0.7
              if (score < bestScore) {
                bestScore = score
                bestOffset = candidate
              }
            }
          }
        }
      }

      if (bestOffset) {
        zigzagged.push(bestOffset)
        prevLon = bestOffset.lon
        prevLat = bestOffset.lat
      } else {
        zigzagged.push(basePath[i])
      }
    } else {
      zigzagged.push(basePath[i])
    }
  }

  zigzagged.push(basePath[basePath.length - 1])
  return zigzagged
}

function smoothPath(path, grid, rows, cols, iterations = 3) {
  if (path.length < 3) return path
  let smoothed = [...path]

  for (let iter = 0; iter < iterations; iter++) {
    const newPath = [smoothed[0]]
    for (let i = 1; i < smoothed.length - 1; i++) {
      const prev = smoothed[i - 1], curr = smoothed[i], next = smoothed[i + 1]
      const avgLon = (prev.lon + curr.lon + next.lon) / 3
      const avgLat = (prev.lat + curr.lat + next.lat) / 3

      let closest = curr, minDist = Infinity
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = curr.row + dr, nc = curr.col + dc
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const candidate = grid[nr][nc]
            if (candidate.isPlate && !candidate.isCraton) {
              const d = haversineKm(candidate.lon, candidate.lat, avgLon, avgLat)
              if (d < minDist) { minDist = d; closest = candidate }
            }
          }
        }
      }
      newPath.push(closest)
    }
    newPath.push(smoothed[smoothed.length - 1])
    smoothed = newPath
  }
  return smoothed
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLenSq = abx * abx + aby * aby

  if (abLenSq < 1e-12) {
    return { lon: ax, lat: ay }
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq))
  return {
    lon: ax + t * abx,
    lat: ay + t * aby
  }
}

function closestPointOnPolygonBoundary(lon, lat, polygon) {
  if (!polygon || polygon.length < 2) {
    return { lon, lat }
  }

  let best = { lon: polygon[0][0], lat: polygon[0][1] }
  let bestDistSq = Infinity

  const lastIndex = polygon.length - 1
  const isClosed =
    Math.abs(polygon[0][0] - polygon[lastIndex][0]) < 1e-9 &&
    Math.abs(polygon[0][1] - polygon[lastIndex][1]) < 1e-9

  const segmentCount = isClosed ? polygon.length - 1 : polygon.length
  for (let i = 0; i < segmentCount; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const candidate = closestPointOnSegment(lon, lat, a[0], a[1], b[0], b[1])
    const dx = candidate.lon - lon
    const dy = candidate.lat - lat
    const d2 = dx * dx + dy * dy

    if (d2 < bestDistSq) {
      bestDistSq = d2
      best = candidate
    }
  }

  return best
}

/**
 * Generate a rift path across a plate from ocean edge to ocean edge.
 *
 * @param {number[][]} plateCoords - [[lon, lat], ...]
 * @param {number[][][]} cratonPolygons - [[[lon, lat], ...], ...]
 * @param {object} options
 * @returns {number[][]} Rift coordinates as [[lon, lat], ...]
 */
export function generateRiftPath(plateCoords, cratonPolygons, options = {}) {
  const resolutionDeg = options.resolutionDeg ?? 1.0
  const zigzagAmplitude = options.zigzagAmplitude ?? 2.0
  const zigzagInterval = options.zigzagInterval ?? 4

  const { grid, rows, cols } = buildGrid(plateCoords, cratonPolygons, resolutionDeg)

  const edgeCells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].isOceanEdge) edgeCells.push(grid[r][c])
    }
  }

  if (edgeCells.length < 2) {
    throw new Error(`Need at least 2 ocean edge cells, found ${edgeCells.length}`)
  }

  const [start, goal] = selectRiftEndpoints(edgeCells, plateCoords)
  const basePath = astar(start, goal, grid, rows, cols)

  if (!basePath) {
    throw new Error('No valid path found between ocean edges')
  }

  const amplitudeCells = Math.max(1, Math.floor(zigzagAmplitude / resolutionDeg))
  const zigzagged = generateZigzag(basePath, grid, rows, cols, amplitudeCells, zigzagInterval)
  const smoothed = smoothPath(zigzagged, grid, rows, cols)

  const coordinates = smoothed.map(cell => [cell.lon, cell.lat])

  // Enforce rift endpoints on the continent frontier (polygon boundary).
  if (coordinates.length >= 2) {
    const start = coordinates[0]
    const end = coordinates[coordinates.length - 1]
    const snappedStart = closestPointOnPolygonBoundary(start[0], start[1], plateCoords)
    const snappedEnd = closestPointOnPolygonBoundary(end[0], end[1], plateCoords)
    coordinates[0] = [snappedStart.lon, snappedStart.lat]
    coordinates[coordinates.length - 1] = [snappedEnd.lon, snappedEnd.lat]
  }

  return coordinates
}
