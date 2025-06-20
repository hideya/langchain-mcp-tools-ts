// Simple logger

type LogLevelString = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5
}

const LOG_COLORS = {
  [LogLevel.TRACE]: "\x1b[90m",   // Gray
  [LogLevel.DEBUG]: "\x1b[90m",   // Gray
  [LogLevel.INFO]: "\x1b[90m",    // Gray
  [LogLevel.WARN]: "\x1b[1;93m",  // Bold bright yellow
  [LogLevel.ERROR]: "\x1b[1;91m", // Bold bright red
  [LogLevel.FATAL]: "\x1b[1;101m",// Red background, Bold text
} as const;

const LOG_LEVEL_MAP: Record<LogLevelString, LogLevel> = {
  trace: LogLevel.TRACE,
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  fatal: LogLevel.FATAL
} as const;

class Logger {
  private readonly level: LogLevel;
  private static readonly RESET = "\x1b[0m";

  constructor({ level = LogLevel.INFO }: { level?: LogLevelString | LogLevel } = {}) {
    this.level = this.parseLogLevel(level);
  }

  private parseLogLevel(level: LogLevel | LogLevelString): LogLevel {
    if (typeof level === "number") return level;
    return LOG_LEVEL_MAP[level.toLowerCase() as LogLevelString];
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (level < this.level) return;

    const color = LOG_COLORS[level];
    const levelStr = `[${LogLevel[level].toLowerCase()}]`;

    console.log(`${color}${levelStr}${Logger.RESET}`, ...args.map(this.formatValue));
  }

  private formatValue(value: unknown): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  }

  public trace(...args: unknown[]) { this.log(LogLevel.TRACE, ...args); }
  public debug(...args: unknown[]) { this.log(LogLevel.DEBUG, ...args); }
  public info(...args: unknown[]) { this.log(LogLevel.INFO, ...args); }
  public warn(...args: unknown[]) { this.log(LogLevel.WARN, ...args); }
  public error(...args: unknown[]) { this.log(LogLevel.ERROR, ...args); }
  public fatal(...args: unknown[]) { this.log(LogLevel.FATAL, ...args); }
}

export { Logger, LogLevel, LogLevelString };
