using System.Text.Json;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;

namespace Cats.Stt.Windows;

internal sealed record CliOptions(string SessionId, string? Locale, string? InputPath);

internal sealed record ControlCommand(string? Type, string? SessionId);

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static async Task<int> Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--list-languages")
        {
            return ListLanguages();
        }

        var options = ParseOptions(args);
        if (options is null)
        {
            Console.Error.WriteLine(
                "Usage: cats-stt-windows --session-id <id> [--locale <bcp47>] [--input <wav>] | --list-languages");
            return 2;
        }

        var emitter = new JsonEmitter(options.SessionId);
        if (!string.IsNullOrWhiteSpace(options.InputPath))
        {
            emitter.Error("engine_unavailable");
            emitter.End();
            return 0;
        }

        using var recognizer = CreateRecognizer(options.Locale);
        if (recognizer is null)
        {
            emitter.Error("language_not_supported");
            emitter.End();
            return 0;
        }

        try
        {
            recognizer.Constraints.Add(new SpeechRecognitionTopicConstraint(
                SpeechRecognitionScenario.Dictation,
                "dictation"));
            var compilation = await recognizer.CompileConstraintsAsync();
            if (compilation.Status != SpeechRecognitionResultStatus.Success)
            {
                emitter.Error("language_not_supported");
                emitter.End();
                return 0;
            }

            var stopped = new TaskCompletionSource(
                TaskCreationOptions.RunContinuationsAsynchronously);
            recognizer.HypothesisGenerated += (_, eventArgs) =>
            {
                if (!string.IsNullOrWhiteSpace(eventArgs.Hypothesis.Text))
                {
                    emitter.Partial(eventArgs.Hypothesis.Text);
                }
            };
            recognizer.ContinuousRecognitionSession.ResultGenerated += (_, eventArgs) =>
            {
                if (
                    eventArgs.Result.Status == SpeechRecognitionResultStatus.Success
                    && !string.IsNullOrWhiteSpace(eventArgs.Result.Text)
                )
                {
                    emitter.Final(eventArgs.Result.Text);
                }
            };
            recognizer.ContinuousRecognitionSession.Completed += (_, _) =>
            {
                stopped.TrySetResult();
            };

            await recognizer.ContinuousRecognitionSession.StartAsync();
            emitter.Ready(recognizer.CurrentLanguage.LanguageTag);

            var commandTask = Task.Run(async () =>
            {
                while (await Console.In.ReadLineAsync() is { } line)
                {
                    var command = ParseCommand(line, options.SessionId);
                    if (command == "cancel")
                    {
                        emitter.Error("cancelled");
                        await recognizer.ContinuousRecognitionSession.CancelAsync();
                        stopped.TrySetResult();
                        return;
                    }
                    if (command == "stop")
                    {
                        await recognizer.ContinuousRecognitionSession.StopAsync();
                        stopped.TrySetResult();
                        return;
                    }
                }

                await recognizer.ContinuousRecognitionSession.StopAsync();
                stopped.TrySetResult();
            });

            await Task.WhenAny(stopped.Task, commandTask);
            emitter.End();
            return 0;
        }
        catch (UnauthorizedAccessException)
        {
            emitter.Error("permission_denied");
            emitter.End();
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            emitter.Error("engine_unavailable");
            emitter.End();
            return 0;
        }
    }

    // SPEC-146 FR-3: the languages the dictation topic constraint supports, as
    // one stdout line. It opens no microphone and requests no permission.
    private static int ListLanguages()
    {
        string? system = null;
        var languages = new List<string>();
        try
        {
            system = SpeechRecognizer.SystemSpeechLanguage?.LanguageTag;
            foreach (var language in SpeechRecognizer.SupportedTopicLanguages)
            {
                languages.Add(language.LanguageTag);
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            languages.Clear();
        }

        var payload = new Dictionary<string, object?>
        {
            ["type"] = "languages",
            ["system"] = system,
            ["languages"] = languages.Distinct(StringComparer.Ordinal).OrderBy(tag => tag, StringComparer.Ordinal).ToList(),
        };
        Console.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
        Console.Out.Flush();
        return 0;
    }

    private static CliOptions? ParseOptions(string[] args)
    {
        string? sessionId = null;
        string? locale = null;
        string? inputPath = null;

        for (var index = 0; index < args.Length; index += 1)
        {
            switch (args[index])
            {
                case "--session-id":
                    sessionId = index + 1 < args.Length ? args[index + 1] : null;
                    index += 1;
                    break;
                case "--locale":
                    locale = index + 1 < args.Length ? args[index + 1] : null;
                    index += 1;
                    break;
                case "--input":
                    inputPath = index + 1 < args.Length ? args[index + 1] : null;
                    index += 1;
                    break;
                default:
                    return null;
            }
        }

        return string.IsNullOrWhiteSpace(sessionId)
            ? null
            : new CliOptions(
                sessionId.Trim(),
                string.IsNullOrWhiteSpace(locale) ? null : locale.Trim(),
                inputPath);
    }

    private static SpeechRecognizer? CreateRecognizer(string? locale)
    {
        if (string.IsNullOrWhiteSpace(locale))
        {
            return new SpeechRecognizer();
        }

        try
        {
            return new SpeechRecognizer(new Language(locale));
        }
        catch
        {
            return null;
        }
    }

    private static string? ParseCommand(string line, string sessionId)
    {
        try
        {
            var command = JsonSerializer.Deserialize<ControlCommand>(line, JsonOptions);
            if (command?.SessionId != sessionId || command.Type is not ("cancel" or "stop"))
            {
                return null;
            }
            return command.Type;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed class JsonEmitter
    {
        private readonly string sessionId;
        private readonly object syncRoot = new();

        internal JsonEmitter(string sessionId)
        {
            this.sessionId = sessionId;
        }

        internal void Ready(string locale)
        {
            Emit(new Dictionary<string, string>
            {
                ["type"] = "ready",
                ["sessionId"] = sessionId,
                ["locale"] = locale,
                ["mode"] = "unknown",
            });
        }

        internal void Partial(string text)
        {
            Emit(new Dictionary<string, string>
            {
                ["type"] = "partial",
                ["sessionId"] = sessionId,
                ["text"] = text,
            });
        }

        internal void Final(string text)
        {
            Emit(new Dictionary<string, string>
            {
                ["type"] = "final",
                ["sessionId"] = sessionId,
                ["text"] = text,
            });
        }

        internal void Error(string reason)
        {
            Emit(new Dictionary<string, string>
            {
                ["type"] = "error",
                ["sessionId"] = sessionId,
                ["reason"] = reason,
            });
        }

        internal void End()
        {
            Emit(new Dictionary<string, string>
            {
                ["type"] = "end",
                ["sessionId"] = sessionId,
            });
        }

        private void Emit(Dictionary<string, string> payload)
        {
            lock (syncRoot)
            {
                Console.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
                Console.Out.Flush();
            }
        }
    }
}
