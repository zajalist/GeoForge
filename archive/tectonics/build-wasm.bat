@echo off
REM Build the WebAssembly module using Emscripten on Windows

REM Try to activate emsdk
if exist "D:\emsdk\emsdk_env.bat" (
    call "D:\emsdk\emsdk_env.bat"
) else if exist "%USERPROFILE%\Downloads\emsdk\emsdk_env.bat" (
    call "%USERPROFILE%\Downloads\emsdk\emsdk_env.bat"
) else if not defined EMSDK (
    echo Emscripten SDK not found in environment
    echo Please run: emsdk install latest && emsdk activate latest
    exit /b 1
)

REM Create build directory
if not exist "build" mkdir build
cd build

REM Configure with Emscripten (use NMake for Windows)
call emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -G "NMake Makefiles"

REM Build
cmake --build .

echo WebAssembly build complete!
echo Output: public/sim.js and public/sim.wasm
