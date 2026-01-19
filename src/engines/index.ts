/**
 * Engines module - engine adapters for AI CLI tools
 * Provides standardized wrappers around external CLI tools
 */

// ProcessRunner implementations
export { RealProcessRunner, createRealProcessRunner } from './real-process-runner';
export {
  MockProcessRunner,
  MockProcessConfig,
  createMockProcessRunner,
  createSuccessfulMockRunner,
  createFailingMockRunner,
  createTimeoutMockRunner,
} from './mock-process-runner';

// Engine adapter interface and base class
export {
  EngineAdapter,
  EngineAdapterOptions,
  BaseEngineAdapter,
} from './engine-adapter';

// Concrete engine adapters
export { CursorAdapter, createCursorAdapter } from './cursor-adapter';
export { ClaudeAdapter, createClaudeAdapter } from './claude-adapter';
export { CodexAdapter, createCodexAdapter } from './codex-adapter';
export { CopilotAdapter, createCopilotAdapter } from './copilot-adapter';
export {
  MockAdapter,
  MockAdapterOptions,
  MockAdapterResponse,
  createMockAdapter,
  resetMockAdapterState,
} from './mock-adapter';

// Tool detection
export {
  isCodexAvailable,
  isCopilotAvailable,
  isCursorAvailable,
  isClaudeAvailable,
  detectAvailableTools,
} from './detect-cli-tools';

// CLI tool factory
// Legacy functions (deprecated - use select* functions instead)
export { getCliTool, getCliToolForAction, ActionType } from './get-cli-tool';
// New selection functions (return CliToolType directly)
export { selectCliTool, selectCliToolForAction, selectCliToolWithoutSaving } from './get-cli-tool';

// Execution with fallback support
export {
  ExecuteWithFallbackResult,
  PhaseToolConfig,
  MutableToolConfig,
  executeWithFallback,
  createMutableToolConfig,
  updatePhaseAfterFallback,
  getEngineAdapter,
  contextToEngineOptions,
  executeWithEngineAdapter,
  isEngineAdapterAvailable,
  getEngineAdapterVersion,
} from './execute-with-fallback';

// Mock configuration
export {
  MockConfig,
  DEFAULT_MOCK_CONFIG,
  setMockConfig,
  getMockConfig,
  getEffectiveMockConfig,
} from './mock-config';
