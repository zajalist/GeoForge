@echo off
REM Direct Emscripten compilation without CMake
REM This is simpler and more reliable on Windows

REM Activate emsdk if available
if exist "%USERPROFILE%\Downloads\emsdk\emsdk_env.bat" (
    call "%USERPROFILE%\Downloads\emsdk\emsdk_env.bat"
)

REM Check if emcc is available
where emcc >nul 2>nul
if errorlevel 1 (
    echo Error: emcc not found in PATH
    echo Please activate Emscripten: call C:\Users\Admin\Downloads\emsdk\emsdk_env.bat
    exit /b 1
)

echo Building Wilson Cycles WebAssembly module...

REM Create output directory
if not exist "public" mkdir public

REM Compile C++ sources directly with emcc
emcc ^
    -std=c++17 ^
    -O3 ^
    -lembind ^
    -o public\sim.js ^
    src\cpp\src\GeoTypes.cpp ^
    src\cpp\src\TectonicSimulation.cpp ^
    src\cpp\src\Bindings.cpp ^
    -I src\cpp\include ^
    -s WASM=1 ^
    -s ALLOW_MEMORY_GROWTH=1 ^
    -s MODULARIZE=1 ^
    -s EXPORT_NAME=createTectonicModule

if errorlevel 1 (
    echo Error: Emscripten compilation failed
    exit /b 1
)

echo.
echo WebAssembly build complete!
echo Output: public\sim.js and public\sim.wasm
echo.
