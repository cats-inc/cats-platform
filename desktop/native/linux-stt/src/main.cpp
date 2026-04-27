// cats-stt-linux: Linux composer voice input helper for cats-platform.
//
// Captures microphone audio via PulseAudio (libpulse-simple), runs
// whisper.cpp inference on stop, and emits the same line-delimited JSON
// event protocol used by the macOS / Windows native helpers (SPEC-087).
//
// CLI:
//   cats-stt-linux --session-id <id> [--locale <bcp47>] [--input <wav>]
//
// The --input flag is gated behind the env var
// CATS_STT_ENABLE_FIXTURE_INPUT=1 and is intended only for repeatable unit
// tests; production builds reject the flag.

#include <whisper.h>

#include <pulse/error.h>
#include <pulse/simple.h>

#include <atomic>
#include <cerrno>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>

namespace {

constexpr int kSampleRateHz = 16000;
constexpr int kChannels = 1;
constexpr size_t kReadFrames = 320;  // ~20 ms at 16 kHz mono
constexpr size_t kMaxRecordingSeconds = 30;
constexpr size_t kMaxRecordingSamples =
    static_cast<size_t>(kSampleRateHz) * kMaxRecordingSeconds;

struct CliOptions {
  std::string session_id;
  std::string locale;
  std::string input_path;  // test-only fixture path
};

bool fixture_input_enabled() {
  const char* value = std::getenv("CATS_STT_ENABLE_FIXTURE_INPUT");
  return value != nullptr && std::strcmp(value, "1") == 0;
}

std::optional<CliOptions> parse_cli(int argc, char** argv) {
  CliOptions options;
  const bool fixture_enabled = fixture_input_enabled();

  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--session-id") {
      if (++i >= argc) return std::nullopt;
      options.session_id = argv[i];
    } else if (arg == "--locale") {
      if (++i >= argc) return std::nullopt;
      options.locale = argv[i];
    } else if (arg == "--input") {
      if (!fixture_enabled) return std::nullopt;
      if (++i >= argc) return std::nullopt;
      options.input_path = argv[i];
    } else {
      return std::nullopt;
    }
  }

  if (options.session_id.empty()) {
    return std::nullopt;
  }
  return options;
}

std::string json_escape(const std::string& text) {
  std::string out;
  out.reserve(text.size() + 2);
  for (char c : text) {
    switch (c) {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

class JsonEmitter {
 public:
  explicit JsonEmitter(std::string session_id)
      : session_id_(std::move(session_id)) {}

  void ready(const std::string& locale) {
    std::ostringstream out;
    out << R"({"type":"ready","sessionId":")" << json_escape(session_id_)
        << R"(","locale":")" << json_escape(locale)
        << R"(","mode":"on-device"})";
    emit(out.str());
  }

  void final_text(const std::string& text) {
    std::ostringstream out;
    out << R"({"type":"final","sessionId":")" << json_escape(session_id_)
        << R"(","text":")" << json_escape(text) << R"("})";
    emit(out.str());
  }

  void error(const std::string& reason) {
    std::ostringstream out;
    out << R"({"type":"error","sessionId":")" << json_escape(session_id_)
        << R"(","reason":")" << json_escape(reason) << R"("})";
    emit(out.str());
  }

  void end() {
    std::ostringstream out;
    out << R"({"type":"end","sessionId":")" << json_escape(session_id_)
        << R"("})";
    emit(out.str());
  }

 private:
  void emit(const std::string& line) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::cout << line << '\n';
    std::cout.flush();
  }

  const std::string session_id_;
  std::mutex mutex_;
};

// Bare-minimum JSON command parser for the
// `{"type":"stop|cancel","sessionId":"..."}` shape we accept on stdin.
// Mirrors the macOS / Windows helpers, which use full JSON parsers; here
// we keep the dep surface small but match shape exactly. Reject anything
// that does not have a sessionId match.
std::optional<std::string> parse_control_command(
    const std::string& line,
    const std::string& expected_session_id) {
  auto find_string_field = [&](const std::string& key) -> std::optional<std::string> {
    const std::string needle = "\"" + key + "\"";
    auto pos = line.find(needle);
    if (pos == std::string::npos) return std::nullopt;
    pos = line.find(':', pos + needle.size());
    if (pos == std::string::npos) return std::nullopt;
    pos = line.find('"', pos);
    if (pos == std::string::npos) return std::nullopt;
    auto end = line.find('"', pos + 1);
    if (end == std::string::npos) return std::nullopt;
    return line.substr(pos + 1, end - pos - 1);
  };

  auto type = find_string_field("type");
  auto session_id = find_string_field("sessionId");
  if (!type || !session_id) return std::nullopt;
  if (*session_id != expected_session_id) return std::nullopt;
  if (*type == "stop" || *type == "cancel") return *type;
  return std::nullopt;
}

std::filesystem::path resolve_model_path() {
  std::error_code ec;
  auto exe = std::filesystem::canonical("/proc/self/exe", ec);
  if (ec) return {};
  return exe.parent_path() / "ggml-base.bin";
}

std::string normalize_whisper_locale(const std::string& bcp47) {
  // whisper.cpp expects a 2-letter ISO code (e.g. "en", "zh"). Take the
  // first language subtag from a BCP-47 string like "en-US" or "zh-Hant".
  if (bcp47.empty()) return "auto";
  auto dash = bcp47.find('-');
  std::string lang = (dash == std::string::npos) ? bcp47 : bcp47.substr(0, dash);
  for (char& c : lang) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return lang;
}

std::vector<float> samples_to_float32(const std::vector<int16_t>& pcm) {
  std::vector<float> out(pcm.size());
  constexpr float kInvScale = 1.0f / 32768.0f;
  for (size_t i = 0; i < pcm.size(); ++i) {
    out[i] = static_cast<float>(pcm[i]) * kInvScale;
  }
  return out;
}

std::string transcribe(whisper_context* ctx, const std::vector<float>& samples,
                       const std::string& locale_hint) {
  whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
  params.print_realtime = false;
  params.print_progress = false;
  params.print_timestamps = false;
  params.print_special = false;
  params.translate = false;
  params.no_context = true;
  params.single_segment = false;
  const std::string lang = normalize_whisper_locale(locale_hint);
  params.language = lang.c_str();

  if (whisper_full(ctx, params, samples.data(), static_cast<int>(samples.size())) != 0) {
    return {};
  }

  std::string out;
  const int segments = whisper_full_n_segments(ctx);
  for (int i = 0; i < segments; ++i) {
    const char* text = whisper_full_get_segment_text(ctx, i);
    if (text != nullptr) out += text;
  }
  // Trim leading whitespace whisper emits before each segment.
  size_t start = out.find_first_not_of(" \t\r\n");
  if (start == std::string::npos) return {};
  return out.substr(start);
}

// Tiny WAV reader for fixture mode. Accepts 16 kHz mono PCM s16le; rejects
// anything else with an empty result so the helper can emit
// engine_unavailable rather than mis-transcribe.
std::optional<std::vector<int16_t>> read_wav_fixture(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) return std::nullopt;

  char header[44];
  f.read(header, sizeof(header));
  if (!f || std::memcmp(header, "RIFF", 4) != 0 || std::memcmp(header + 8, "WAVE", 4) != 0) {
    return std::nullopt;
  }
  const auto channels = *reinterpret_cast<const uint16_t*>(header + 22);
  const auto sample_rate = *reinterpret_cast<const uint32_t*>(header + 24);
  const auto bits = *reinterpret_cast<const uint16_t*>(header + 34);
  if (channels != kChannels || sample_rate != static_cast<uint32_t>(kSampleRateHz) || bits != 16) {
    return std::nullopt;
  }
  const auto data_size = *reinterpret_cast<const uint32_t*>(header + 40);
  std::vector<int16_t> samples(data_size / sizeof(int16_t));
  f.read(reinterpret_cast<char*>(samples.data()), data_size);
  if (!f) return std::nullopt;
  return samples;
}

int run_microphone_recognition(const CliOptions& options, JsonEmitter& emitter,
                               whisper_context* ctx) {
  pa_sample_spec spec;
  spec.format = PA_SAMPLE_S16LE;
  spec.rate = kSampleRateHz;
  spec.channels = kChannels;

  int pa_err = 0;
  pa_simple* stream = pa_simple_new(
      /*server=*/nullptr,
      /*name=*/"cats-stt-linux",
      PA_STREAM_RECORD,
      /*dev=*/nullptr,
      /*stream_name=*/"cats voice input",
      &spec,
      /*map=*/nullptr,
      /*attr=*/nullptr,
      &pa_err);
  if (stream == nullptr) {
    emitter.error("mic_unavailable");
    emitter.end();
    return 0;
  }

  std::atomic<bool> stop_flag{false};
  std::atomic<bool> cancel_flag{false};

  std::thread reader([&]() {
    std::string line;
    while (std::getline(std::cin, line)) {
      auto cmd = parse_control_command(line, options.session_id);
      if (!cmd) continue;
      if (*cmd == "cancel") {
        cancel_flag.store(true);
        break;
      }
      if (*cmd == "stop") {
        stop_flag.store(true);
        break;
      }
    }
  });

  emitter.ready(options.locale.empty() ? "auto" : options.locale);

  std::vector<int16_t> buffer;
  buffer.reserve(kMaxRecordingSamples);
  std::vector<int16_t> chunk(kReadFrames);
  bool auto_stopped = false;

  while (!stop_flag.load() && !cancel_flag.load()) {
    int read_err = 0;
    if (pa_simple_read(stream, chunk.data(), chunk.size() * sizeof(int16_t), &read_err) < 0) {
      // Stream closed (likely from the reader thread or PA disconnect).
      break;
    }
    buffer.insert(buffer.end(), chunk.begin(), chunk.end());
    if (buffer.size() >= kMaxRecordingSamples) {
      // SPEC-087 Req 16: bound recording at 30 s. Fall through as if the
      // user had pressed stop — the renderer sees the same `final` → `end`
      // sequence as an explicit stop.
      auto_stopped = true;
      stop_flag.store(true);
      break;
    }
  }

  // Release the microphone immediately. whisper inference still has the
  // 60-second Linux per-platform cleanup window to finish.
  pa_simple_free(stream);

  if (cancel_flag.load()) {
    if (reader.joinable()) reader.join();
    emitter.error("cancelled");
    emitter.end();
    return 0;
  }

  if (reader.joinable()) reader.join();

  // Truncate the trailing chunk to the cap exactly so we never feed whisper
  // more than the documented bound.
  if (buffer.size() > kMaxRecordingSamples) {
    buffer.resize(kMaxRecordingSamples);
  }

  if (buffer.empty()) {
    emitter.final_text("");
    emitter.end();
    return 0;
  }

  const auto samples = samples_to_float32(buffer);
  const std::string text = transcribe(ctx, samples, options.locale);
  emitter.final_text(text);
  emitter.end();
  (void)auto_stopped;
  return 0;
}

int run_file_recognition(const CliOptions& options, JsonEmitter& emitter,
                         whisper_context* ctx) {
  auto pcm = read_wav_fixture(options.input_path);
  if (!pcm) {
    emitter.error("engine_unavailable");
    emitter.end();
    return 0;
  }
  emitter.ready(options.locale.empty() ? "auto" : options.locale);
  const auto samples = samples_to_float32(*pcm);
  const std::string text = transcribe(ctx, samples, options.locale);
  emitter.final_text(text);
  emitter.end();
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  auto options = parse_cli(argc, argv);
  if (!options) {
    std::fprintf(stderr,
                 "Usage: cats-stt-linux --session-id <id> [--locale <bcp47>] "
                 "[--input <wav>]\n");
    return 2;
  }

  JsonEmitter emitter(options->session_id);

  // Linux has no per-app TCC equivalent; mic preflight is the libpulse
  // construct-and-connect attempt itself, performed at the start of the
  // microphone path. For fixture mode (no PA), we skip directly to model
  // load.

  const auto model_path = resolve_model_path();
  if (model_path.empty()) {
    emitter.error("engine_unavailable");
    emitter.end();
    return 0;
  }

  whisper_context_params cparams = whisper_context_default_params();
  whisper_context* ctx = whisper_init_from_file_with_params(
      model_path.string().c_str(), cparams);
  if (ctx == nullptr) {
    emitter.error("engine_unavailable");
    emitter.end();
    return 0;
  }

  int rc;
  if (!options->input_path.empty()) {
    rc = run_file_recognition(*options, emitter, ctx);
  } else {
    rc = run_microphone_recognition(*options, emitter, ctx);
  }

  whisper_free(ctx);
  return rc;
}
