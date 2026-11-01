export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** Minimal structured logger writing one line per event to stdout/stderr. */
export function createLogger(service: string): Logger {
  const log = (level: LogLevel) => (message: string, fields?: Record<string, unknown>) => {
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${service}] ${message}${
      fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : ""
    }`;
    (level === "error" || level === "warn" ? console.error : console.log)(line);
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}
