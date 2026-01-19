/**
 * Mock Process Runner for Integration Tests
 *
 * Provides a mock implementation of ProcessRunner for testing
 * without spawning real processes.
 */

import {
  ProcessRunner,
  ProcessResult,
  ProcessRunOptions,
} from '../../src/types/process-runner';

/**
 * Configurable response for the mock process runner
 */
export interface MockProcessResponse {
  /** Exit code to return */
  exitCode: number;
  /** Stdout content */
  stdout?: string;
  /** Stderr content */
  stderr?: string;
  /** Whether to simulate timeout */
  timedOut?: boolean;
  /** Signal if killed */
  signal?: string;
}

/**
 * Mock implementation of ProcessRunner for testing
 */
export class TestProcessRunner implements ProcessRunner {
  /** History of all process runs for assertions */
  public readonly runHistory: Array<{
    command: string;
    args: string[];
    options?: ProcessRunOptions;
    response: MockProcessResponse;
  }> = [];

  private defaultResponse: MockProcessResponse = {
    exitCode: 0,
    stdout: 'Mock process output',
  };

  private responseMap = new Map<string, MockProcessResponse>();

  /**
   * Set the default response for all process runs
   */
  setDefaultResponse(response: MockProcessResponse): void {
    this.defaultResponse = response;
  }

  /**
   * Set a specific response for a command pattern
   */
  setResponse(commandPattern: string, response: MockProcessResponse): void {
    this.responseMap.set(commandPattern, response);
  }

  /**
   * Clear all custom responses
   */
  clearResponses(): void {
    this.responseMap.clear();
  }

  /**
   * Clear run history
   */
  clearHistory(): void {
    this.runHistory.length = 0;
  }

  async run(
    command: string,
    args: string[],
    options?: ProcessRunOptions
  ): Promise<ProcessResult> {
    const response = this.findResponse(command, args);

    // Record the run
    this.runHistory.push({ command, args, options, response });

    const now = new Date();

    return {
      exitCode: response.exitCode,
      stdout: response.stdout ?? '',
      stderr: response.stderr ?? '',
      stdoutTail: response.stdout?.split('\n').slice(-100) ?? [],
      stderrTail: response.stderr?.split('\n').slice(-100) ?? [],
      timedOut: response.timedOut ?? false,
      signal: response.signal,
      startedAt: new Date(now.getTime() - 100).toISOString(),
      endedAt: now.toISOString(),
    };
  }

  private findResponse(
    command: string,
    args: string[]
  ): MockProcessResponse {
    const fullCommand = `${command} ${args.join(' ')}`;

    for (const [pattern, response] of this.responseMap.entries()) {
      if (fullCommand.includes(pattern) || command.includes(pattern)) {
        return response;
      }
    }

    return this.defaultResponse;
  }
}

/**
 * Create a mock process runner instance
 */
export function createTestProcessRunner(): TestProcessRunner {
  return new TestProcessRunner();
}
