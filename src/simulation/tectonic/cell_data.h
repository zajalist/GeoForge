#pragma once

#include <cstdint>
#include <vector>
#include <string>

namespace geoforge {

// --- Per-cell simulation state ---

struct CellState {
    uint8_t  plate_id     = 0;    // 0 = unassigned, 1+ = plate ID
    uint8_t  crust_type   = 0;    // 0 = oceanic, 1 = continental
    float    elevation    = 0.0f; // metres (negative = below sea level)
    uint16_t ocean_age    = 0;    // Ma since crust formed at ridge
    float    vel_x        = 0.0f; // cm/year, Euler-derived velocity
    float    vel_y        = 0.0f;
    float    vel_z        = 0.0f;
    uint16_t orogeny_age  = 0;    // Ma since last orogeny
    uint8_t  orogeny_type = 0;    // 0=none 1=HIGH 2=MEDIUM 3=LOW 4=ANDEAN
    bool     is_ridge     = false; // newly formed oceanic crust this step
};

static constexpr uint8_t CRUST_OCEANIC      = 0;
static constexpr uint8_t CRUST_CONTINENTAL  = 1;

static constexpr uint8_t OROGENY_NONE    = 0;
static constexpr uint8_t OROGENY_HIGH    = 1;
static constexpr uint8_t OROGENY_MEDIUM  = 2;
static constexpr uint8_t OROGENY_LOW     = 3;
static constexpr uint8_t OROGENY_ANDEAN  = 4;

// --- Plate metadata ---

struct Plate {
    uint8_t  id           = 0;
    float    euler_lat    = 0.0f; // Euler pole latitude (degrees)
    float    euler_lon    = 0.0f; // Euler pole longitude (degrees)
    float    euler_rate   = 1.0f; // deg/Ma, counter-clockwise looking from pole
    std::vector<int> continental_cells;
    std::vector<int> oceanic_cells;
    std::string name;
};

// --- Boundary detection ---

enum class BoundaryType { DIVERGENT, CONVERGENT, TRANSFORM };

struct Boundary {
    BoundaryType type;
    uint8_t plate_a   = 0;
    uint8_t plate_b   = 0;
    int     cell_a    = -1; // representative cell from plate_a
    int     cell_b    = -1; // representative cell from plate_b
    float   separation_rate = 0.0f; // cm/yr; positive = diverging
};

// --- Collision zones (accumulated over time) ---

struct CollisionZone {
    uint8_t  plate_a              = 0;
    uint8_t  plate_b              = 0;
    uint8_t  orogeny_type         = OROGENY_NONE;
    float    convergence_rate     = 0.0f; // cm/yr
    uint16_t start_time_ma        = 0;
    float    accumulated_conv_km  = 0.0f; // total convergence in km
    std::vector<int> collision_cells;
};

} // namespace geoforge
