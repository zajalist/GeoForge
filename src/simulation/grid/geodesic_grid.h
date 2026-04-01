#pragma once

#include <vector>
#include <utility>
#include <array>
#include <unordered_map>
#include <cstdint>
#include <cmath>

namespace geoforge {

/**
 * GeodesicGrid — icosphere subdivision grid on the unit sphere.
 *
 * Level-6 produces 40,962 cells (vertices of the subdivided icosahedron).
 * Cell indices 0..11 are the 12 pentagonal cells (5 neighbours each).
 * All other cells are hexagonal (6 neighbours each).
 *
 * Thread safety: read-only after construction.
 */
class GeodesicGrid {
public:
    /**Vertex position in 3D (unit sphere)*/
    struct Vec3 {
        float x, y, z;

        Vec3() : x(0), y(0), z(0) {}
        Vec3(float x, float y, float z) : x(x), y(y), z(z) {}

        Vec3 operator+(const Vec3& other) const {
            return Vec3(x + other.x, y + other.y, z + other.z);
        }

        Vec3 operator*(float scalar) const {
            return Vec3(x * scalar, y * scalar, z * scalar);
        }

        float Length() const {
            return std::sqrt(x*x + y*y + z*z);
        }

        Vec3 Normalized() const {
            float len = Length();
            return Vec3(x/len, y/len, z/len);
        }
    };

    /**Construct a geodesic grid at the given subdivision level.*/
    explicit GeodesicGrid(int level = 6);

    /**Destructor.*/
    ~GeodesicGrid() = default;

    // --- Core interface ---

    /**Total number of cells in the grid.*/
    int CellCount() const { return static_cast<int>(vertices_.size()); }

    /**Get cell center coordinates.*/
    std::pair<float, float> CellCenter(int cell_idx) const;

    /**Get indices of cells neighbouring the given cell.*/
    const std::vector<int>& CellNeighbours(int cell_idx) const;

    /**Find the cell at the given geographic location.*/
    int LatLonToCell(float lat, float lon) const;

    /**Get geographic coordinates of a cell center.*/
    std::pair<float, float> CellToLatLon(int cell_idx) const;

    // --- Accessors for simulation ---

    /**Get vertex position (unit sphere) of a cell.*/
    const Vec3& CellVertex(int cell_idx) const { return vertices_[cell_idx]; }

    /**Subdivision level.*/
    int Level() const { return level_; }

private:
    // --- Build pipeline ---

    void BuildIcosahedron();
    void SubdivideOnce();
    void ProjectToSphere();
    void BuildAdjacency();
    void BuildSpatialHash();

    // --- Spatial hash helpers ---

    int FindNearest(float x, float y, float z) const;
    std::array<int, 3> HashBucket(float x, float y, float z) const;

    // --- Conversion helpers ---

    static Vec3 LatLonToXyz(float lat_deg, float lon_deg);
    static std::pair<float, float> XyzToLatLon(float x, float y, float z);

    // --- Data ---

    int level_;
    std::vector<Vec3>              vertices_;   // Cell centers (unit sphere)
    std::vector<std::array<int,3>> faces_;      // Triangular faces
    std::vector<std::vector<int>>  adjacency_;  // Neighbour lists

    // Spatial hash: 3D grid over [-1,1]^3 bucketed at resolution kHashRes
    static constexpr int kHashRes = 64;
    std::vector<std::vector<int>> hash_buckets_;
    float hash_cell_size_;
};

}  // namespace geoforge
