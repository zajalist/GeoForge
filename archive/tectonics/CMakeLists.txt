cmake_minimum_required(VERSION 3.16)
project(wilson-cycles LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Emscripten toolchain handling
if(EMSCRIPTEN)
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -sWASM=1 -sALLOW_MEMORY_GROWTH=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -sWASM=1 -sALLOW_MEMORY_GROWTH=1 -fexceptions")
    
    # Binding glue code generation
    set(EMSCRIPTEN_BINDINGS ON)
endif()

# Source files
set(SOURCES
    src/cpp/src/GeoTypes.cpp
    src/cpp/src/TectonicSimulation.cpp
    src/cpp/src/Bindings.cpp
)

set(HEADERS
    src/cpp/include/GeoTypes.hpp
    src/cpp/include/TectonicSimulation.hpp
)

# Create library
if(EMSCRIPTEN)
    add_executable(wilson_cycles ${SOURCES} ${HEADERS})
    
    set_target_properties(wilson_cycles PROPERTIES
        SUFFIX ".js"
        PREFIX ""
    )
    
    target_link_options(wilson_cycles PRIVATE
        "SHELL:-lembind"
        "SHELL:-sWASM=1"
        "SHELL:-sALLOW_MEMORY_GROWTH=1"
        "SHELL:-sEXPORT_ES6=1"
        "SHELL:-sMODULARIZE=1"
        "SHELL:-sEXPORTED_FUNCTIONS=['_malloc','_free']"
    )
else()
    add_library(wilson_cycles STATIC ${SOURCES} ${HEADERS})
endif()

target_include_directories(wilson_cycles PUBLIC src/cpp/include)

# Copy output to public directory for web server
if(EMSCRIPTEN)
    add_custom_command(TARGET wilson_cycles POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy
            $<TARGET_FILE:wilson_cycles>
            "${CMAKE_SOURCE_DIR}/public/sim.js"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_CURRENT_BINARY_DIR}/wilson_cycles.wasm"
            "${CMAKE_SOURCE_DIR}/public/sim.wasm"
    )
endif()
