import type { SchedulerService } from './service.js';

export interface SchedulerLoopOptions {
  service: SchedulerService;
  intervalMs?: number;
  onTickResult?: (result: Awaited<ReturnType<SchedulerService['tick']>>) => Promise<void>;
}

export type StopSchedulerLoop = () => void;

export function startSchedulerLoop(options: SchedulerLoopOptions): StopSchedulerLoop {
  const intervalMs = options.intervalMs ?? 60_000;
  let stopped = false;
  let ticking = false;

  async function runTick(startup: boolean): Promise<void> {
    if (stopped || ticking) {
      return;
    }
    ticking = true;
    try {
      const result = await options.service.tick({ startup });
      await options.onTickResult?.(result);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`[cats-platform-scheduler] tick_failed ${message}\n`);
    } finally {
      ticking = false;
    }
  }

  void runTick(true);
  const timer = setInterval(() => {
    void runTick(false);
  }, intervalMs);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
