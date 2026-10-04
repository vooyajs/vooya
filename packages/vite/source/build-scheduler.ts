export interface BuildSchedulerOptions {
  build: () => unknown | Promise<unknown>;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  delay?: number;
}

export function createBuildScheduler({
  build,
  onSuccess = () => {},
  onError = () => {},
  delay = 75,
}: BuildSchedulerOptions) {
  let dirty = false;
  let disposed = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let currentBuild = Promise.resolve();

  const run = async (): Promise<void> => {
    if (running || disposed) return currentBuild;
    running = true;
    try {
      do {
        dirty = false;
        try {
          await build();
          onSuccess();
        } catch (error) {
          onError(error);
        }
      } while (dirty && !disposed);
    } finally {
      running = false;
    }
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (running || disposed || !dirty) return currentBuild;
    currentBuild = run();
    return currentBuild;
  };

  return {
    schedule() {
      if (disposed) return;
      dirty = true;
      if (running) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        currentBuild = run();
      }, delay);
    },
    flush,
    dispose() {
      disposed = true;
      dirty = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
