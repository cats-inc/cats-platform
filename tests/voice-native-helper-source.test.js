import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('macOS STT helper enforces on-device recognition and typed bridge events', async () => {
  const source = await readFile(
    join(
      process.cwd(),
      'desktop',
      'native',
      'macos-stt',
      'Sources',
      'CatsSttMacos',
      'main.swift',
    ),
    'utf8',
  );

  assert.match(source, /import Speech/u);
  assert.match(source, /supportsOnDeviceRecognition/u);
  assert.match(source, /requiresOnDeviceRecognition = true/u);
  assert.match(source, /"mode": "on-device"/u);
  assert.match(source, /"language_not_supported"/u);
  assert.match(source, /"permission_denied"/u);
  assert.match(source, /"permission_not_determined"/u);
  assert.match(source, /SFSpeechURLRecognitionRequest/u);
  assert.match(source, /SFSpeechAudioBufferRecognitionRequest/u);
  assert.match(source, /options\.inputPath == nil/u);
  assert.match(source, /CATS_STT_ENABLE_FIXTURE_INPUT/u);
  assert.match(source, /JSONDecoder\(\)\.decode\(ControlCommand\.self/u);
  assert.match(source, /parseControlCommand\(line, sessionId: options\.sessionId\)/u);
  assert.match(source, /stopAudioInput\(\)[\s\S]*return/u);
  assert.match(source, /finishSession\(cancelTask: false\)/u);
  assert.match(source, /if cancelTask \{\s*task\?\.cancel\(\)/u);
  // Bounded fallback so an empty audio buffer cannot leave the helper waiting
  // for an `isFinal` callback that SFSpeechRecognizer may never deliver.
  assert.match(source, /asyncAfter\(deadline: \.now\(\) \+ 0\.8\)/u);
  assert.doesNotMatch(source, /line\.contains/u);
});

test('Linux STT helper uses libpulse-simple, whisper.cpp, and the typed JSON protocol', async () => {
  const source = await readFile(
    join(process.cwd(), 'desktop', 'native', 'linux-stt', 'src', 'main.cpp'),
    'utf8',
  );
  const cmake = await readFile(
    join(process.cwd(), 'desktop', 'native', 'linux-stt', 'CMakeLists.txt'),
    'utf8',
  );
  const fetchScript = await readFile(
    join(process.cwd(), 'desktop', 'native', 'linux-stt', 'scripts', 'fetch-model.sh'),
    'utf8',
  );
  const notice = await readFile(
    join(process.cwd(), 'desktop', 'native', 'linux-stt', 'NOTICE'),
    'utf8',
  );

  // Audio + inference backends.
  assert.match(source, /pulse\/simple\.h/u);
  assert.match(source, /whisper\.h/u);
  assert.match(source, /pa_simple_new/u);
  assert.match(source, /pa_simple_read/u);
  assert.match(source, /pa_simple_free/u);
  assert.match(source, /whisper_init_from_file_with_params/u);
  assert.match(source, /whisper_full\(/u);

  // Capture protocol matches the bridge contract. The error reason values
  // appear as plain string literals at the helper's call sites; the
  // surrounding `"reason":"..."` JSON shell is built at runtime from raw
  // string templates so it never appears as a contiguous substring.
  assert.match(source, /"mode":"on-device"/u);
  assert.match(source, /emitter\.error\("mic_unavailable"\)/u);
  assert.match(source, /emitter\.error\("engine_unavailable"\)/u);
  assert.match(source, /emitter\.error\("cancelled"\)/u);

  // Audio capture details: 16 kHz mono S16LE, ~20 ms read chunks, 30 s cap.
  assert.match(source, /kSampleRateHz = 16000/u);
  assert.match(source, /kChannels = 1/u);
  assert.match(source, /kReadFrames = 320/u);
  assert.match(source, /kMaxRecordingSeconds = 30/u);
  assert.match(source, /PA_SAMPLE_S16LE/u);

  // Stop / cancel come in via stdin, parsed against the active sessionId.
  assert.match(source, /parse_control_command\(line, options\.session_id\)/u);
  assert.match(source, /CATS_STT_ENABLE_FIXTURE_INPUT/u);

  // CMake refuses to silently fetch whisper.cpp from the network and
  // disables curl / network features in whisper itself.
  assert.match(cmake, /whisper\.cpp submodule is missing/u);
  assert.match(cmake, /WHISPER_CURL OFF/u);
  assert.match(cmake, /pkg_check_modules\(LIBPULSE_SIMPLE/u);

  // Model fetch is SHA-256 verified.
  assert.match(fetchScript, /EXPECTED_SHA256=/u);
  assert.match(fetchScript, /ggml-base\.bin/u);

  // NOTICE covers both whisper.cpp (MIT) and the OpenAI ggml model (MIT).
  assert.match(notice, /whisper\.cpp/u);
  assert.match(notice, /OpenAI/u);
  assert.match(notice, /MIT/u);
});

test('Windows STT helper uses WinRT speech and reports unknown locality', async () => {
  const source = await readFile(
    join(process.cwd(), 'desktop', 'native', 'windows-stt', 'Program.cs'),
    'utf8',
  );
  const project = await readFile(
    join(process.cwd(), 'desktop', 'native', 'windows-stt', 'CatsSttWindows.csproj'),
    'utf8',
  );

  assert.match(project, /net8\.0-windows10\.0\.19041\.0/u);
  assert.match(source, /Windows\.Media\.SpeechRecognition/u);
  assert.match(source, /ContinuousRecognitionSession/u);
  assert.match(source, /HypothesisGenerated/u);
  assert.match(source, /ResultGenerated/u);
  assert.match(source, /"mode"\] = "unknown"/u);
  assert.match(source, /UnauthorizedAccessException/u);
  assert.match(source, /"permission_denied"/u);
  assert.match(source, /"language_not_supported"/u);
  assert.match(source, /"engine_unavailable"/u);
  assert.match(source, /JsonSerializer\.Deserialize<ControlCommand>/u);
  assert.match(source, /command\?\.SessionId != sessionId/u);
  assert.doesNotMatch(source, /line\.Contains/u);
});
