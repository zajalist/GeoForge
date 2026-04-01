#pragma once

#include "../tectonic/cell_data.h"
#include "../climate/climate_model.h"
#include <cstdint>
#include <string>
#include <vector>

namespace geoforge {

/**
 * GeoForgeWriter
 *
 * Writes a .geoforge binary file in the GFG2 format:
 *
 *   HEADER       (256 bytes) — magic, version, grid params, planet params
 *   CHANNEL INDEX(512 bytes) — 24 entries: byte_offset, sizes, dtype
 *   CHANNEL DATA             — 24 LZ4-compressed channels
 *
 * Channel layout (channels 8-23 are zeroed/reserved):
 *   0  f32  elevation (m)
 *   1  u8   crust_type
 *   2  u8   plate_id
 *   3  u16  ocean_age (Ma)
 *   4  u8   orogeny_type
 *   5  f32  temperature (°C)
 *   6  f32  precipitation (mm/yr)
 *   7  u8   koppen_zone
 *
 * LZ4 compression is used when liblz4 is available (linked with -llz4).
 * If compiled with -DGEOFORGE_NO_LZ4, channels are written uncompressed.
 */
class GeoForgeWriter {
public:
    struct PlanetParams {
        float radius_km          = 6371.0f;
        float axial_tilt_deg     = 23.5f;
        float co2_ppm            = 400.0f;
        float stellar_luminosity = 1.0f;
        float simulation_time_ma = 500.0f;
    };

    GeoForgeWriter(const std::string& path,
                   int cell_count,
                   int grid_level,
                   const PlanetParams& params = PlanetParams{});

    /**
     * Write all channels and close the file.
     * Call exactly once per writer instance.
     */
    void Finalize(const std::vector<CellState>& tectonic,
                  const std::vector<ClimateCell>& climate);

private:
    static constexpr int kNumChannels = 24;

    struct ChannelEntry {
        uint64_t byte_offset      = 0;
        uint32_t compressed_size  = 0;
        uint32_t uncompressed_size = 0;
        uint8_t  dtype            = 0; // 0=u8 1=u16 2=u32 3=f32
    };

    std::vector<uint8_t> Compress(const void* data, size_t raw_bytes);

    std::string   path_;
    int           cell_count_;
    int           grid_level_;
    PlanetParams  params_;
};

} // namespace geoforge
