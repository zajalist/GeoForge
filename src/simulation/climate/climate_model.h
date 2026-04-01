#pragma once

#include "../tectonic/cell_data.h"
#include "../grid/geodesic_grid.h"
#include <cstdint>
#include <vector>

namespace geoforge {

struct ClimateCell {
    float   temperature;   // Celsius
    float   precipitation; // mm/year
    uint8_t koppen;        // 1=A 2=B 3=C 4=D 5=E  (0=unset)
};

/**
 * ClimateModel
 *
 * Derives temperature, precipitation, and Köppen–Geiger zone for each cell
 * from tectonic state (elevation, crust type) and planetary parameters.
 *
 * Formulas (from plan/GEOFORGE_REVISED_FINAL.md):
 *   T = 30*cos(lat) - max(0, elev_km)*6.5 + 15*ln(CO2/280)/ln(2)
 *   P = P_atmospheric(lat) * P_orographic(elev) * P_coastal_factor
 *   Köppen: derived from T and P (simplified Trewartha-style)
 */
class ClimateModel {
public:
    /**
     * Derive climate for all cells in one pass.
     * Returns a ClimateCell per grid cell (same indexing as cells).
     */
    static std::vector<ClimateCell> Derive(
        const GeodesicGrid& grid,
        const std::vector<CellState>& cells,
        float co2_ppm = 400.0f,
        float axial_tilt_deg = 23.5f);

private:
    static float SolarTemperature(float lat_deg);
    static float LapseCorrection(float elevation_m);
    static float GreenhouseOffset(float co2_ppm);
    static float BaseRainfall(float lat_deg);
    static float OrographicFactor(float elevation_m);
    static float CoastalFactor(bool is_coastal);
    static uint8_t KoppenClass(float T_mean, float P_annual, float lat_deg);

    // Is cell "coastal" (adjacent to oceanic cell)?
    static bool IsCoastal(int cell_idx,
                          const GeodesicGrid& grid,
                          const std::vector<CellState>& cells);
};

} // namespace geoforge
