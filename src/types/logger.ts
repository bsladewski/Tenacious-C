/**
 * Logger interface (F31)
 * Structured logging with event types and metadata
 */

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured event types for the orchestration lifecycle
 */
export type LogEventType =
  // Run lifecycle
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  // Phase transitions
  | 'phase_started'
  | 'phase_completed'
  // Iteration lifecycle
  | 'iteration_started'
  | 'iteration_completed'
  // Engine events
  | 'engine_invocation_started'
  | 'engine_invocation_completed'
  | 'engine_invocation_failed'
  // Artifact events
  | 'artifact_written'
  | 'artifact_read'
  | 'artifact_validated'
  | 'artifact_validation_failed'
  // Stop conditions
  | 'stop_condition_met'
  | 'limit_exceeded'
  // User interaction
  | 'prompt_shown'
  | 'prompt_answered'
  // General
  | 'debug'
  | 'info'
  | 'warn'
  | 'error';

/**
 * Mode of operation
 */
export type OperationMode = 'plan' | 'execute' | 'audit' | 'gap' | 'summary';

/**
 * Base metadata included in all log events
 */
export interface LogMetadata {
  /** Unique identifier for this run */
  runId?: string;
  /** Current phase (plan-generation, execute-plan, etc.) */
  phase?: string;
  /** Current iteration number within the phase */
  iteration?: number;
  /** Current mode of operation */
  mode?: OperationMode;
  /** Additional context-specific metadata */
  [key: string]: unknown;
}

/**
 * A structured log event
 */
export interface LogEvent {
  /** Timestamp of the event (ISO 8601) */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Event type for structured queries */
  eventType: LogEventType;
  /** Human-readable message */
  message: string;
  /** Structured metadata */
  metadata: LogMetadata;
}

/**
 * Options for configuring the logger
 */
export interface LoggerOptions {
  /** Minimum log level to emit */
  minLevel?: LogLevel;
  /** Whether to include timestamps in console output */
  includeTimestamp?: boolean;
  /** Whether to use JSON format for output */
  jsonOutput?: boolean;
  /** Patterns to redact from log output (for secrets) */
  redactPatterns?: RegExp[];
}

/**
 * Interface for structured logging
 * Implementations can write to console, file, or buffer (for testing)
 */
export interface Logger {
  /**
   * Log a debug message
   */
  debug(message: string, metadata?: LogMetadata): void;

  /**
   * Log an info message
   */
  info(message: string, metadata?: LogMetadata): void;

  /**
   * Log a warning message
   */
  warn(message: string, metadata?: LogMetadata): void;

  /**
   * Log an error message
   */
  error(message: string, metadata?: LogMetadata): void;

  /**
   * Log a structured event
   */
  event(eventType: LogEventType, message: string, metadata?: LogMetadata): void;

  /**
   * Set the run context (runId, etc.) for all subsequent logs
   */
  setContext(context: Partial<LogMetadata>): void;

  /**
   * Clear the run context
   */
  clearContext(): void;

  /**
   * Get all logged events (for testing/diagnostics)
   */
  getEvents(): LogEvent[];

  /**
   * Set the minimum log level
   */
  setMinLevel(level: LogLevel): void;

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Partial<LogMetadata>): Logger;
}

/**
 * Compare log levels (returns positive if a > b)
 */
export function compareLogLevels(a: LogLevel, b: LogLevel): number {
  const order: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  return order[a] - order[b];
}

/**
 * Check if a log level should be emitted given a minimum level
 */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return compareLogLevels(level, minLevel) >= 0;
}

/**
 * Common secret patterns to redact
 */
export const DEFAULT_REDACT_PATTERNS: RegExp[] = [
  // API keys (generic patterns)
  /(?:api[_-]?key|apikey)[=:\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
  // Bearer tokens
  /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi,
  // AWS keys
  /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
  // GitHub tokens
  /gh[pousr]_[a-zA-Z0-9]{36}/g,
  // OpenAI API keys
  /sk-[a-zA-Z0-9]{48}/g,
  // Anthropic API keys
  /sk-ant-[a-zA-Z0-9-_]{40,}/gi,
  // Generic secrets in env vars
  /(?:password|secret|token|credential)[=:\s]*['"]?([^\s'"]{8,})['"]?/gi,
];

/**
 * Redact secrets from a string using the given patterns
 */
export function redactSecrets(text: string, patterns: RegExp[] = DEFAULT_REDACT_PATTERNS): string {
  let result = text;
  for (const pattern of patterns) {
    // Reset lastIndex for stateful regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      // Keep the first few characters for debugging, redact the rest
      const visible = Math.min(4, Math.floor(match.length / 4));
      return match.slice(0, visible) + '[REDACTED]';
    });
  }
  return result;
}
