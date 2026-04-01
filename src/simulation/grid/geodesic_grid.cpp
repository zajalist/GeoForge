#include "geodesic_grid.h"
#include <algorithm>
#include <limits>
#include <unordered_set>

namespace geoforge {

GeodesicGrid::GeodesicGrid(int level)
    : level_(level),
      hash_cell_size_(2.0f / kHashRes) {
    BuildIcosahedron();
    for (int i = 0; i < level; ++i) {
        SubdivideOnce();
    }
    ProjectToSphere();
    BuildAdjacency();
    BuildSpatialHash();
}

std::pair<float, float> GeodesicGrid::CellCenter(int cell_idx) const {
    return CellToLatLon(cell_idx);
}

const std::vector<int>& GeodesicGrid::CellNeighbours(int cell_idx) const {
    return adjacency_[cell_idx];
}

int GeodesicGrid::LatLonToCell(float lat, float lon) const {
    Vec3 xyz = LatLonToXyz(lat, lon);
    return FindNearest(xyz.x, xyz.y, xyz.z);
}

std::pair<float, float> GeodesicGrid::CellToLatLon(int cell_idx) const {
    const Vec3& v = vertices_[cell_idx];
    return XyzToLatLon(v.x, v.y, v.z);
}

// --- Private build methods ---

void GeodesicGrid::BuildIcosahedron() {
    const float phi = (1.0f + std::sqrt(5.0f)) / 2.0f;

    // Canonical vertex ordering (must match Python implementation)
    std::vector<Vec3> vertices_raw = {
        Vec3(0, 1, phi).Normalized(),
        Vec3(0, -1, phi).Normalized(),
        Vec3(0, 1, -phi).Normalized(),
        Vec3(0, -1, -phi).Normalized(),
        Vec3(1, phi, 0).Normalized(),
        Vec3(-1, phi, 0).Normalized(),
        Vec3(1, -phi, 0).Normalized(),
        Vec3(-1, -phi, 0).Normalized(),
        Vec3(phi, 0, 1).Normalized(),
        Vec3(-phi, 0, 1).Normalized(),
        Vec3(phi, 0, -1).Normalized(),
        Vec3(-phi, 0, -1).Normalized(),
    };

    vertices_ = vertices_raw;

    // 20 faces, CCW from outside (computed from golden ratio icosahedron)
    faces_ = {
        {0, 1, 8}, {0, 9, 1}, {0, 4, 5}, {0, 8, 4}, {0, 5, 9},
        {1, 7, 6}, {1, 6, 8}, {1, 9, 7}, {2, 10, 3}, {2, 3, 11},
        {2, 5, 4}, {2, 4, 10}, {2, 11, 5}, {3, 6, 7}, {3, 10, 6},
        {3, 7, 11}, {4, 8, 10}, {5, 11, 9}, {6, 10, 8}, {7, 9, 11},
    };
}

void GeodesicGrid::SubdivideOnce() {
    std::unordered_map<uint64_t, int> midpoint_cache;

    auto EdgeKey = [](int a, int b) -> uint64_t {
        if (a > b) std::swap(a, b);
        return (static_cast<uint64_t>(a) << 32) | static_cast<uint64_t>(b);
    };

    auto GetMidpoint = [&](int a, int b) -> int {
        uint64_t key = EdgeKey(a, b);
        auto it = midpoint_cache.find(key);
        if (it != midpoint_cache.end()) return it->second;

        // Average, not yet normalized
        Vec3 mid = (vertices_[a] + vertices_[b]) * 0.5f;
        int idx = static_cast<int>(vertices_.size());
        vertices_.push_back(mid);
        midpoint_cache[key] = idx;
        return idx;
    };

    std::vector<std::array<int, 3>> new_faces;
    new_faces.reserve(faces_.size() * 4);

    for (auto& f : faces_) {
        int mab = GetMidpoint(f[0], f[1]);
        int mbc = GetMidpoint(f[1], f[2]);
        int mca = GetMidpoint(f[2], f[0]);

        new_faces.push_back({f[0], mab, mca});
        new_faces.push_back({f[1], mbc, mab});
        new_faces.push_back({f[2], mca, mbc});
        new_faces.push_back({mab, mbc, mca});
    }

    faces_ = std::move(new_faces);
}

void GeodesicGrid::ProjectToSphere() {
    for (auto& v : vertices_) {
        v = v.Normalized();
    }
}

void GeodesicGrid::BuildAdjacency() {
    int N = static_cast<int>(vertices_.size());
    adjacency_.assign(N, {});

    // Temporary sets to deduplicate
    std::vector<std::unordered_set<int>> adj_sets(N);

    for (auto& f : faces_) {
        int a = f[0], b = f[1], c = f[2];
        adj_sets[a].insert(b);
        adj_sets[a].insert(c);
        adj_sets[b].insert(a);
        adj_sets[b].insert(c);
        adj_sets[c].insert(a);
        adj_sets[c].insert(b);
    }

    for (int i = 0; i < N; ++i) {
        adjacency_[i].assign(adj_sets[i].begin(), adj_sets[i].end());
        std::sort(adjacency_[i].begin(), adjacency_[i].end());
    }

    // Clear faces to free memory
    faces_.clear();
    faces_.shrink_to_fit();
}

void GeodesicGrid::BuildSpatialHash() {
    hash_buckets_.resize(kHashRes * kHashRes * kHashRes);

    for (int i = 0; i < static_cast<int>(vertices_.size()); ++i) {
        auto bucket = HashBucket(vertices_[i].x, vertices_[i].y, vertices_[i].z);
        int flat = bucket[0] * kHashRes * kHashRes
                 + bucket[1] * kHashRes
                 + bucket[2];
        hash_buckets_[flat].push_back(i);
    }
}

// --- Spatial hash helpers ---

std::array<int, 3> GeodesicGrid::HashBucket(float x, float y, float z) const {
    auto Clamp = [](int v, int lo, int hi) {
        return v < lo ? lo : v > hi ? hi : v;
    };

    int bx = Clamp(static_cast<int>((x + 1.0f) / hash_cell_size_), 0, kHashRes - 1);
    int by = Clamp(static_cast<int>((y + 1.0f) / hash_cell_size_), 0, kHashRes - 1);
    int bz = Clamp(static_cast<int>((z + 1.0f) / hash_cell_size_), 0, kHashRes - 1);
    return {bx, by, bz};
}

int GeodesicGrid::FindNearest(float x, float y, float z) const {
    auto bucket = HashBucket(x, y, z);
    int best_idx = -1;
    float best_dist_sq = std::numeric_limits<float>::max();

    // Probe expanding shells (up to 4 ensures all cells are found even with rounding)
    for (int shell = 0; shell <= 4; ++shell) {
        for (int dx = -shell; dx <= shell; ++dx) {
        for (int dy = -shell; dy <= shell; ++dy) {
        for (int dz = -shell; dz <= shell; ++dz) {
            // Only visit cells on the surface of the current shell
            if (shell > 0 &&
                std::abs(dx) < shell &&
                std::abs(dy) < shell &&
                std::abs(dz) < shell) {
                continue;
            }

            int nx = bucket[0] + dx;
            int ny = bucket[1] + dy;
            int nz = bucket[2] + dz;
            if (nx < 0 || nx >= kHashRes) continue;
            if (ny < 0 || ny >= kHashRes) continue;
            if (nz < 0 || nz >= kHashRes) continue;

            int flat = nx * kHashRes * kHashRes + ny * kHashRes + nz;
            for (int idx : hash_buckets_[flat]) {
                const Vec3& v = vertices_[idx];
                float d2 = (v.x-x)*(v.x-x) + (v.y-y)*(v.y-y) + (v.z-z)*(v.z-z);
                if (d2 < best_dist_sq) {
                    best_dist_sq = d2;
                    best_idx = idx;
                }
            }
        }}}

        if (best_idx >= 0) {
            // Early termination: if best distance < shell boundary, no closer cell exists
            float shell_boundary = (shell * hash_cell_size_) * (shell * hash_cell_size_);
            if (best_dist_sq <= shell_boundary) break;
        }
    }

    return best_idx;
}

// --- Conversion helpers ---

GeodesicGrid::Vec3 GeodesicGrid::LatLonToXyz(float lat_deg, float lon_deg) {
    float lat_r = lat_deg * (3.14159265359f / 180.0f);
    float lon_r = lon_deg * (3.14159265359f / 180.0f);
    return Vec3(
        std::cos(lat_r) * std::cos(lon_r),
        std::cos(lat_r) * std::sin(lon_r),
        std::sin(lat_r)
    );
}

std::pair<float, float> GeodesicGrid::XyzToLatLon(float x, float y, float z) {
    // Guard against floating-point rounding
    z = std::clamp(z, -1.0f, 1.0f);
    float lat = std::asin(z) * (180.0f / 3.14159265359f);
    float lon = std::atan2(y, x) * (180.0f / 3.14159265359f);
    return {lat, lon};
}

}  // namespace geoforge
