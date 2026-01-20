/**
 * Engine Adapter Interface (Phase 3.2)
 * Standardized interface for all engine adapters (Cursor, Claude, Codex, Copilot)
 */

import { EngineResult, EngineExecutionOptions } from '../types/engine-result';
import { ProcessRunner } from '../types/process-runner';

/**
 * Options for creating an engine adapter
 */
export interface EngineAdapterOptions {
  /** Process runner for subprocess execution */
  processRunner: ProcessRunner;
  /** Path to the CLI executable (e.g., 'cursor-agent', 'claude') */
  executablePath?: string;
  /** Default working directory */
  workingDirectory?: string;
  /** Default number of retries */
  defaultRetries?: number;
  /** Retry delay in milliseconds */
  retryDelayMs?: number;
}

/**
 * Standardized interface for engine adapters
 * All engine adapters must implement this interface
 */
export interface EngineAdapter {
  /** The name of this engine (e.g., 'cursor', 'claude', 'codex', 'copilot') */
  readonly name: string;

  /**
   * Execute a prompt using this engine
   * @param options - Execution options
   * @returns Promise resolving to the normalized EngineResult
   */
  execute(options: EngineExecutionOptions): Promise<EngineResult>;

  /**
   * Check if this engine is available on the system
   * @returns Promise resolving to true if the engine is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the version of this engine (if discoverable)
   * @returns Promise resolving to version string or undefined
   */
  getVersion(): Promise<string | undefined>;
}

/**
 * Base class for engine adapters with common functionality
 */
export abstract class BaseEngineAdapter implements EngineAdapter {
  abstract readonly name: string;
  protected readonly processRunner: ProcessRunner;
  protected readonly executablePath: string;
  protected readonly workingDirectory: string;
  protected readonly defaultRetries: number;
  protected readonly retryDelayMs: number;

  constructor(options: EngineAdapterOptions) {
    this.processRunner = options.processRunner;
    this.executablePath = options.executablePath ?? this.getDefaultExecutablePath();
    this.workingDirectory = options.workingDirectory ?? process.cwd();
    this.defaultRetries = options.defaultRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 10000; // 10 seconds
  }

  /**
   * Get the default executable path for this engine
   * Subclasses must implement this
   */
  protected abstract getDefaultExecutablePath(): string;

  /**
   * Build command-line arguments for the engine
   * Subclasses must implement this
   * @param options - Execution options
   * @returns Array of command-line arguments
   */
  protected abstract buildArgs(options: EngineExecutionOptions): string[];

  /**
   * Get the transcript prefix for this engine
   */
  protected getTranscriptPrefix(options: EngineExecutionOptions): string {
    return `${this.name}-${options.mode}`;
  }

  async execute(options: EngineExecutionOptions): Promise<EngineResult> {
    let lastResult: EngineResult | undefined;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.defaultRetries; attempt++) {
      try {
        const result = await this.executeOnce(options, attempt);

        // Check if the result indicates a retryable failure
        if (result.exitCode === 0 || attempt === this.defaultRetries) {
          return result;
        }

        // Store for potential final return
        lastResult = result;

        // Wait before retrying
        if (attempt < this.defaultRetries) {
          await this.delay(this.retryDelayMs);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.defaultRetries) {
          throw lastError;
        }

        // Wait before retrying
        await this.delay(this.retryDelayMs);
      }
    }

    // Return last result if we have one, otherwise throw
    if (lastResult) {
      return lastResult;
    }
    throw lastError ?? new Error(`${this.name} execution failed after retries`);
  }

  protected async executeOnce(options: EngineExecutionOptions, _attempt: number): Promise<EngineResult> {
    const startedAt = new Date();
    const args = this.buildArgs(options);

    const spawnResult = await this.processRunner.spawn(this.executablePath, {
      args,
      cwd: options.cwd ?? this.workingDirectory,
      env: options.env,
      transcriptDir: options.transcriptDir,
      transcriptPrefix: this.getTranscriptPrefix(options),
      captureTranscripts: !!options.transcriptDir,
      tailLines: 50,
    });

    const endedAt = new Date();

    return {
      exitCode: spawnResult.exitCode,
      durationMs: spawnResult.durationMs,
      stdoutTranscriptPath: spawnResult.stdoutTranscriptPath,
      stderrTranscriptPath: spawnResult.stderrTranscriptPath,
      stdoutTail: spawnResult.stdoutTail,
      stderrTail: spawnResult.stderrTail,
      interrupted: spawnResult.interrupted,
      signal: spawnResult.signal,
      modelUsed: options.model,
      invocation: {
        command: this.executablePath,
        args,
        cwd: options.cwd ?? this.workingDirectory,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.processRunner.spawn(this.executablePath, {
        args: ['--version'],
        cwd: this.workingDirectory,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string | undefined> {
    try {
      const result = await this.processRunner.spawn(this.executablePath, {
        args: ['--version'],
        cwd: this.workingDirectory,
      });
      if (result.exitCode === 0 && result.stdoutTail.length > 0) {
        return result.stdoutTail[0].trim();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
