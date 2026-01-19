/**
 * Buffer Logger implementation (F30)
 * For testing - stores events in memory without output
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
 * Buffer-based logger for testing
 * Stores all events in memory without console output
 */
export class BufferLogger implements Logger {
  private minLevel: LogLevel;
  private context: Partial<LogMetadata> = {};
  private events: LogEvent[] = [];
  private readonly options: LoggerOptions;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'debug'; // Capture all by default for testing
    this.options = {
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
    const childLogger = new BufferLogger(this.options);
    childLogger.setContext({ ...this.context, ...additionalContext });
    childLogger.setMinLevel(this.minLevel);
    return childLogger;
  }

  /**
   * Clear all stored events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get events filtered by level
   */
  getEventsByLevel(level: LogLevel): LogEvent[] {
    return this.events.filter((e) => e.level === level);
  }

  /**
   * Get events filtered by event type
   */
  getEventsByType(eventType: LogEventType): LogEvent[] {
    return this.events.filter((e) => e.eventType === eventType);
  }

  /**
   * Check if any events with the given level exist
   */
  hasLevel(level: LogLevel): boolean {
    return this.events.some((e) => e.level === level);
  }

  /**
   * Check if any events with the given type exist
   */
  hasEventType(eventType: LogEventType): boolean {
    return this.events.some((e) => e.eventType === eventType);
  }

  /**
   * Get the last event
   */
  getLastEvent(): LogEvent | undefined {
    return this.events[this.events.length - 1];
  }

  /**
   * Get events matching a message pattern
   */
  getEventsMatching(pattern: RegExp): LogEvent[] {
    return this.events.filter((e) => pattern.test(e.message));
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

    // Store event (no output for buffer logger)
    this.events.push(event);
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

  private getEventLevel(eventType: LogEventType): LogLevel {
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
 * Create a buffer logger for testing
 */
export function createBufferLogger(options?: LoggerOptions): BufferLogger {
  return new BufferLogger(options);
}
