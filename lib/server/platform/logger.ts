type Level = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minimumLevel(): Level {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured && configured in LEVEL_ORDER) return configured as Level;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Errors are serialised by hand: JSON.stringify on an Error yields `{}`,
 * which is how a stack trace silently disappears from a log line.
 */
function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...("code" in error ? { prismaCode: (error as { code?: string }).code } : {}),
    };
  }
  return { message: String(error) };
}

/**
 * One structured line per event, on stdout.
 *
 * Deliberately dependency-free and JSON-per-line so any log shipper can read
 * it. Server errors used to be swallowed by the route-level catch and returned
 * to the browser as a 422, which meant a production fault produced no server
 * record at all.
 */
function emit(level: Level, message: string, fields: LogFields = {}) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel()]) return;

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  });

  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, error?: unknown, fields?: LogFields) =>
    emit("error", message, { ...fields, error: describeError(error) }),
};
