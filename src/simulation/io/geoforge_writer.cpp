#include "geoforge_writer.h"
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <vector>
#include <cmath>

#ifndef GEOFORGE_NO_LZ4
  #include <lz4.h>
#endif

namespace geoforge {

namespace {

// Write helpers
void WriteBytes(FILE* f, const void* data, size_t n) {
    if (fwrite(data, 1, n, f) != n)
        throw std::runtime_error("geoforge_writer: write error");
}

void WritePad(FILE* f, size_t n) {
    static const uint8_t zero[256] = {};
    while (n > 0) {
        size_t chunk = std::min(n, sizeof(zero));
        WriteBytes(f, zero, chunk);
        n -= chunk;
    }
}

template<typename T>
void WriteVal(FILE* f, T v) { WriteBytes(f, &v, sizeof(T)); }

} // namespace

// --------------------------------------------------------------------------
// Construction
// --------------------------------------------------------------------------

GeoForgeWriter::GeoForgeWriter(const std::string& path,
                                int cell_count,
                                int grid_level,
                                const PlanetParams& params)
    : path_(path),
      cell_count_(cell_count),
      grid_level_(grid_level),
      params_(params) {}

// --------------------------------------------------------------------------
// Finalize
// --------------------------------------------------------------------------

void GeoForgeWriter::Finalize(const std::vector<CellState>& tectonic,
                               const std::vector<ClimateCell>& climate) {
    const int N = cell_count_;

    // --- Build raw channel buffers ---

    // Ch 0: elevation f32
    std::vector<float> ch_elevation(N);
    for (int i = 0; i < N; ++i) ch_elevation[i] = tectonic[i].elevation;

    // Ch 1: crust_type u8
    std::vector<uint8_t> ch_crust(N);
    for (int i = 0; i < N; ++i) ch_crust[i] = tectonic[i].crust_type;

    // Ch 2: plate_id u8
    std::vector<uint8_t> ch_plate(N);
    for (int i = 0; i < N; ++i) ch_plate[i] = tectonic[i].plate_id;

    // Ch 3: ocean_age u16
    std::vector<uint16_t> ch_ocean_age(N);
    for (int i = 0; i < N; ++i) ch_ocean_age[i] = tectonic[i].ocean_age;

    // Ch 4: orogeny_type u8
    std::vector<uint8_t> ch_orogeny(N);
    for (int i = 0; i < N; ++i) ch_orogeny[i] = tectonic[i].orogeny_type;

    // Ch 5: temperature f32
    std::vector<float> ch_temp(N);
    for (int i = 0; i < N; ++i) ch_temp[i] = climate[i].temperature;

    // Ch 6: precipitation f32
    std::vector<float> ch_precip(N);
    for (int i = 0; i < N; ++i) ch_precip[i] = climate[i].precipitation;

    // Ch 7: koppen u8
    std::vector<uint8_t> ch_koppen(N);
    for (int i = 0; i < N; ++i) ch_koppen[i] = climate[i].koppen;

    // Channels 8-23: empty (reserved)
    std::vector<uint8_t> ch_reserved(N, 0);

    // Compress all channels
    struct RawCh { const void* data; size_t raw_bytes; uint8_t dtype; };
    std::vector<RawCh> raw_channels = {
        {ch_elevation.data(), N*4, 3},
        {ch_crust.data(),     N*1, 0},
        {ch_plate.data(),     N*1, 0},
        {ch_ocean_age.data(), N*2, 1},
        {ch_orogeny.data(),   N*1, 0},
        {ch_temp.data(),      N*4, 3},
        {ch_precip.data(),    N*4, 3},
        {ch_koppen.data(),    N*1, 0},
    };
    for (int i = 8; i < kNumChannels; ++i)
        raw_channels.push_back({ch_reserved.data(), N*1, 0});

    std::vector<std::vector<uint8_t>> compressed(kNumChannels);
    for (int i = 0; i < kNumChannels; ++i)
        compressed[i] = Compress(raw_channels[i].data, raw_channels[i].raw_bytes);

    // --- Layout offsets ---
    // Header: 256 bytes
    // Channel index: 512 bytes
    // Data starts at 768
    static constexpr uint64_t kHeaderSize  = 256;
    static constexpr uint64_t kIndexSize   = 512; // 24 * 21 = 504, pad to 512

    uint64_t data_offset = kHeaderSize + kIndexSize;
    std::vector<ChannelEntry> index(kNumChannels);
    for (int i = 0; i < kNumChannels; ++i) {
        index[i].byte_offset       = data_offset;
        index[i].compressed_size   = static_cast<uint32_t>(compressed[i].size());
        index[i].uncompressed_size = static_cast<uint32_t>(raw_channels[i].raw_bytes);
        index[i].dtype             = raw_channels[i].dtype;
        data_offset += compressed[i].size();
    }

    // --- Write file ---
    FILE* f = fopen(path_.c_str(), "wb");
    if (!f) throw std::runtime_error("geoforge_writer: cannot open " + path_);

    // HEADER (256 bytes)
    // magic[4] version[2] cell_count[4] grid_level[1] channel_count[1]
    // radius_km[4] axial_tilt[4] co2_ppm[4] stellar_lum[4] sim_time_ma[4]
    // → 28 bytes of fields, pad to 256

    WriteBytes(f, "GFG2", 4);
    WriteVal<uint16_t>(f, 1);                                   // version
    WriteVal<uint32_t>(f, static_cast<uint32_t>(cell_count_));
    WriteVal<uint8_t> (f, static_cast<uint8_t>(grid_level_));
    WriteVal<uint8_t> (f, kNumChannels);
    WriteVal<float>   (f, params_.radius_km);
    WriteVal<float>   (f, params_.axial_tilt_deg);
    WriteVal<float>   (f, params_.co2_ppm);
    WriteVal<float>   (f, params_.stellar_luminosity);
    WriteVal<float>   (f, params_.simulation_time_ma);
    // 4+2+4+1+1+4+4+4+4+4 = 32 bytes written; pad to 256
    WritePad(f, 256 - 32);

    // CHANNEL INDEX (512 bytes)
    // 24 entries × 21 bytes each = 504 bytes; pad 8 bytes
    for (int i = 0; i < kNumChannels; ++i) {
        WriteVal<uint64_t>(f, index[i].byte_offset);
        WriteVal<uint32_t>(f, index[i].compressed_size);
        WriteVal<uint32_t>(f, index[i].uncompressed_size);
        WriteVal<uint8_t> (f, index[i].dtype);
    }
    WritePad(f, 512 - kNumChannels * 21);

    // CHANNEL DATA
    for (int i = 0; i < kNumChannels; ++i)
        WriteBytes(f, compressed[i].data(), compressed[i].size());

    fclose(f);
}

// --------------------------------------------------------------------------
// Compression
// --------------------------------------------------------------------------

std::vector<uint8_t> GeoForgeWriter::Compress(const void* data, size_t raw_bytes) {
#ifndef GEOFORGE_NO_LZ4
    int max_dst = LZ4_compressBound(static_cast<int>(raw_bytes));
    std::vector<uint8_t> dst(max_dst);
    int compressed_size = LZ4_compress_default(
        static_cast<const char*>(data),
        reinterpret_cast<char*>(dst.data()),
        static_cast<int>(raw_bytes),
        max_dst);
    if (compressed_size <= 0)
        throw std::runtime_error("geoforge_writer: LZ4 compression failed");
    dst.resize(compressed_size);
    return dst;
#else
    // No LZ4: store raw bytes; compressed_size == uncompressed_size signals this
    const uint8_t* bytes = static_cast<const uint8_t*>(data);
    return std::vector<uint8_t>(bytes, bytes + raw_bytes);
#endif
}

} // namespace geoforge
