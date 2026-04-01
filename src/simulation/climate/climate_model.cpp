#include "climate_model.h"
#include <cmath>
#include <algorithm>

namespace geoforge {

namespace {
    static constexpr float kPi = 3.14159265359f;
    static constexpr float kDeg2Rad = kPi / 180.0f;
} // namespace

// --------------------------------------------------------------------------
// Public
// --------------------------------------------------------------------------

std::vector<ClimateCell> ClimateModel::Derive(
    const GeodesicGrid& grid,
    const std::vector<CellState>& cells,
    float co2_ppm,
    float /*axial_tilt_deg*/)
{
    const int N = grid.CellCount();
    std::vector<ClimateCell> climate(N);

    float co2_offset = GreenhouseOffset(co2_ppm);

    for (int i = 0; i < N; ++i) {
        auto [lat, lon] = grid.CellToLatLon(i);
        float elev = cells[i].elevation;

        // Temperature
        float T = SolarTemperature(lat)
                + LapseCorrection(elev)
                + co2_offset;

        // Precipitation
        float P = BaseRainfall(lat)
                * OrographicFactor(elev)
                * CoastalFactor(IsCoastal(i, grid, cells));

        // Clamp precipitation to realistic range
        P = std::max(0.0f, std::min(P, 5000.0f));

        climate[i].temperature   = T;
        climate[i].precipitation = P;
        climate[i].koppen        = KoppenClass(T, P, lat);
    }

    return climate;
}

// --------------------------------------------------------------------------
// Private helpers
// --------------------------------------------------------------------------

float ClimateModel::SolarTemperature(float lat_deg) {
    // ~30°C at equator, 0°C at 60°, negative at poles
    return 30.0f * std::cos(lat_deg * kDeg2Rad);
}

float ClimateModel::LapseCorrection(float elevation_m) {
    // Environmental lapse rate: -6.5°C per km above sea level
    float elev_km = std::max(0.0f, elevation_m / 1000.0f);
    return -6.5f * elev_km;
}

float ClimateModel::GreenhouseOffset(float co2_ppm) {
    // Myhre 1998 forcing: dT = 15 * ln(CO2/280) / ln(2)
    if (co2_ppm <= 0.0f) return 0.0f;
    return 15.0f * std::log(co2_ppm / 280.0f) / std::log(2.0f);
}

float ClimateModel::BaseRainfall(float lat_deg) {
    float absLat = std::abs(lat_deg);

    // Hadley/Ferrel/Polar atmospheric cells (mm/yr)
    if (absLat < 10.0f) return 2500.0f; // ITCZ, very wet
    if (absLat < 25.0f) {
        // Transition ITCZ → subtropical dry
        float t = (absLat - 10.0f) / 15.0f;
        return 2500.0f * (1.0f - t) + 400.0f * t;
    }
    if (absLat < 35.0f) return 400.0f;  // Subtropical high (desert belt)
    if (absLat < 50.0f) {
        // Transition to Ferrel westerlies
        float t = (absLat - 35.0f) / 15.0f;
        return 400.0f * (1.0f - t) + 1000.0f * t;
    }
    if (absLat < 65.0f) return 1000.0f; // Ferrel westerlies, storm track
    return 200.0f;                       // Polar dry
}

float ClimateModel::OrographicFactor(float elevation_m) {
    if (elevation_m < 0.0f) return 1.0f; // Ocean surface: no orographic effect
    if (elevation_m > 2000.0f) return 1.6f; // Windward high-altitude boost
    if (elevation_m > 1000.0f) return 1.2f;
    return 1.0f;
}

float ClimateModel::CoastalFactor(bool is_coastal) {
    return is_coastal ? 1.3f : 0.7f;
}

bool ClimateModel::IsCoastal(int cell_idx,
                              const GeodesicGrid& grid,
                              const std::vector<CellState>& cells) {
    for (int nb : grid.CellNeighbours(cell_idx)) {
        if (cells[nb].crust_type == CRUST_OCEANIC) return true;
    }
    return false;
}

uint8_t ClimateModel::KoppenClass(float T_mean, float P_annual, float lat_deg) {
    // Simplified Trewartha/Köppen approximation
    // Estimate coldest month temperature from mean and seasonality
    float seasonality = 15.0f * std::cos(lat_deg * kDeg2Rad);
    float T_min = T_mean - seasonality;
    float T_max = T_mean + seasonality;

    // E: Polar (mean T of warmest month < 10°C)
    if (T_max < 10.0f) return 5; // E

    // B: Dry (aridity threshold: P < 20*(T+7) for seasonal rain)
    float P_threshold = 20.0f * (T_mean + 7.0f);
    if (P_annual < P_threshold) return 2; // B (arid/semi-arid)

    // A: Tropical (no month below 18°C)
    if (T_min >= 18.0f) return 1; // A

    // C: Temperate (coldest month -3 to 18°C)
    if (T_min >= -3.0f) return 3; // C

    // D: Continental (coldest month below -3°C, warmest above 10°C)
    return 4; // D
}

} // namespace geoforge
