/**
 * ProcessRunner interface (F4)
 * Abstracts subprocess execution for testability and engine adapters
 */

import { EngineResult } from './engine-result';

/**
 * Options for spawning a subprocess
 */
export interface SpawnOptions {
  /** Arguments to pass to the command */
  args: string[];
  /** Working directory for the subprocess */
  cwd: string;
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;
  /** Timeout in milliseconds (0 = no timeout) */
  timeoutMs?: number;
  /** Directory to write stdout/stderr transcripts */
  transcriptDir?: string;
  /** Prefix for transcript file names */
  transcriptPrefix?: string;
  /** Whether to capture stdout/stderr to transcript files */
  captureTranscripts?: boolean;
  /** Number of lines to keep in tail buffers */
  tailLines?: number;
  /** Callback for stdout data (for streaming/display) */
  onStdout?: (data: string) => void;
  /** Callback for stderr data (for streaming/display) */
  onStderr?: (data: string) => void;
}

/**
 * Result from spawning a subprocess (lower-level than EngineResult)
 */
export interface SpawnResult {
  /** Exit code from the subprocess */
  exitCode: number;
  /** Duration of execution in milliseconds */
  durationMs: number;
  /** Last N lines of stdout */
  stdoutTail: string[];
  /** Last N lines of stderr */
  stderrTail: string[];
  /** Path to stdout transcript file (if captured) */
  stdoutTranscriptPath?: string;
  /** Path to stderr transcript file (if captured) */
  stderrTranscriptPath?: string;
  /** Whether the process was killed due to timeout */
  timedOut: boolean;
  /** Whether the process was interrupted by signal */
  interrupted: boolean;
  /** Signal that terminated the process, if any */
  signal?: string;
}

/**
 * Interface for running subprocesses
 * Implementations can be real (child_process) or mock (for testing)
 */
export interface ProcessRunner {
  /**
   * Spawn a subprocess and wait for it to complete
   * @param command - The command to execute
   * @param options - Spawn options
   * @returns Promise resolving to spawn result
   */
  spawn(command: string, options: SpawnOptions): Promise<SpawnResult>;

  /**
   * Kill a running process by signal
   * For implementations that track running processes
   */
  killAll?(signal?: NodeJS.Signals): void;
}

/**
 * Convert a SpawnResult to an EngineResult with invocation metadata
 */
export function spawnResultToEngineResult(
  spawnResult: SpawnResult,
  command: string,
  options: SpawnOptions,
  startedAt: Date,
  endedAt: Date,
  modelUsed?: string
): EngineResult {
  return {
    exitCode: spawnResult.exitCode,
    durationMs: spawnResult.durationMs,
    stdoutTranscriptPath: spawnResult.stdoutTranscriptPath,
    stderrTranscriptPath: spawnResult.stderrTranscriptPath,
    stdoutTail: spawnResult.stdoutTail,
    stderrTail: spawnResult.stderrTail,
    timedOut: spawnResult.timedOut,
    interrupted: spawnResult.interrupted,
    signal: spawnResult.signal,
    modelUsed,
    invocation: {
      command,
      args: options.args,
      cwd: options.cwd,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    },
  };
}
