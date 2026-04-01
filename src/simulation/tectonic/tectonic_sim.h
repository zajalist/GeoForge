#pragma once

#include "cell_data.h"
#include "../grid/geodesic_grid.h"
#include <functional>
#include <vector>

namespace geoforge {

/**
 * TectonicSimulator
 *
 * Runs a kinematic plate tectonic simulation on a fixed geodesic grid.
 * Cells do not physically move; instead, Euler-pole-derived velocities
 * at boundary cells determine the boundary type each timestep, and the
 * resulting geological effects (orogeny, subduction, ocean-floor ageing)
 * are stamped onto cell state in-place.
 *
 * Per-timestep pipeline:
 *   1. StepComputeVelocities  — Euler-pole cross-product velocities
 *   2. StepDetectBoundaries   — Classify neighbor pairs by separation rate
 *   3. StepHandleDivergent    — New oceanic crust at ridges
 *   4. StepHandleConvergent   — Orogeny or subduction
 *   5. StepUpdateOceanCrust   — Age oceanic cells, Parsons & Sclater depth
 *   6. StepApplyErosion       — Erode active orogen cells
 */
class TectonicSimulator {
public:
    TectonicSimulator(const GeodesicGrid& grid,
                      std::vector<CellState> cells,
                      std::vector<Plate> plates);

    /**
     * Run simulation from t=0 to max_time_ma.
     * snapshot_cb is called every 50 Ma (and at t=0) with the current time
     * and full cell array — use it to save intermediate states.
     */
    void Run(float max_time_ma = 500.0f,
             float timestep_ma = 10.0f,
             std::function<void(float, const std::vector<CellState>&)> snapshot_cb = nullptr);

    const std::vector<CellState>& Cells() const { return cells_; }
    const std::vector<Plate>&     Plates() const { return plates_; }
    float CurrentTime() const { return current_time_; }

private:
    // --- Simulation steps ---
    void StepComputeVelocities();
    std::vector<Boundary> StepDetectBoundaries() const;
    void StepHandleDivergent(const std::vector<Boundary>& boundaries);
    void StepHandleConvergent(const std::vector<Boundary>& boundaries, float dt);
    void StepUpdateOceanCrust(float dt);
    void StepApplyErosion(float dt);

    // --- Helpers ---
    float ContinentalSpeedFactor(const Plate& p) const;

    static GeodesicGrid::Vec3 Cross(const GeodesicGrid::Vec3& a,
                                    const GeodesicGrid::Vec3& b);
    static float Dot(const GeodesicGrid::Vec3& a, const GeodesicGrid::Vec3& b);
    static GeodesicGrid::Vec3 Sub(const GeodesicGrid::Vec3& a,
                                  const GeodesicGrid::Vec3& b);
    static GeodesicGrid::Vec3 Scale(const GeodesicGrid::Vec3& v, float s);

    // Orogeny height model (§4.2 of tectonic_simulation_plan.md)
    // type: 1=HIGH 2=MEDIUM 3=LOW 4=ANDEAN
    static float OrogenyHeight(uint8_t type, float conv_km, uint16_t dur_ma);

    // BFS to find cells within hop_count adjacency steps
    std::vector<int> BfsNeighbors(int start_cell, int hop_count) const;

    // --- State ---
    const GeodesicGrid&      grid_;
    std::vector<CellState>   cells_;
    std::vector<Plate>       plates_;
    std::vector<CollisionZone> active_collisions_;
    float current_time_ = 0.0f;
};

} // namespace geoforge
