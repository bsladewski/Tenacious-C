/**
 * EffectiveConfig type (F11)
 * Centralized configuration object passed through the system
 */

/**
 * Valid CLI tool names
 */
export type CliToolName = 'codex' | 'copilot' | 'cursor' | 'claude' | 'mock';

/**
 * Iteration limits configuration
 */
export interface IterationLimits {
  /** Maximum number of plan revisions */
  maxPlanIterations: number;
  /** Maximum number of execution iterations (plan-based) */
  maxExecIterations: number;
  /** Maximum number of follow-up execution iterations */
  maxFollowUpIterations: number;
  /** Maximum number of gap audit iterations */
  maxGapAuditIterations: number;
}

/**
 * Confidence thresholds for decision making
 */
export interface ConfidenceThresholds {
  /** Minimum confidence for plan acceptance (0-100) */
  planConfidence: number;
}

/**
 * Per-phase CLI tool configuration
 */
export interface PhaseTools {
  /** CLI tool for plan generation */
  plan: CliToolName;
  /** CLI tool for plan execution */
  execute: CliToolName;
  /** CLI tool for gap audits */
  audit: CliToolName;
}

/**
 * Per-phase model configuration
 */
export interface PhaseModels {
  /** Model for plan generation */
  plan?: string;
  /** Model for plan execution */
  execute?: string;
  /** Model for gap audits */
  audit?: string;
}

/**
 * Logging and verbosity configuration
 */
export interface VerbosityConfig {
  /** Whether verbose output is enabled */
  verbose: boolean;
  /** Whether debug output is enabled */
  debug: boolean;
  /** Whether JSON output mode is enabled */
  jsonOutput: boolean;
}

/**
 * Interactive mode configuration
 */
export interface InteractivityConfig {
  /** Whether interactive prompts are enabled */
  interactive: boolean;
  /** Whether to preview plan before execution */
  previewPlan: boolean;
}

/**
 * Run mode configuration
 */
export interface RunModeConfig {
  /** Whether resuming a previous run */
  resume: boolean;
  /** Whether "prompt of destiny" mode is active (unlimited iterations) */
  unlimitedIterations: boolean;
  /** Whether using mock engine for testing */
  mockMode: boolean;
  /** Whether to skip execution and stop after plan is complete */
  planOnly: boolean;
}

/**
 * Fallback and retry configuration
 */
export interface FallbackConfig {
  /** Ordered list of fallback CLI tools */
  fallbackTools: CliToolName[];
  /** Maximum number of retries per engine invocation */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
}

/**
 * Path configuration
 */
export interface PathConfig {
  /** Working directory for the run */
  workingDirectory: string;
  /** Base directory for tenacious-c artifacts */
  artifactBaseDir: string;
  /** Directory for the current run */
  runDirectory?: string;
}

/**
 * Source of a configuration value (for debugging/logging)
 */
export type ConfigSource = 'cli' | 'per-run' | 'repo' | 'user' | 'default';

/**
 * The complete effective configuration for a run
 * This is the single source of truth for all configuration values
 */
export interface EffectiveConfig {
  /** Version of the config schema */
  schemaVersion: '1.0.0';

  /** Original input prompt or file */
  input: string;

  /** Iteration limits */
  limits: IterationLimits;

  /** Confidence thresholds */
  thresholds: ConfidenceThresholds;

  /** Per-phase CLI tools */
  tools: PhaseTools;

  /** Per-phase models (optional) */
  models: PhaseModels;

  /** Verbosity settings */
  verbosity: VerbosityConfig;

  /** Interactive mode settings */
  interactivity: InteractivityConfig;

  /** Run mode settings */
  runMode: RunModeConfig;

  /** Fallback configuration */
  fallback: FallbackConfig;

  /** Path configuration */
  paths: PathConfig;

  /** Unique run ID */
  runId: string;

  /** Timestamp when config was resolved (ISO 8601) */
  resolvedAt: string;

  /** Source of each configuration value (for debugging) */
  sources?: Partial<Record<keyof EffectiveConfig, ConfigSource>>;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<EffectiveConfig, 'input' | 'runId' | 'resolvedAt' | 'paths'> = {
  schemaVersion: '1.0.0',
  limits: {
    maxPlanIterations: 10,
    maxExecIterations: 5,
    maxFollowUpIterations: 10,
    maxGapAuditIterations: 5,
  },
  thresholds: {
    planConfidence: 85,
  },
  tools: {
    plan: 'cursor',
    execute: 'cursor',
    audit: 'cursor',
  },
  models: {},
  verbosity: {
    verbose: false,
    debug: false,
    jsonOutput: false,
  },
  interactivity: {
    interactive: true,
    previewPlan: false,
  },
  runMode: {
    resume: false,
    unlimitedIterations: false,
    mockMode: false,
    planOnly: false,
  },
  fallback: {
    fallbackTools: [],
    maxRetries: 3,
    retryDelayMs: 1000,
  },
};

/**
 * Check if a config value indicates unlimited iterations
 */
export function isUnlimitedIterations(config: EffectiveConfig): boolean {
  return config.runMode.unlimitedIterations;
}

/**
 * Redact sensitive values from config for logging/artifacts
 * Currently, EffectiveConfig doesn't store secrets, but this is here for future-proofing
 */
export function redactConfigForLogging(config: EffectiveConfig): EffectiveConfig {
  // Currently no secrets in EffectiveConfig, return as-is
  // This function exists for future-proofing and to establish the pattern
  return { ...config };
}
