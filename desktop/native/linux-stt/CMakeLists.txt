cmake_minimum_required(VERSION 3.16)
project(cats-stt-linux LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# whisper.cpp ships as a pinned git submodule under whisper.cpp/. Maintainers
# bootstrap it with:
#   git submodule add --depth 1 -b <release-tag> \
#     https://github.com/ggerganov/whisper.cpp.git \
#     cats-platform/desktop/native/linux-stt/whisper.cpp
#
# The build deliberately fails fast when the submodule is missing rather than
# silently fetching from the network mid-build, matching the project's
# "no untrusted external code without explicit maintainer action" stance.
if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/whisper.cpp/CMakeLists.txt")
  message(FATAL_ERROR
    "whisper.cpp submodule is missing. Run "
    "`git submodule update --init cats-platform/desktop/native/linux-stt/whisper.cpp` "
    "or `git submodule add` it as documented in PLAN-078 Phase 1."
  )
endif()

# Disable whisper.cpp's optional features that would pull in additional
# runtime dependencies (curl for model fetch, server / examples binaries we
# do not ship). We only need the inference library.
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_CURL OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

add_subdirectory(whisper.cpp)

# libpulse-simple is the audio capture backend. The deb declares libpulse0 in
# Depends; AppImage / tar.gz builds need the lib bundled by the packager.
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBPULSE_SIMPLE REQUIRED IMPORTED_TARGET libpulse-simple)

add_executable(cats-stt-linux src/main.cpp)
target_link_libraries(cats-stt-linux
  PRIVATE
    whisper
    PkgConfig::LIBPULSE_SIMPLE
)
target_compile_options(cats-stt-linux PRIVATE -Wall -Wextra -Wpedantic)

# Reject network deps sneaking in via whisper.cpp options. The build should
# fail loudly if libcurl / libssl ever ends up linked.
set_target_properties(cats-stt-linux PROPERTIES
  INTERPROCEDURAL_OPTIMIZATION_RELEASE ON
)
