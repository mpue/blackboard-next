#!/bin/sh
# The ESP32 emulator of the live simulation: esp32sim (MIT, github.com/mikroverk/esp32sim) built to
# WebAssembly with scripts/esp32sim.patch (exports for the circuit coupling: GPIO in/out, PWM, ADC,
# UART; pull-ups of the classic ESP32's RTC pads), plus the files it boots: Espressif's mask ROM ELF
# (Apache-2.0) and the official MicroPython image (MIT, ESP-IDF). Everything is pinned (commit and
# SHA-256) and lands in public/esp32/, which is committed, so the app builds without Rust.
#   scripts/build-esp32.sh [WORKDIR]      needs git, curl, rustup (adds the wasm32 target)
set -e
cd "$(dirname "$0")/.."
COMMIT=3d049f5c4df9efefb76406601db7a38661c328b6
WORK=${1:-$(mktemp -d)}
OUT=public/esp32
if [ ! -d "$WORK/esp32sim/.git" ]; then git clone --quiet https://github.com/mikroverk/esp32sim.git "$WORK/esp32sim"; fi
git -C "$WORK/esp32sim" fetch --quiet origin "$COMMIT"
git -C "$WORK/esp32sim" checkout --quiet --force "$COMMIT"
git -C "$WORK/esp32sim" apply "$PWD/scripts/esp32sim.patch"
sh "$WORK/esp32sim/tools/wasm-build.sh"
sh "$WORK/esp32sim/tools/fetch-rom-elfs.sh" "$WORK/roms"
sh "$WORK/esp32sim/tools/fetch-micropython.sh" "$WORK/fw"
mkdir -p "$OUT"
cp "$WORK/esp32sim/web/wasm/esp32sim.wasm" "$OUT/esp32sim.wasm"
cp "$WORK/roms/esp32_rev300_rom.elf" "$OUT/esp32_rev300_rom.elf"
cp "$WORK/fw/ESP32_GENERIC-20260824-v1.29.0.bin" "$OUT/micropython-esp32.bin"
cp "$WORK/esp32sim/LICENSE" "$OUT/LICENSE-esp32sim.txt"
git -C "$WORK/esp32sim" checkout --quiet --force "$COMMIT"
ls -la "$OUT"
