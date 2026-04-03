#!/bin/bash

# Build the WebAssembly module using Emscripten

# Check if emcripten is installed
if ! command -v emcmake &> /dev/null; then
    echo "Emscripten not found. Please install it from: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Create build directory
mkdir -p build
cd build

# Configure with Emscripten
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build . -j$(nproc)

echo "WebAssembly build complete!"
echo "Output: public/sim.js and public/sim.wasm"
