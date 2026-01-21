/**
 * Orchestrator Factory (F14 Phase 2.9)
 * Creates Orchestrator instances with real or mock dependencies
 * Bridges the gap between new Orchestrator API and existing infrastructure
 */

import { resolve } from 'path';
import {
  Orchestrator,
  OrchestratorDependencies,
  createOrchestrator,
} from '../core/orchestrator';
import {
  EffectiveConfig,
  CliToolName,
  DEFAULT_CONFIG,
  SystemClock,
  ProcessRunner,
} from '../types';
import { createConsoleLogger } from '../logging/console-logger';
import { createBufferLogger, BufferLogger } from '../logging/buffer-logger';
import { createRealFileSystem } from '../io/real-file-system';
import { createMemoryFileSystem, MemoryFileSystem } from '../io/memory-file-system';
import { createInquirerPrompter, createNonInteractivePrompter } from '../ui/inquirer-prompter';
import { createRealProcessRunner } from '../engines/real-process-runner';
import { createMockProcessRunner, MockProcessConfig } from '../engines/mock-process-runner';
import { CliToolType } from '../config';

/**
 * Options for creating an Orchestrator with real dependencies
 */
export interface OrchestratorFactoryOptions {
  /** Working directory for file operations */
  workingDirectory?: string;
  /** Base directory for artifacts (default: .tenacious-c) */
  artifactBaseDir?: string;
  /** Whether to run in non-interactive mode (no prompts) */
  nonInteractive?: boolean;
  /** Whether to use verbose logging */
  verbose?: boolean;
  /** Whether to use debug logging */
  debug?: boolean;
  /** Whether to output JSON logs */
  jsonOutput?: boolean;
}

/**
 * Options for creating an Orchestrator with mock dependencies (for testing)
 */
export interface MockOrchestratorFactoryOptions {
  /** Mock process configuration */
  processConfig?: MockProcessConfig;
  /** Initial file system contents */
  initialFiles?: Record<string, string>;
  /** Whether to run in non-interactive mode */
  nonInteractive?: boolean;
  /** Whether to use verbose logging */
  verbose?: boolean;
}

/**
 * Result from creating an Orchestrator with mock dependencies
 * Exposes mock implementations for assertions in tests
 */
export interface MockOrchestratorResult {
  orchestrator: Orchestrator;
  deps: OrchestratorDependencies;
  config: EffectiveConfig;
  /** For asserting logs */
  logger: BufferLogger;
  /** For asserting file operations */
  fileSystem: MemoryFileSystem;
  /** For examining process invocations */
  processRunner: ProcessRunner;
}

/**
 * Convert legacy CliToolType to new CliToolName
 */
export function cliToolTypeToName(tool: CliToolType | null): CliToolName {
  if (!tool) return 'cursor';
  const mapping: Record<string, CliToolName> = {
    codex: 'codex',
    copilot: 'copilot',
    cursor: 'cursor',
    claude: 'claude',
    mock: 'mock',
  };
  return mapping[tool] ?? 'cursor';
}

/**
 * Convert new CliToolName to legacy CliToolType
 */
export function cliToolNameToType(name: CliToolName): CliToolType {
  const mapping: Record<CliToolName, CliToolType> = {
    codex: 'codex',
    copilot: 'copilot',
    cursor: 'cursor',
    claude: 'claude',
    mock: 'mock',
  };
  return mapping[name];
}

/**
 * Build EffectiveConfig from legacy options (from plan.ts parameters)
 */
export interface LegacyConfigOptions {
  input: string;
  maxRevisions?: number;
  planConfidenceThreshold?: number;
  maxFollowUpIterations?: number;
  execIterations?: number;
  isDestinyMode?: boolean;
  specifiedCliTool?: CliToolType | null;
  previewPlanFlag?: boolean;
  resumeFlag?: boolean;
  planModel?: string | null;
  executeModel?: string | null;
  auditModel?: string | null;
  planCliTool?: CliToolType | null;
  executeCliTool?: CliToolType | null;
  auditCliTool?: CliToolType | null;
  fallbackCliTools?: CliToolType[];
  workingDirectory?: string;
  artifactBaseDir?: string;
  runId?: string;
  planOnly?: boolean;
}

/**
 * Convert legacy options to EffectiveConfig
 */
export function legacyOptionsToEffectiveConfig(options: LegacyConfigOptions): EffectiveConfig {
  const now = new Date().toISOString();
  const defaultTool = cliToolTypeToName(options.specifiedCliTool ?? null);

  return {
    schemaVersion: '1.0.0',
    input: options.input,
    limits: {
      maxPlanIterations: options.isDestinyMode ? Number.MAX_SAFE_INTEGER : (options.maxRevisions ?? DEFAULT_CONFIG.limits.maxPlanIterations),
      maxExecIterations: options.isDestinyMode ? Number.MAX_SAFE_INTEGER : (options.execIterations ?? DEFAULT_CONFIG.limits.maxExecIterations),
      maxFollowUpIterations: options.isDestinyMode ? Number.MAX_SAFE_INTEGER : (options.maxFollowUpIterations ?? DEFAULT_CONFIG.limits.maxFollowUpIterations),
      maxGapAuditIterations: options.isDestinyMode ? Number.MAX_SAFE_INTEGER : DEFAULT_CONFIG.limits.maxGapAuditIterations,
    },
    thresholds: {
      planConfidence: options.planConfidenceThreshold ?? DEFAULT_CONFIG.thresholds.planConfidence,
    },
    tools: {
      plan: cliToolTypeToName(options.planCliTool ?? null) || defaultTool,
      execute: cliToolTypeToName(options.executeCliTool ?? null) || defaultTool,
      audit: cliToolTypeToName(options.auditCliTool ?? null) || defaultTool,
    },
    models: {
      plan: options.planModel ?? undefined,
      execute: options.executeModel ?? undefined,
      audit: options.auditModel ?? undefined,
    },
    verbosity: { ...DEFAULT_CONFIG.verbosity },
    interactivity: {
      interactive: !options.resumeFlag,
      previewPlan: options.previewPlanFlag ?? false,
    },
    runMode: {
      resume: options.resumeFlag ?? false,
      unlimitedIterations: options.isDestinyMode ?? false,
      mockMode: false,
      planOnly: options.planOnly ?? false,
    },
    fallback: {
      fallbackTools: (options.fallbackCliTools ?? []).map(cliToolTypeToName),
      maxRetries: DEFAULT_CONFIG.fallback.maxRetries,
      retryDelayMs: DEFAULT_CONFIG.fallback.retryDelayMs,
    },
    paths: {
      workingDirectory: options.workingDirectory ?? process.cwd(),
      artifactBaseDir: options.artifactBaseDir ?? resolve(options.workingDirectory ?? process.cwd(), '.tenacious-c'),
    },
    runId: options.runId ?? now.replace(/[:.]/g, '-').replace('T', '_').split('Z')[0],
    resolvedAt: now,
  };
}

/**
 * Create OrchestratorDependencies with real implementations
 */
export function createRealDependencies(options: OrchestratorFactoryOptions = {}): OrchestratorDependencies {
  const {
    verbose = false,
    debug = false,
    jsonOutput = false,
    nonInteractive = false,
  } = options;

  // Create logger with appropriate settings
  const logger = createConsoleLogger({
    minLevel: debug ? 'debug' : verbose ? 'info' : 'warn',
    jsonOutput,
  });

  // Create file system
  const fileSystem = createRealFileSystem();

  // Create prompter
  const prompter = nonInteractive
    ? createNonInteractivePrompter()
    : createInquirerPrompter();

  // Create clock
  const clock = new SystemClock();

  // Create process runner
  const processRunner = createRealProcessRunner();

  return {
    logger,
    fileSystem,
    prompter,
    clock,
    processRunner,
  };
}

/**
 * Create OrchestratorDependencies with mock implementations (for testing)
 */
export function createMockDependencies(options: MockOrchestratorFactoryOptions = {}): OrchestratorDependencies & {
  logger: BufferLogger;
  fileSystem: MemoryFileSystem;
} {
  const {
    processConfig,
    initialFiles = {},
    verbose = false,
  } = options;

  // Create buffer logger for capturing logs in tests
  const logger = createBufferLogger({
    minLevel: verbose ? 'debug' : 'info',
  });

  // Create memory file system with optional initial files
  const fileSystem = createMemoryFileSystem();

  // Populate initial files
  for (const [path, content] of Object.entries(initialFiles)) {
    // Use synchronous approach for initial setup
    fileSystem.writeFile(path, content, { createParents: true });
  }

  // Create non-interactive prompter for testing
  const prompter = createNonInteractivePrompter();

  // Create mock clock
  const clock = new SystemClock(); // TODO: Use MockClock when available

  // Create mock process runner
  const processRunner = createMockProcessRunner(processConfig);

  return {
    logger,
    fileSystem,
    prompter,
    clock,
    processRunner,
  };
}

/**
 * Create an Orchestrator with real dependencies for production use
 */
export function createProductionOrchestrator(
  config: EffectiveConfig,
  options: OrchestratorFactoryOptions = {}
): { orchestrator: Orchestrator; deps: OrchestratorDependencies } {
  const deps = createRealDependencies(options);
  const orchestrator = createOrchestrator(config, deps);
  return { orchestrator, deps };
}

/**
 * Create an Orchestrator from legacy options (for migration)
 * This bridges the gap between the old plan.ts parameters and the new Orchestrator API
 */
export function createOrchestratorFromLegacyOptions(
  legacyOptions: LegacyConfigOptions,
  factoryOptions: OrchestratorFactoryOptions = {}
): { orchestrator: Orchestrator; config: EffectiveConfig; deps: OrchestratorDependencies } {
  const config = legacyOptionsToEffectiveConfig(legacyOptions);
  const deps = createRealDependencies(factoryOptions);
  const orchestrator = createOrchestrator(config, deps);
  return { orchestrator, config, deps };
}

/**
 * Create an Orchestrator with mock dependencies for testing
 */
export function createMockOrchestrator(
  config: EffectiveConfig,
  options: MockOrchestratorFactoryOptions = {}
): MockOrchestratorResult {
  const deps = createMockDependencies(options);
  const orchestrator = createOrchestrator(config, deps);
  return {
    orchestrator,
    deps,
    config,
    logger: deps.logger,
    fileSystem: deps.fileSystem,
    processRunner: deps.processRunner,
  };
}

/**
 * Create a minimal EffectiveConfig for testing
 */
export function createTestConfig(overrides: Partial<EffectiveConfig> = {}): EffectiveConfig {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0.0',
    input: 'test requirements',
    limits: overrides.limits ?? { ...DEFAULT_CONFIG.limits },
    thresholds: overrides.thresholds ?? { ...DEFAULT_CONFIG.thresholds },
    tools: overrides.tools ?? { ...DEFAULT_CONFIG.tools },
    models: overrides.models ?? {},
    verbosity: overrides.verbosity ?? { ...DEFAULT_CONFIG.verbosity },
    interactivity: overrides.interactivity ?? { ...DEFAULT_CONFIG.interactivity },
    runMode: overrides.runMode ?? { ...DEFAULT_CONFIG.runMode },
    fallback: overrides.fallback ?? { ...DEFAULT_CONFIG.fallback },
    paths: overrides.paths ?? {
      workingDirectory: '/test',
      artifactBaseDir: '/test/.tenacious-c',
    },
    runId: overrides.runId ?? 'test-run-001',
    resolvedAt: now,
    ...overrides,
  };
}
