/**
 * Client-side logging with levels and visual console output.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLevel: LogLevel = LogLevel.DEBUG;

const LEVEL_STYLES: Record<LogLevel, { label: string; color: string }> = {
  [LogLevel.DEBUG]: { label: 'DEBUG', color: '#888' },
  [LogLevel.INFO]:  { label: 'INFO',  color: '#4CAF50' },
  [LogLevel.WARN]:  { label: 'WARN',  color: '#FF9800' },
  [LogLevel.ERROR]: { label: 'ERROR', color: '#f44336' },
};

function logMessage(level: LogLevel, ...args: unknown[]): void {
  if (level < currentLevel) return;

  const { label, color } = LEVEL_STYLES[level];
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `%c[${timestamp}] [${label}]`;
  const style = `color: ${color}; font-weight: bold;`;

  switch (level) {
    case LogLevel.DEBUG: console.debug(prefix, style, ...args); break;
    case LogLevel.INFO:  console.info(prefix, style, ...args); break;
    case LogLevel.WARN:  console.warn(prefix, style, ...args); break;
    case LogLevel.ERROR: console.error(prefix, style, ...args); break;
  }
}

export const log = {
  debug: (...args: unknown[]) => logMessage(LogLevel.DEBUG, ...args),
  info:  (...args: unknown[]) => logMessage(LogLevel.INFO, ...args),
  warn:  (...args: unknown[]) => logMessage(LogLevel.WARN, ...args),
  error: (...args: unknown[]) => logMessage(LogLevel.ERROR, ...args),
  setLevel: (level: LogLevel) => { currentLevel = level; },
};
