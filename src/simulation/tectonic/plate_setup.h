#pragma once

#include "cell_data.h"
#include "../grid/geodesic_grid.h"
#include <cstdint>
#include <utility>
#include <vector>

namespace geoforge {

struct InitialPlateConfig {
    int      num_plates            = 7;
    float    continental_fraction  = 0.35f; // ~35% cells are continental
    float    supercontinent_lat    = 10.0f; // centre of initial landmass (degrees)
    float    supercontinent_lon    = 0.0f;
    uint64_t seed                  = 42;    // reproducible RNG seed
};

/**
 * Initialise plate assignments on the geodesic grid.
 *
 * Algorithm:
 *   1. Seed N random Euler poles (seeded RNG).
 *   2. Assign each cell the nearest Euler pole → plate_id (Voronoi).
 *   3. Mark the closest (continental_fraction * cell_count) cells to the
 *      supercontinent centre as continental; the rest are oceanic.
 *   4. Set initial elevations: continental=+500 m, oceanic=-2850 m.
 *   5. Assign Euler rates: continental 1-2 deg/Ma, oceanic 3-5 deg/Ma.
 *
 * Returns {cells, plates}.
 */
std::pair<std::vector<CellState>, std::vector<Plate>>
InitializePlates(const GeodesicGrid& grid, const InitialPlateConfig& cfg);

} // namespace geoforge
