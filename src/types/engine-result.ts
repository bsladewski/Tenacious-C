/**
 * Standardized EngineResult type (F21)
 * Following ENGINEERING_GUIDE.md Section 8.2 specification
 */

/**
 * Metadata about how the engine was invoked
 */
export interface InvocationMetadata {
  /** Command that was executed (e.g., 'cursor', 'claude') */
  command: string;
  /** Arguments passed to the command */
  args: string[];
  /** Sanitized environment variables (secrets redacted) */
  env?: Record<string, string>;
  /** Working directory for the command */
  cwd: string;
  /** Timestamp when invocation started (ISO 8601) */
  startedAt: string;
  /** Timestamp when invocation ended (ISO 8601) */
  endedAt: string;
}

/**
 * Normalized result from an engine execution
 * All engine adapters must return this standardized shape
 */
export interface EngineResult {
  /** Exit code from the subprocess (0 = success) */
  exitCode: number;
  /** Duration of execution in milliseconds */
  durationMs: number;
  /** Path to file containing full stdout transcript (optional) */
  stdoutTranscriptPath?: string;
  /** Path to file containing full stderr transcript (optional) */
  stderrTranscriptPath?: string;
  /** Last N lines of stdout for quick inspection */
  stdoutTail?: string[];
  /** Last N lines of stderr for quick inspection */
  stderrTail?: string[];
  /** Combined stdout/stderr transcript path (alternative to separate files) */
  combinedTranscriptPath?: string;
  /** Metadata about the invocation */
  invocation: InvocationMetadata;
  /** Model used for execution, if discoverable */
  modelUsed?: string;
  /** Whether the engine was terminated due to timeout */
  timedOut?: boolean;
  /** Whether the engine was interrupted by signal */
  interrupted?: boolean;
  /** Signal that caused interruption, if any */
  signal?: string;
}

/**
 * Options for engine execution
 */
export interface EngineExecutionOptions {
  /** Mode of operation (plan, execute, audit, gap) */
  mode: 'plan' | 'execute' | 'audit' | 'gap';
  /** Path to system prompt file */
  systemPromptPath?: string;
  /** User message/prompt to send */
  userMessage: string;
  /** Working directory for the engine */
  cwd: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Model to use (optional, engine-specific) */
  model?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Directory to write transcripts to */
  transcriptDir?: string;
}

/**
 * Check if an engine result represents success
 */
export function isEngineSuccess(result: EngineResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.interrupted;
}

/**
 * Check if an engine result indicates a timeout
 */
export function isEngineTimeout(result: EngineResult): boolean {
  return result.timedOut === true;
}

/**
 * Check if an engine result indicates an interruption
 */
export function isEngineInterrupted(result: EngineResult): boolean {
  return result.interrupted === true;
}

/**
 * Get a brief summary of the engine result for logging
 */
export function getEngineResultSummary(result: EngineResult): string {
  if (result.timedOut) {
    return `Timed out after ${result.durationMs}ms`;
  }
  if (result.interrupted) {
    return `Interrupted by ${result.signal ?? 'unknown signal'}`;
  }
  if (result.exitCode === 0) {
    return `Success in ${result.durationMs}ms`;
  }
  return `Failed with exit code ${result.exitCode} in ${result.durationMs}ms`;
}
