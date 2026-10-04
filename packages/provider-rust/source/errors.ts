export class VooyaUserError extends Error {
  kind: string;
  debugStack?: string;
  debugCause?: unknown;

  constructor(message: string, { kind = "vooya", cause }: { kind?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "VooyaUserError";
    this.kind = kind;
    this.debugStack = this.stack;
    if (cause !== undefined) this.debugCause = cause;
    this.stack = `${this.name}: ${this.message}\n`;
  }
}

export class CargoBuildError extends VooyaUserError {
  cargoPath: string;
  rustcPath: string;
  exitCode: number;

  constructor(message: string, { cargoPath, rustcPath, exitCode }: { cargoPath: string; rustcPath: string; exitCode: number }) {
    super(message, { kind: "cargo-build" });
    this.cargoPath = cargoPath;
    this.rustcPath = rustcPath;
    this.exitCode = exitCode;
  }
}

export function isVooyaUserError(error: unknown): error is VooyaUserError {
  return error instanceof VooyaUserError;
}
