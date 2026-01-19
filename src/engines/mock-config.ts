/**
 * Configuration for mock mode execution
 *
 * This module provides configuration types and state management for mock mode,
 * which allows testing the full execution workflow without calling real AI tools.
 */

/**
 * Configuration for the mock adapter
 */
export interface MockConfig {
  /**
   * Number of times to output open questions before stopping
   * Default: 2
   */
  openQuestionIterations: number;

  /**
   * Number of low-confidence plan revisions before reaching threshold
   * Default: 2
   */
  planRevisionIterations: number;

  /**
   * Number of execution iterations (how many gap audit cycles)
   * Default: 2
   */
  executionIterations: number;

  /**
   * Number of follow-up iterations per execution before completing
   * Default: 2
   */
  followUpIterations: number;

  /**
   * Whether to output hard blockers on the first plan execution
   * Default: false
   */
  hardBlockers?: boolean;

  /**
   * Confidence threshold to eventually reach
   * Should match the CLI's --plan-confidence value
   * Default: 85
   */
  targetConfidence?: number;

  /**
   * Starting confidence (should be below threshold)
   * Default: 60
   */
  startingConfidence?: number;
}

export const DEFAULT_MOCK_CONFIG: MockConfig = {
  openQuestionIterations: 2,
  planRevisionIterations: 2,
  executionIterations: 2,
  followUpIterations: 2,
  hardBlockers: false,
  targetConfidence: 85,
  startingConfidence: 60,
};

/**
 * Global mock config (set via --mock-config CLI argument)
 * This is a simple approach to pass config to MockAdapter instances
 */
let globalMockConfig: Partial<MockConfig> | null = null;

/**
 * Set the global mock config (called from CLI argument parsing)
 */
export function setMockConfig(config: Partial<MockConfig> | null): void {
  globalMockConfig = config;
}

/**
 * Get the current global mock config
 */
export function getMockConfig(): Partial<MockConfig> | null {
  return globalMockConfig;
}

/**
 * Get the effective mock config (merging global config with defaults)
 */
export function getEffectiveMockConfig(overrides: Partial<MockConfig> = {}): MockConfig {
  return { ...DEFAULT_MOCK_CONFIG, ...globalMockConfig, ...overrides };
}
