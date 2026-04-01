#include "plate_setup.h"
#include <algorithm>
#include <cmath>
#include <random>
#include <vector>

namespace geoforge {

namespace {

// Simple LCG-based splitmix64 for reproducible seeding
uint64_t splitmix64(uint64_t& state) {
    uint64_t z = (state += 0x9e3779b97f4a7c15ULL);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}

float RandFloat(uint64_t& s, float lo, float hi) {
    double r = (splitmix64(s) >> 11) * (1.0 / (1ULL << 53));
    return static_cast<float>(lo + r * (hi - lo));
}

// Convert degrees to unit-sphere XYZ
GeodesicGrid::Vec3 DegToXyz(float lat_deg, float lon_deg) {
    const float kPi = 3.14159265359f;
    float lat_r = lat_deg * (kPi / 180.0f);
    float lon_r = lon_deg * (kPi / 180.0f);
    return GeodesicGrid::Vec3(
        std::cos(lat_r) * std::cos(lon_r),
        std::cos(lat_r) * std::sin(lon_r),
        std::sin(lat_r)
    );
}

float Dot(const GeodesicGrid::Vec3& a, const GeodesicGrid::Vec3& b) {
    return a.x*b.x + a.y*b.y + a.z*b.z;
}

} // namespace

std::pair<std::vector<CellState>, std::vector<Plate>>
InitializePlates(const GeodesicGrid& grid, const InitialPlateConfig& cfg) {
    const int N = grid.CellCount();
    uint64_t rng = cfg.seed;

    // --- Step 1: pick num_plates random Euler pole positions ---
    struct PoleInfo {
        GeodesicGrid::Vec3 xyz;
        float euler_lat, euler_lon;
        float euler_rate;
    };

    std::vector<PoleInfo> poles(cfg.num_plates);
    for (int p = 0; p < cfg.num_plates; ++p) {
        // Uniform random points on sphere: use rejection or trig method
        float lat = RandFloat(rng, -75.0f, 75.0f);
        float lon = RandFloat(rng, -180.0f, 180.0f);
        poles[p].euler_lat  = lat;
        poles[p].euler_lon  = lon;
        poles[p].xyz        = DegToXyz(lat, lon);
        // Rates assigned later once we know continental vs oceanic
        poles[p].euler_rate = RandFloat(rng, 1.5f, 5.0f);
    }

    // --- Step 2: Voronoi assignment (nearest pole) ---
    std::vector<CellState> cells(N);
    for (int i = 0; i < N; ++i) {
        const auto& v = grid.CellVertex(i);
        float best = -2.0f;
        int best_p = 0;
        for (int p = 0; p < cfg.num_plates; ++p) {
            float d = Dot(v, poles[p].xyz);
            if (d > best) { best = d; best_p = p; }
        }
        cells[i].plate_id = static_cast<uint8_t>(best_p + 1); // 1-indexed
    }

    // --- Step 3: Mark continental cells ---
    // Sort cells by angular distance from supercontinent centre
    GeodesicGrid::Vec3 super_centre = DegToXyz(cfg.supercontinent_lat,
                                                cfg.supercontinent_lon);
    int num_continental = static_cast<int>(N * cfg.continental_fraction);

    // Build sorted index by dot product (higher = closer)
    std::vector<int> idx(N);
    for (int i = 0; i < N; ++i) idx[i] = i;
    std::sort(idx.begin(), idx.end(), [&](int a, int b) {
        float da = Dot(grid.CellVertex(a), super_centre);
        float db = Dot(grid.CellVertex(b), super_centre);
        return da > db;
    });

    for (int k = 0; k < num_continental; ++k) {
        cells[idx[k]].crust_type = CRUST_CONTINENTAL;
    }

    // --- Step 4: Initial elevations ---
    for (int i = 0; i < N; ++i) {
        if (cells[i].crust_type == CRUST_CONTINENTAL) {
            // Slight variation 300-700 m
            float jitter = RandFloat(rng, -200.0f, 200.0f);
            cells[i].elevation = 500.0f + jitter;
            cells[i].ocean_age = 0;
        } else {
            cells[i].ocean_age = static_cast<uint16_t>(
                static_cast<int>(RandFloat(rng, 1.0f, 150.0f)));
            float age = cells[i].ocean_age;
            cells[i].elevation = -(2500.0f + 350.0f * std::sqrt(age));
        }
    }

    // --- Step 5: Build Plate objects ---
    std::vector<Plate> plates(cfg.num_plates);
    for (int p = 0; p < cfg.num_plates; ++p) {
        plates[p].id         = static_cast<uint8_t>(p + 1);
        plates[p].euler_lat  = poles[p].euler_lat;
        plates[p].euler_lon  = poles[p].euler_lon;
        plates[p].euler_rate = poles[p].euler_rate;
    }

    for (int i = 0; i < N; ++i) {
        int p = cells[i].plate_id - 1;
        if (cells[i].crust_type == CRUST_CONTINENTAL)
            plates[p].continental_cells.push_back(i);
        else
            plates[p].oceanic_cells.push_back(i);
    }

    // Adjust euler_rate: mostly-continental plates move slower
    for (auto& pl : plates) {
        int total = static_cast<int>(pl.continental_cells.size() + pl.oceanic_cells.size());
        float cont_ratio = total > 0
            ? static_cast<float>(pl.continental_cells.size()) / total
            : 0.0f;
        if (cont_ratio > 0.8f)      pl.euler_rate *= 0.3f;
        else if (cont_ratio > 0.4f) pl.euler_rate *= 0.5f;
        // purely oceanic: unchanged
    }

    return {std::move(cells), std::move(plates)};
}

} // namespace geoforge
