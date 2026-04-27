#!/bin/sh
# Fetch and verify the bundled whisper.cpp model file.
#
# Idempotent: if the cached file already exists and matches the pinned
# SHA-256, the script exits without re-downloading.
#
# Usage:
#   fetch-model.sh <output-dir>
#
# Output:
#   <output-dir>/ggml-base.bin

set -eu

if [ "$#" -ne 1 ]; then
  printf >&2 'Usage: %s <output-dir>\n' "$0"
  exit 2
fi

OUTPUT_DIR="$1"
MODEL_NAME="ggml-base.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}"
# SHA-256 pinned to the upstream ggml-base.bin distributed by whisper.cpp.
# Maintainers must update this when bumping the model; CI verifies on every
# build so a silent swap is loud.
EXPECTED_SHA256="60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"

mkdir -p "${OUTPUT_DIR}"
OUTPUT_PATH="${OUTPUT_DIR}/${MODEL_NAME}"

verify_sha256() {
  if [ ! -f "${OUTPUT_PATH}" ]; then
    return 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "${OUTPUT_PATH}" | cut -d' ' -f1)"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "${OUTPUT_PATH}" | cut -d' ' -f1)"
  else
    printf >&2 'fetch-model.sh: neither sha256sum nor shasum found\n'
    return 2
  fi
  [ "${actual}" = "${EXPECTED_SHA256}" ]
}

if verify_sha256; then
  printf 'fetch-model.sh: %s already cached and verified\n' "${OUTPUT_PATH}"
  exit 0
fi

printf 'fetch-model.sh: downloading %s -> %s\n' "${MODEL_URL}" "${OUTPUT_PATH}"
if command -v curl >/dev/null 2>&1; then
  curl --fail --location --output "${OUTPUT_PATH}" "${MODEL_URL}"
elif command -v wget >/dev/null 2>&1; then
  wget --output-document="${OUTPUT_PATH}" "${MODEL_URL}"
else
  printf >&2 'fetch-model.sh: neither curl nor wget found\n'
  exit 2
fi

if ! verify_sha256; then
  printf >&2 'fetch-model.sh: SHA-256 mismatch on %s\n' "${OUTPUT_PATH}"
  rm -f "${OUTPUT_PATH}"
  exit 3
fi

printf 'fetch-model.sh: %s downloaded and verified\n' "${OUTPUT_PATH}"
