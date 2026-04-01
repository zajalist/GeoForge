#include "tectonic_sim.h"
#include <algorithm>
#include <cmath>
#include <queue>
#include <unordered_set>
#include <cstdio>

namespace geoforge {

namespace {
    static constexpr float kPi = 3.14159265359f;

    GeodesicGrid::Vec3 DegToUnitVec(float lat_deg, float lon_deg) {
        float lat_r = lat_deg * (kPi / 180.0f);
        float lon_r = lon_deg * (kPi / 180.0f);
        return GeodesicGrid::Vec3(
            std::cos(lat_r) * std::cos(lon_r),
            std::cos(lat_r) * std::sin(lon_r),
            std::sin(lat_r)
        );
    }
} // namespace

// --------------------------------------------------------------------------
// Construction
// --------------------------------------------------------------------------

TectonicSimulator::TectonicSimulator(const GeodesicGrid& grid,
                                     std::vector<CellState> cells,
                                     std::vector<Plate> plates)
    : grid_(grid),
      cells_(std::move(cells)),
      plates_(std::move(plates)) {}

// --------------------------------------------------------------------------
// Public: Run
// --------------------------------------------------------------------------

void TectonicSimulator::Run(
    float max_time_ma,
    float timestep_ma,
    std::function<void(float, const std::vector<CellState>&)> snapshot_cb)
{
    current_time_ = 0.0f;
    float next_snapshot = 0.0f;

    while (current_time_ <= max_time_ma + 1e-4f) {
        // Snapshot every 50 Ma
        if (current_time_ >= next_snapshot - 1e-4f) {
            if (snapshot_cb) snapshot_cb(current_time_, cells_);
            next_snapshot += 50.0f;
        }

        if (current_time_ >= max_time_ma - 1e-4f) break;

        // === Timestep pipeline ===
        StepComputeVelocities();
        auto boundaries = StepDetectBoundaries();
        StepHandleDivergent(boundaries);
        StepHandleConvergent(boundaries, timestep_ma);
        StepUpdateOceanCrust(timestep_ma);
        StepApplyErosion(timestep_ma);

        current_time_ += timestep_ma;
    }
}

// --------------------------------------------------------------------------
// Step 1: Compute Euler-pole velocities
// --------------------------------------------------------------------------

void TectonicSimulator::StepComputeVelocities() {
    for (auto& plate : plates_) {
        GeodesicGrid::Vec3 pole = DegToUnitVec(plate.euler_lat, plate.euler_lon);
        // Convert deg/Ma → rad/Ma; cross product gives rad-equivalent velocity
        float omega_rad = plate.euler_rate * (kPi / 180.0f);
        float speed_factor = ContinentalSpeedFactor(plate);

        auto apply = [&](int cell_id) {
            const GeodesicGrid::Vec3& pos = grid_.CellVertex(cell_id);
            // V = ω × r  (angular velocity × position vector)
            GeodesicGrid::Vec3 vel = Cross(Scale(pole, omega_rad), pos);
            // Scale: rad/Ma * R_Earth(km) * 100000 cm/km / 1e6 yr/Ma = cm/yr
            // Simplified: multiply by ~6371 * 0.1 ≈ 637 to get cm/yr from rad/Ma
            const float kRadMaToCmYr = 6371.0f * 0.1f;
            vel = Scale(vel, kRadMaToCmYr * speed_factor);
            cells_[cell_id].vel_x = vel.x;
            cells_[cell_id].vel_y = vel.y;
            cells_[cell_id].vel_z = vel.z;
        };

        for (int c : plate.continental_cells) apply(c);
        for (int c : plate.oceanic_cells)     apply(c);
    }
}

// --------------------------------------------------------------------------
// Step 2: Detect boundaries
// --------------------------------------------------------------------------

std::vector<Boundary> TectonicSimulator::StepDetectBoundaries() const {
    std::vector<Boundary> boundaries;
    const int N = grid_.CellCount();

    for (int i = 0; i < N; ++i) {
        if (cells_[i].plate_id == 0) continue;

        for (int j : grid_.CellNeighbours(i)) {
            if (j <= i) continue; // process each pair once
            if (cells_[j].plate_id == 0) continue;
            if (cells_[i].plate_id == cells_[j].plate_id) continue;

            // Relative velocity (j relative to i)
            GeodesicGrid::Vec3 rel_vel{
                cells_[j].vel_x - cells_[i].vel_x,
                cells_[j].vel_y - cells_[i].vel_y,
                cells_[j].vel_z - cells_[i].vel_z
            };

            // Direction from i to j on sphere
            GeodesicGrid::Vec3 dir = Sub(grid_.CellVertex(j), grid_.CellVertex(i));
            float len = dir.Length();
            if (len < 1e-9f) continue;
            dir = Scale(dir, 1.0f / len);

            float sep = Dot(rel_vel, dir); // positive = diverging

            BoundaryType btype;
            if      (sep >  0.5f) btype = BoundaryType::DIVERGENT;
            else if (sep < -0.5f) btype = BoundaryType::CONVERGENT;
            else                  btype = BoundaryType::TRANSFORM;

            boundaries.push_back({btype, cells_[i].plate_id, cells_[j].plate_id,
                                   i, j, sep});
        }
    }

    return boundaries;
}

// --------------------------------------------------------------------------
// Step 3: Handle divergent boundaries — new oceanic crust
// --------------------------------------------------------------------------

void TectonicSimulator::StepHandleDivergent(const std::vector<Boundary>& boundaries) {
    for (const auto& b : boundaries) {
        if (b.type != BoundaryType::DIVERGENT) continue;

        // Both cells at ridge become fresh oceanic crust
        for (int cell_id : {b.cell_a, b.cell_b}) {
            CellState& c = cells_[cell_id];
            c.crust_type  = CRUST_OCEANIC;
            c.ocean_age   = 0;
            c.elevation   = 0.0f;
            c.is_ridge    = true;
            c.orogeny_type = OROGENY_NONE;
            c.orogeny_age  = 0;
        }
    }
}

// --------------------------------------------------------------------------
// Step 4: Handle convergent boundaries — subduction or collision
// --------------------------------------------------------------------------

void TectonicSimulator::StepHandleConvergent(const std::vector<Boundary>& boundaries,
                                             float dt) {
    for (const auto& b : boundaries) {
        if (b.type != BoundaryType::CONVERGENT) continue;

        bool a_is_continental = (cells_[b.cell_a].crust_type == CRUST_CONTINENTAL);
        bool b_is_continental = (cells_[b.cell_b].crust_type == CRUST_CONTINENTAL);

        float convergence = std::abs(b.separation_rate); // cm/yr

        if (a_is_continental && b_is_continental) {
            // === Continental–continental collision ===
            uint8_t orogeny_type;
            if      (convergence > 3.0f) orogeny_type = OROGENY_HIGH;
            else if (convergence > 1.5f) orogeny_type = OROGENY_MEDIUM;
            else                          orogeny_type = OROGENY_LOW;

            // Find or create collision zone
            CollisionZone* zone = nullptr;
            for (auto& cz : active_collisions_) {
                if ((cz.plate_a == b.plate_a && cz.plate_b == b.plate_b) ||
                    (cz.plate_a == b.plate_b && cz.plate_b == b.plate_a)) {
                    zone = &cz;
                    break;
                }
            }
            if (!zone) {
                active_collisions_.push_back({});
                zone = &active_collisions_.back();
                zone->plate_a        = b.plate_a;
                zone->plate_b        = b.plate_b;
                zone->start_time_ma  = static_cast<uint16_t>(current_time_);
            }
            zone->orogeny_type      = orogeny_type;
            zone->convergence_rate  = convergence;
            // Convergence in km this timestep: cm/yr * 1e5 yr/Ma * dt Ma / 1e5 cm/km
            zone->accumulated_conv_km += convergence * dt; // simplified: 1 cm/yr*Ma ≈ 1 km
            zone->collision_cells.push_back(b.cell_a);
            zone->collision_cells.push_back(b.cell_b);

            uint16_t dur = static_cast<uint16_t>(
                current_time_ - zone->start_time_ma);
            float h = OrogenyHeight(orogeny_type, zone->accumulated_conv_km, dur);

            // Stamp elevation on collision cells + immediate neighbours
            auto nearby = BfsNeighbors(b.cell_a, 1);
            nearby.push_back(b.cell_a);
            nearby.push_back(b.cell_b);
            for (int nid : nearby) {
                const auto& nbrs_b = BfsNeighbors(b.cell_b, 1);
                bool is_near_b = std::find(nbrs_b.begin(), nbrs_b.end(), nid)
                                 != nbrs_b.end() || nid == b.cell_b;
                float dist_factor = is_near_b ? 1.0f : 0.6f;
                if (cells_[nid].crust_type == CRUST_CONTINENTAL) {
                    cells_[nid].elevation   = std::max(cells_[nid].elevation,
                                                       h * dist_factor);
                    cells_[nid].orogeny_type = orogeny_type;
                    cells_[nid].orogeny_age  = 0;
                }
            }

        } else {
            // === Subduction (ocean–continent or ocean–ocean) ===
            // Determine which side is the subducting oceanic plate
            int trench_cell  = a_is_continental ? b.cell_b : b.cell_a;
            int overriding   = a_is_continental ? b.cell_a : b.cell_b;

            // Trench depression
            cells_[trench_cell].elevation = std::min(cells_[trench_cell].elevation,
                                                     -6000.0f);
            cells_[trench_cell].ocean_age = std::min(
                static_cast<int>(cells_[trench_cell].ocean_age) + static_cast<int>(dt),
                200);

            // Volcanic arc ~2 hops from trench (~120 km at level 6)
            if (a_is_continental || b_is_continental) {
                auto arc_cells = BfsNeighbors(overriding, 2);
                for (int ac : arc_cells) {
                    if (cells_[ac].crust_type == CRUST_CONTINENTAL) {
                        cells_[ac].elevation = std::max(cells_[ac].elevation, 2000.0f);
                        cells_[ac].orogeny_type = OROGENY_ANDEAN;
                        cells_[ac].orogeny_age  = 0;
                    }
                }
            }
        }
    }
}

// --------------------------------------------------------------------------
// Step 5: Update ocean crust (age + Parsons & Sclater depth)
// --------------------------------------------------------------------------

void TectonicSimulator::StepUpdateOceanCrust(float dt) {
    for (auto& c : cells_) {
        if (c.crust_type != CRUST_OCEANIC) continue;

        if (c.is_ridge) {
            c.ocean_age = 0;
            c.is_ridge  = false;
        } else {
            int new_age = c.ocean_age + static_cast<int>(dt);
            c.ocean_age = static_cast<uint16_t>(std::min(new_age, 65535));
        }

        // Parsons & Sclater 1977: depth = 2500 + 350 * sqrt(age_Ma)
        float age = static_cast<float>(c.ocean_age);
        float depth = 2500.0f + 350.0f * std::sqrt(std::max(0.0f, age));
        c.elevation = -depth;

        // Very old crust (>200 Ma) goes to trench depths
        if (c.ocean_age > 200) {
            c.elevation = std::min(c.elevation, -8000.0f);
        }
    }
}

// --------------------------------------------------------------------------
// Step 6: Erosion
// --------------------------------------------------------------------------

void TectonicSimulator::StepApplyErosion(float dt) {
    for (auto& c : cells_) {
        if (c.orogeny_type == OROGENY_NONE) continue;

        float eroded = 0.03f * dt * 1000.0f; // km/Ma → m/Ma; dt in Ma
        c.elevation -= eroded;
        c.elevation  = std::max(c.elevation, 200.0f);
        c.orogeny_age = static_cast<uint16_t>(
            std::min(c.orogeny_age + static_cast<int>(dt), 65535));
    }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

float TectonicSimulator::ContinentalSpeedFactor(const Plate& p) const {
    int total = static_cast<int>(p.continental_cells.size() + p.oceanic_cells.size());
    if (total == 0) return 0.9f;
    float ratio = static_cast<float>(p.continental_cells.size()) / total;
    if (ratio > 0.8f) return 0.3f;
    if (ratio > 0.4f) return 0.5f;
    return 0.9f;
}

GeodesicGrid::Vec3 TectonicSimulator::Cross(const GeodesicGrid::Vec3& a,
                                            const GeodesicGrid::Vec3& b) {
    return GeodesicGrid::Vec3(
        a.y*b.z - a.z*b.y,
        a.z*b.x - a.x*b.z,
        a.x*b.y - a.y*b.x
    );
}

float TectonicSimulator::Dot(const GeodesicGrid::Vec3& a,
                             const GeodesicGrid::Vec3& b) {
    return a.x*b.x + a.y*b.y + a.z*b.z;
}

GeodesicGrid::Vec3 TectonicSimulator::Sub(const GeodesicGrid::Vec3& a,
                                          const GeodesicGrid::Vec3& b) {
    return GeodesicGrid::Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

GeodesicGrid::Vec3 TectonicSimulator::Scale(const GeodesicGrid::Vec3& v, float s) {
    return GeodesicGrid::Vec3(v.x * s, v.y * s, v.z * s);
}

float TectonicSimulator::OrogenyHeight(uint8_t type,
                                       float conv_km,
                                       uint16_t dur_ma) {
    static constexpr float kCoeff[] = {0.0f, 2.5f, 1.8f, 1.2f, 1.5f};
    float coeff = (type > 0 && type <= 4) ? kCoeff[type] : 0.0f;
    float h = conv_km * coeff;
    float eroded = 0.03f * dur_ma;
    return std::max(200.0f, h - eroded);
}

std::vector<int> TectonicSimulator::BfsNeighbors(int start_cell,
                                                  int hop_count) const {
    std::unordered_set<int> visited;
    std::queue<std::pair<int,int>> q;
    q.push({start_cell, 0});
    visited.insert(start_cell);

    std::vector<int> result;
    while (!q.empty()) {
        auto [node, depth] = q.front();
        q.pop();
        if (depth > 0) result.push_back(node);
        if (depth == hop_count) continue;
        for (int nb : grid_.CellNeighbours(node)) {
            if (!visited.count(nb)) {
                visited.insert(nb);
                q.push({nb, depth + 1});
            }
        }
    }
    return result;
}

} // namespace geoforge
