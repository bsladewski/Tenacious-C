/**
 * Types module - shared interfaces and types
 * This module provides all injectable interfaces for testability
 */

// Result type for typed error handling
export {
  Result,
  Ok,
  Err,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  all,
} from './result';

// Exit codes
export {
  ExitCode,
  getExitCodeDescription,
  isSuccessExitCode,
  isRecoverableExitCode,
} from './exit-codes';

// Engine result types
export {
  EngineResult,
  EngineExecutionOptions,
  InvocationMetadata,
  isEngineSuccess,
  isEngineTimeout,
  isEngineInterrupted,
  getEngineResultSummary,
} from './engine-result';

// Process runner interface
export {
  ProcessRunner,
  SpawnOptions,
  SpawnResult,
  spawnResultToEngineResult,
} from './process-runner';

// File system interface
export {
  FileSystem,
  FileStats,
  WriteOptions,
  ReadOptions,
  ListOptions,
  FileSystemError,
  FileSystemErrorCode,
  createFileSystemError,
} from './file-system';

// Prompter interface
export {
  Prompter,
  SelectChoice,
  ConfirmOptions,
  InputOptions,
  SelectOptions,
  MultiSelectOptions,
  EditorOptions,
  PrompterError,
  PrompterErrorCode,
  createPrompterError,
} from './prompter';

// Clock interface
export {
  Clock,
  SystemClock,
  MockClock,
  getDefaultClock,
  setDefaultClock,
  resetDefaultClock,
} from './clock';

// Logger interface
export {
  Logger,
  LogLevel,
  LogEventType,
  OperationMode,
  LogMetadata,
  LogEvent,
  LoggerOptions,
  compareLogLevels,
  shouldLog,
  DEFAULT_REDACT_PATTERNS,
  redactSecrets,
} from './logger';

// Effective config types
export {
  EffectiveConfig,
  CliToolName,
  IterationLimits,
  ConfidenceThresholds,
  PhaseTools,
  PhaseModels,
  VerbosityConfig,
  InteractivityConfig,
  RunModeConfig,
  FallbackConfig,
  TimeoutConfig,
  PathConfig,
  ConfigSource,
  DEFAULT_CONFIG,
  isUnlimitedIterations,
  getEngineTimeout,
  redactConfigForLogging,
} from './effective-config';

// Execution context
export { ExecutionContext } from './execution-context';

// AI CLI tool interface
export { AICliTool } from './ai-cli-tool';
