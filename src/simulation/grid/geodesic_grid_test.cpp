#include "geodesic_grid.h"
#include <cassert>
#include <cstdio>
#include <cmath>
#include <vector>

using namespace geoforge;

static void TestCellCount() {
    // Test formula for levels 0..4 (fast), then level 6
    for (int level = 0; level <= 4; ++level) {
        GeodesicGrid g(level);
        int expected = 10 * (1 << (2 * level)) + 2;  // 10 * 4^level + 2
        assert(g.CellCount() == expected);
    }
    GeodesicGrid g6(6);
    assert(g6.CellCount() == 40962);
    printf("PASS TestCellCount\n");
}

static void TestNeighbourCounts() {
    GeodesicGrid g(6);
    int fives = 0, sixes = 0;
    for (int i = 0; i < g.CellCount(); ++i) {
        int n = static_cast<int>(g.CellNeighbours(i).size());
        assert(n == 5 || n == 6);
        if (n == 5) fives++;
        else sixes++;
    }
    assert(fives == 12);
    assert(sixes == g.CellCount() - 12);
    printf("PASS TestNeighbourCounts\n");
}

static void TestNeighbourSymmetry() {
    // Test level 4 for speed
    GeodesicGrid g4(4);  // 2562 cells
    for (int i = 0; i < g4.CellCount(); ++i) {
        for (int j : g4.CellNeighbours(i)) {
            bool found = false;
            for (int k : g4.CellNeighbours(j)) {
                if (k == i) {
                    found = true;
                    break;
                }
            }
            assert(found);
        }
    }

    // Also test level 6 (all 40,962 cells) for correctness assurance
    GeodesicGrid g6(6);
    for (int i = 0; i < g6.CellCount(); ++i) {
        for (int j : g6.CellNeighbours(i)) {
            bool found = false;
            for (int k : g6.CellNeighbours(j)) {
                if (k == i) {
                    found = true;
                    break;
                }
            }
            assert(found);
        }
    }

    printf("PASS TestNeighbourSymmetry\n");
}

static void TestSpatialHashRoundtrip() {
    GeodesicGrid g(6);
    int failures = 0;
    for (int i = 0; i < g.CellCount(); ++i) {
        auto [lat, lon] = g.CellToLatLon(i);
        int recovered = g.LatLonToCell(lat, lon);
        if (recovered != i) {
            fprintf(stderr, "FAIL cell %d: lat=%.6f lon=%.6f -> %d\n",
                    i, lat, lon, recovered);
            failures++;
            if (failures > 10) break;  // Don't spam
        }
    }
    assert(failures == 0);
    printf("PASS TestSpatialHashRoundtrip\n");
}

static void TestCellCenterDistances() {
    GeodesicGrid g(6);
    // Check first 1000 cells: all neighbours should be < 5 degrees away
    for (int i = 0; i < 1000; ++i) {
        auto [lat0, lon0] = g.CellToLatLon(i);
        for (int nb : g.CellNeighbours(i)) {
            auto [lat1, lon1] = g.CellToLatLon(nb);
            float dlat = (lat1 - lat0) * (3.14159265359f / 180.0f);
            float dlon = (lon1 - lon0) * (3.14159265359f / 180.0f);
            float a = std::sin(dlat/2)*std::sin(dlat/2)
                    + std::cos(lat0*(3.14159265359f/180.0f))
                    * std::cos(lat1*(3.14159265359f/180.0f))
                    * std::sin(dlon/2)*std::sin(dlon/2);
            float dist_deg = 2.0f * std::atan2(std::sqrt(a), std::sqrt(1.0f-a))
                           * (180.0f / 3.14159265359f);
            assert(dist_deg < 5.0f);
            break;  // Check one neighbour per cell
        }
    }
    printf("PASS TestCellCenterDistances\n");
}

static void TestPolesAccessible() {
    GeodesicGrid g(6);
    int north = g.LatLonToCell(90.0f, 0.0f);
    int south = g.LatLonToCell(-90.0f, 0.0f);

    assert(north >= 0 && north < g.CellCount());
    assert(south >= 0 && south < g.CellCount());
    assert(north != south);

    auto [lat_n, lon_n] = g.CellToLatLon(north);
    auto [lat_s, lon_s] = g.CellToLatLon(south);
    assert(std::abs(lat_n - 90.0f) < 5.0f);
    assert(std::abs(lat_s + 90.0f) < 5.0f);
    printf("PASS TestPolesAccessible\n");
}

int main() {
    printf("Running geodesic grid tests...\n");
    TestCellCount();
    TestNeighbourCounts();
    TestNeighbourSymmetry();
    TestSpatialHashRoundtrip();
    TestCellCenterDistances();
    TestPolesAccessible();
    printf("\nALL TESTS PASSED\n");
    return 0;
}
