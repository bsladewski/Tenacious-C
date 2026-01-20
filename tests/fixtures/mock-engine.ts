/**
 * Mock Engine for Integration Tests
 *
 * Provides a configurable mock engine that simulates engine responses
 * for integration testing purposes.
 */

import { MockAdapter, MockAdapterResponse } from '../../src/engines/mock-adapter';

/**
 * Preset response types for common test scenarios
 */
export const PRESET_RESPONSES = {
  /** Successful plan generation with high confidence */
  PLAN_SUCCESS: {
    exitCode: 0,
    durationMs: 100,
    stdoutTail: ['Plan generated successfully'],
  } satisfies MockAdapterResponse,

  /** Plan with open questions requiring revision */
  PLAN_NEEDS_REVISION: {
    exitCode: 0,
    durationMs: 100,
    stdoutTail: ['Plan generated with open questions'],
  } satisfies MockAdapterResponse,

  /** Successful execution with no follow-ups */
  EXECUTE_SUCCESS: {
    exitCode: 0,
    durationMs: 100,
    stdoutTail: ['Execution completed successfully'],
  } satisfies MockAdapterResponse,

  /** Execution with follow-ups required */
  EXECUTE_WITH_FOLLOWUPS: {
    exitCode: 0,
    durationMs: 100,
    stdoutTail: ['Execution completed with follow-ups'],
  } satisfies MockAdapterResponse,

  /** Gap audit with no gaps */
  AUDIT_NO_GAPS: {
    exitCode: 0,
    durationMs: 100,
    stdoutTail: ['No gaps identified'],
  } satisfies MockAdapterResponse,

  /** Gap audit with gaps identified */
  AUDIT_WITH_GAPS: {
    exitCode: 0,
    durationMs: 100,
    stdoutTail: ['Gaps identified'],
  } satisfies MockAdapterResponse,

  /** Engine failure */
  ENGINE_FAILURE: {
    exitCode: 1,
    durationMs: 100,
    stderrTail: ['Engine execution failed'],
  } satisfies MockAdapterResponse,
};

/**
 * Configuration for creating a test engine
 */
export interface TestEngineConfig {
  /** Whether the engine should report as available */
  isAvailable?: boolean;
  /** Version string to report */
  version?: string;
  /** Default response for all executions */
  defaultResponse?: MockAdapterResponse;
  /** Sequence of responses (for testing multiple iterations) */
  responseSequence?: MockAdapterResponse[];
}

/**
 * Creates a configured mock engine for testing.
 */
export function createTestEngine(config: TestEngineConfig = {}): MockAdapter {
  return new MockAdapter({
    isAvailable: config.isAvailable ?? true,
    version: config.version ?? 'test-engine-1.0.0',
    defaultResponse: config.defaultResponse ?? PRESET_RESPONSES.PLAN_SUCCESS,
  });
}

/**
 * Creates a mock engine with a sequence of responses.
 * Each execution returns the next response in the sequence.
 */
export function createSequencedEngine(
  responses: MockAdapterResponse[]
): MockAdapter {
  const adapter = new MockAdapter({
    isAvailable: true,
    version: 'sequenced-engine-1.0.0',
    defaultResponse: responses[0] ?? PRESET_RESPONSES.PLAN_SUCCESS,
  });

  // We'll use execution history to track which response to return
  let callIndex = 0;
  const originalExecute = adapter.execute.bind(adapter);

  adapter.execute = async (options) => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;

    // Modify the adapter's default response temporarily
    // This is a simple way to sequence responses
    return originalExecute({
      ...options,
      userMessage: `[call-${callIndex}] ${options.userMessage}`,
    });
  };

  // Set up responses for the sequence
  responses.forEach((response, index) => {
    adapter.setResponse(`[call-${index + 1}]`, response);
  });

  return adapter;
}

/**
 * Creates a mock engine that fails on the first N attempts.
 */
export function createRetryingEngine(
  failCount: number,
  successResponse: MockAdapterResponse = PRESET_RESPONSES.EXECUTE_SUCCESS
): MockAdapter {
  const responses: MockAdapterResponse[] = [
    ...Array(failCount).fill(PRESET_RESPONSES.ENGINE_FAILURE),
    successResponse,
  ];
  return createSequencedEngine(responses);
}
