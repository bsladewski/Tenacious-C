/**
 * Mock ProcessRunner implementation (F30)
 * For testing - returns predefined results without spawning real processes
 */

import { ProcessRunner, SpawnOptions, SpawnResult } from '../types/process-runner';

/**
 * Configuration for mock process behavior
 */
export interface MockProcessConfig {
  /** Exit code to return (default: 0) */
  exitCode?: number;
  /** Duration to simulate in milliseconds (default: 100) */
  durationMs?: number;
  /** Stdout lines to return */
  stdoutLines?: string[];
  /** Stderr lines to return */
  stderrLines?: string[];
  /** Whether to simulate timeout */
  timedOut?: boolean;
  /** Whether to simulate interruption */
  interrupted?: boolean;
  /** Signal that caused interruption */
  signal?: string;
  /** Delay before returning (simulates actual process time) */
  simulatedDelayMs?: number;
  /** Error to throw (simulates spawn failure) */
  throwError?: Error;
}

/**
 * Mock implementation of ProcessRunner for testing
 */
export class MockProcessRunner implements ProcessRunner {
  private defaultConfig: MockProcessConfig;
  private commandConfigs: Map<string, MockProcessConfig> = new Map();
  private callHistory: Array<{ command: string; options: SpawnOptions }> = [];

  constructor(defaultConfig: MockProcessConfig = {}) {
    this.defaultConfig = {
      exitCode: 0,
      durationMs: 100,
      stdoutLines: [],
      stderrLines: [],
      timedOut: false,
      interrupted: false,
      simulatedDelayMs: 0,
      ...defaultConfig,
    };
  }

  /**
   * Configure behavior for a specific command
   */
  setCommandConfig(command: string, config: MockProcessConfig): void {
    this.commandConfigs.set(command, config);
  }

  /**
   * Configure behavior for commands matching a pattern
   */
  setPatternConfig(pattern: RegExp, config: MockProcessConfig): void {
    // Store pattern configs with a special key format
    this.commandConfigs.set(`__pattern__${pattern.source}`, config);
  }

  /**
   * Get the call history for verification in tests
   */
  getCallHistory(): Array<{ command: string; options: SpawnOptions }> {
    return [...this.callHistory];
  }

  /**
   * Clear the call history
   */
  clearCallHistory(): void {
    this.callHistory = [];
  }

  /**
   * Reset all configurations to defaults
   */
  reset(): void {
    this.commandConfigs.clear();
    this.callHistory = [];
  }

  async spawn(command: string, options: SpawnOptions): Promise<SpawnResult> {
    // Record the call
    this.callHistory.push({ command, options });

    // Find matching config
    let config = this.commandConfigs.get(command);

    // Check pattern configs if no exact match
    if (!config) {
      for (const [key, value] of this.commandConfigs) {
        if (key.startsWith('__pattern__')) {
          const pattern = new RegExp(key.slice('__pattern__'.length));
          if (pattern.test(command)) {
            config = value;
            break;
          }
        }
      }
    }

    // Use default config if no match found
    config = { ...this.defaultConfig, ...config };

    // Throw error if configured
    if (config.throwError) {
      throw config.throwError;
    }

    // Simulate delay if configured
    if (config.simulatedDelayMs && config.simulatedDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.simulatedDelayMs));
    }

    // Call callbacks if provided
    if (options.onStdout && config.stdoutLines) {
      for (const line of config.stdoutLines) {
        options.onStdout(line + '\n');
      }
    }

    if (options.onStderr && config.stderrLines) {
      for (const line of config.stderrLines) {
        options.onStderr(line + '\n');
      }
    }

    return {
      exitCode: config.exitCode ?? 0,
      durationMs: config.durationMs ?? 100,
      stdoutTail: config.stdoutLines ?? [],
      stderrTail: config.stderrLines ?? [],
      timedOut: config.timedOut ?? false,
      interrupted: config.interrupted ?? false,
      signal: config.signal,
    };
  }

  killAll(): void {
    // No-op for mock
  }
}

/**
 * Create a mock process runner with optional default config
 */
export function createMockProcessRunner(config?: MockProcessConfig): MockProcessRunner {
  return new MockProcessRunner(config);
}

/**
 * Create a mock process runner that simulates success
 */
export function createSuccessfulMockRunner(
  stdoutLines: string[] = [],
  stderrLines: string[] = []
): MockProcessRunner {
  return new MockProcessRunner({
    exitCode: 0,
    durationMs: 100,
    stdoutLines,
    stderrLines,
  });
}

/**
 * Create a mock process runner that simulates failure
 */
export function createFailingMockRunner(
  exitCode: number = 1,
  stderrLines: string[] = ['Error occurred']
): MockProcessRunner {
  return new MockProcessRunner({
    exitCode,
    durationMs: 100,
    stderrLines,
  });
}

/**
 * Create a mock process runner that simulates timeout
 */
export function createTimeoutMockRunner(): MockProcessRunner {
  return new MockProcessRunner({
    exitCode: 124,
    durationMs: 30000,
    timedOut: true,
  });
}
