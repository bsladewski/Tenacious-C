/**
 * Console Logger implementation (F31)
 * Structured logging with event types and metadata
 */

import {
  Logger,
  LogLevel,
  LogEventType,
  LogMetadata,
  LogEvent,
  LoggerOptions,
  shouldLog,
  redactSecrets,
  DEFAULT_REDACT_PATTERNS,
} from '../types/logger';

/**
 * Console-based logger implementation
 */
export class ConsoleLogger implements Logger {
  private minLevel: LogLevel;
  private context: Partial<LogMetadata> = {};
  private events: LogEvent[] = [];
  private readonly options: LoggerOptions;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.options = {
      includeTimestamp: true,
      jsonOutput: false,
      redactPatterns: DEFAULT_REDACT_PATTERNS,
      ...options,
    };
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.log('debug', 'debug', message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log('info', 'info', message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log('warn', 'warn', message, metadata);
  }

  error(message: string, metadata?: LogMetadata): void {
    this.log('error', 'error', message, metadata);
  }

  event(eventType: LogEventType, message: string, metadata?: LogMetadata): void {
    const level = this.getEventLevel(eventType);
    this.log(level, eventType, message, metadata);
  }

  setContext(context: Partial<LogMetadata>): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  getEvents(): LogEvent[] {
    return [...this.events];
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  child(additionalContext: Partial<LogMetadata>): Logger {
    const childLogger = new ConsoleLogger(this.options);
    childLogger.setContext({ ...this.context, ...additionalContext });
    childLogger.setMinLevel(this.minLevel);
    return childLogger;
  }

  private log(
    level: LogLevel,
    eventType: LogEventType,
    message: string,
    metadata?: LogMetadata
  ): void {
    // Check if this level should be logged
    if (!shouldLog(level, this.minLevel)) {
      return;
    }

    // Create event
    const event: LogEvent = {
      timestamp: new Date().toISOString(),
      level,
      eventType,
      message: this.redact(message),
      metadata: this.mergeMetadata(metadata),
    };

    // Store event
    this.events.push(event);

    // Output to console
    this.output(event);
  }

  private mergeMetadata(metadata?: LogMetadata): LogMetadata {
    const merged = { ...this.context, ...metadata };
    // Redact any string values in metadata
    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === 'string') {
        merged[key] = this.redact(value);
      }
    }
    return merged;
  }

  private redact(text: string): string {
    return redactSecrets(text, this.options.redactPatterns);
  }

  private output(event: LogEvent): void {
    if (this.options.jsonOutput) {
      this.outputJson(event);
    } else {
      this.outputPretty(event);
    }
  }

  private outputJson(event: LogEvent): void {
    const line = JSON.stringify(event);
    if (event.level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  private outputPretty(event: LogEvent): void {
    const parts: string[] = [];

    // Timestamp
    if (this.options.includeTimestamp) {
      const time = new Date(event.timestamp).toLocaleTimeString();
      parts.push(`[${time}]`);
    }

    // Level with color indicator
    const levelIndicator = this.getLevelIndicator(event.level);
    parts.push(levelIndicator);

    // Event type (if not a basic level)
    if (!['debug', 'info', 'warn', 'error'].includes(event.eventType)) {
      parts.push(`(${event.eventType})`);
    }

    // Message
    parts.push(event.message);

    // Key metadata
    const { runId, phase, iteration, mode } = event.metadata;
    const metaParts: string[] = [];
    if (runId) metaParts.push(`run=${runId}`);
    if (phase) metaParts.push(`phase=${phase}`);
    if (iteration !== undefined) metaParts.push(`iter=${iteration}`);
    if (mode) metaParts.push(`mode=${mode}`);

    if (metaParts.length > 0) {
      parts.push(`{${metaParts.join(', ')}}`);
    }

    const line = parts.join(' ');

    if (event.level === 'error') {
      console.error(line);
    } else if (event.level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  private getLevelIndicator(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return '🔍';
      case 'info':
        return 'ℹ️';
      case 'warn':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return '•';
    }
  }

  private getEventLevel(eventType: LogEventType): LogLevel {
    // Map event types to appropriate log levels
    switch (eventType) {
      case 'error':
      case 'run_failed':
      case 'engine_invocation_failed':
      case 'artifact_validation_failed':
        return 'error';
      case 'warn':
      case 'limit_exceeded':
        return 'warn';
      case 'debug':
        return 'debug';
      default:
        return 'info';
    }
  }
}

/**
 * Create a console logger with optional options
 */
export function createConsoleLogger(options?: LoggerOptions): Logger {
  return new ConsoleLogger(options);
}
