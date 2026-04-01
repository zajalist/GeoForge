/**
 * geoforge_sim — GeoForge tectonic simulation entry point
 *
 * Usage:
 *   geoforge_sim [options]
 *
 * Options:
 *   --level   <int>    Grid subdivision level (default: 6, gives 40962 cells)
 *   --time    <float>  Simulation duration in Ma (default: 500)
 *   --dt      <float>  Timestep in Ma (default: 10)
 *   --plates  <int>    Number of initial plates (default: 7)
 *   --seed    <int>    RNG seed for reproducibility (default: 42)
 *   --co2     <float>  Atmospheric CO2 in ppm (default: 400)
 *   --out     <path>   Output .geoforge file path (default: planet.geoforge)
 *
 * Build (Linux/macOS):
 *   g++ -std=c++17 -O2 -I. \
 *       grid/geodesic_grid.cpp \
 *       tectonic/plate_setup.cpp \
 *       tectonic/tectonic_sim.cpp \
 *       climate/climate_model.cpp \
 *       io/geoforge_writer.cpp \
 *       main.cpp \
 *       -llz4 -o geoforge_sim
 *
 * Build without LZ4 (raw uncompressed channels):
 *   Add -DGEOFORGE_NO_LZ4 and remove -llz4
 */

#include "grid/geodesic_grid.h"
#include "tectonic/plate_setup.h"
#include "tectonic/tectonic_sim.h"
#include "climate/climate_model.h"
#include "io/geoforge_writer.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>
#include <cmath>

using namespace geoforge;

// --------------------------------------------------------------------------
// Argument parsing
// --------------------------------------------------------------------------

struct Args {
    int         level      = 6;
    float       time_ma    = 500.0f;
    float       dt_ma      = 10.0f;
    int         num_plates = 7;
    uint64_t    seed       = 42;
    float       co2_ppm    = 400.0f;
    std::string out_path   = "planet.geoforge";
};

static Args ParseArgs(int argc, char** argv) {
    Args a;
    for (int i = 1; i < argc - 1; ++i) {
        if      (std::strcmp(argv[i], "--level")  == 0) a.level      = std::atoi(argv[++i]);
        else if (std::strcmp(argv[i], "--time")   == 0) a.time_ma    = std::atof(argv[++i]);
        else if (std::strcmp(argv[i], "--dt")     == 0) a.dt_ma      = std::atof(argv[++i]);
        else if (std::strcmp(argv[i], "--plates") == 0) a.num_plates = std::atoi(argv[++i]);
        else if (std::strcmp(argv[i], "--seed")   == 0) a.seed       = std::atoll(argv[++i]);
        else if (std::strcmp(argv[i], "--co2")    == 0) a.co2_ppm    = std::atof(argv[++i]);
        else if (std::strcmp(argv[i], "--out")    == 0) a.out_path   = argv[++i];
    }
    return a;
}

// --------------------------------------------------------------------------
// Stats helpers
// --------------------------------------------------------------------------

static void PrintCellStats(const std::vector<CellState>& cells, float time_ma) {
    int continental = 0, oceanic = 0;
    float elev_min = 1e9f, elev_max = -1e9f, elev_sum = 0.0f;
    for (const auto& c : cells) {
        if (c.crust_type == CRUST_CONTINENTAL) continental++;
        else oceanic++;
        elev_min = std::min(elev_min, c.elevation);
        elev_max = std::max(elev_max, c.elevation);
        elev_sum += c.elevation;
    }
    int N = static_cast<int>(cells.size());
    printf("  t=%5.0f Ma | continental: %d  oceanic: %d  "
           "elev[min=%.0f max=%.0f mean=%.0f]\n",
           time_ma, continental, oceanic,
           elev_min, elev_max, elev_sum / N);
}

static void PrintClimateStats(const std::vector<ClimateCell>& climate) {
    float t_min = 1e9f, t_max = -1e9f;
    float p_min = 1e9f, p_max = -1e9f;
    int koppen[6] = {};
    for (const auto& c : climate) {
        t_min = std::min(t_min, c.temperature);
        t_max = std::max(t_max, c.temperature);
        p_min = std::min(p_min, c.precipitation);
        p_max = std::max(p_max, c.precipitation);
        if (c.koppen >= 1 && c.koppen <= 5) koppen[c.koppen]++;
    }
    printf("  Climate  | T[%.1f .. %.1f °C]  P[%.0f .. %.0f mm/yr]\n",
           t_min, t_max, p_min, p_max);
    printf("  Köppen   | A=%d B=%d C=%d D=%d E=%d\n",
           koppen[1], koppen[2], koppen[3], koppen[4], koppen[5]);
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

int main(int argc, char** argv) {
    Args a = ParseArgs(argc, argv);

    printf("GeoForge Tectonic Simulation\n");
    printf("  Grid level:   %d  (%d cells)\n", a.level,
           10 * (1 << (2 * a.level)) + 2);
    printf("  Duration:     %.0f Ma  (dt=%.0f Ma)\n", a.time_ma, a.dt_ma);
    printf("  Plates:       %d\n", a.num_plates);
    printf("  Seed:         %llu\n", (unsigned long long)a.seed);
    printf("  CO2:          %.0f ppm\n", a.co2_ppm);
    printf("  Output:       %s\n\n", a.out_path.c_str());

    try {
        // 1. Build geodesic grid
        printf("Building geodesic grid (level %d)...\n", a.level);
        GeodesicGrid grid(a.level);
        printf("  %d cells, %d pentagonal + %d hexagonal\n\n",
               grid.CellCount(), 12, grid.CellCount() - 12);

        // 2. Initialise plates
        printf("Initialising plates...\n");
        InitialPlateConfig cfg;
        cfg.num_plates           = a.num_plates;
        cfg.seed                 = a.seed;
        cfg.continental_fraction = 0.35f;
        auto [cells, plates] = InitializePlates(grid, cfg);
        PrintCellStats(cells, 0.0f);
        printf("\n");

        // 3. Run tectonic simulation
        printf("Running tectonic simulation...\n");
        TectonicSimulator sim(grid, std::move(cells), std::move(plates));
        sim.Run(a.time_ma, a.dt_ma,
            [](float t, const std::vector<CellState>& snap) {
                PrintCellStats(snap, t);
            });
        printf("\n");

        // 4. Derive climate
        printf("Deriving climate...\n");
        auto climate = ClimateModel::Derive(grid, sim.Cells(), a.co2_ppm);
        PrintClimateStats(climate);
        printf("\n");

        // 5. Write .geoforge
        printf("Writing %s...\n", a.out_path.c_str());
        GeoForgeWriter::PlanetParams planet;
        planet.co2_ppm           = a.co2_ppm;
        planet.simulation_time_ma = a.time_ma;

        GeoForgeWriter writer(a.out_path, grid.CellCount(), a.level, planet);
        writer.Finalize(sim.Cells(), climate);

        // Report file size
        FILE* f = fopen(a.out_path.c_str(), "rb");
        if (f) {
            fseek(f, 0, SEEK_END);
            long sz = ftell(f);
            fclose(f);
            printf("  Written: %s  (%.1f MB)\n\n",
                   a.out_path.c_str(), sz / 1048576.0);
        }

        printf("Done. ALL STEPS COMPLETE\n");

    } catch (const std::exception& e) {
        fprintf(stderr, "ERROR: %s\n", e.what());
        return 1;
    }

    return 0;
}
