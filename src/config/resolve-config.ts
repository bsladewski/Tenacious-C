/**
 * Configuration Resolution (F11, F12)
 * Single-pass config resolution with explicit precedence
 * CLI flags > per-run config > repo config > user config > defaults
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  EffectiveConfig,
  DEFAULT_CONFIG,
  CliToolName,
  ConfigSource,
} from '../types/effective-config';

/**
 * CLI flags that can override configuration
 */
export interface CliFlags {
  input?: string;
  maxPlanIterations?: number;
  planConfidence?: number;
  maxFollowUpIterations?: number;
  execIterations?: number;
  cliTool?: CliToolName;
  planCliTool?: CliToolName;
  executeCliTool?: CliToolName;
  auditCliTool?: CliToolName;
  planModel?: string;
  executeModel?: string;
  auditModel?: string;
  fallbackCliTools?: CliToolName[];
  previewPlan?: boolean;
  resume?: boolean;
  thePromptOfDestiny?: boolean;
  mockMode?: boolean;
  verbose?: boolean;
  debug?: boolean;
  jsonOutput?: boolean;
  noInteractive?: boolean;
  workingDirectory?: string;
}

/**
 * Per-run config (stored in .tenacious-c/<run>/config.json)
 */
export interface PerRunConfig {
  cliTool?: CliToolName;
  planCliTool?: CliToolName;
  executeCliTool?: CliToolName;
  auditCliTool?: CliToolName;
  planModel?: string;
  executeModel?: string;
  auditModel?: string;
  fallbackCliTools?: CliToolName[];
}

/**
 * Repository config (.tenacious-c/config.json)
 */
export interface RepoConfig {
  defaultCliTool?: CliToolName;
  planCliTool?: CliToolName;
  executeCliTool?: CliToolName;
  auditCliTool?: CliToolName;
  planModel?: string;
  executeModel?: string;
  auditModel?: string;
  fallbackCliTools?: CliToolName[];
  maxPlanIterations?: number;
  maxFollowUpIterations?: number;
  maxExecIterations?: number;
  planConfidence?: number;
}

/**
 * User config (~/.config/tenacious-c/config.json)
 */
export interface UserConfig {
  defaultCliTool?: CliToolName;
  planCliTool?: CliToolName;
  executeCliTool?: CliToolName;
  auditCliTool?: CliToolName;
  planModel?: string;
  executeModel?: string;
  auditModel?: string;
  fallbackCliTools?: CliToolName[];
  maxPlanIterations?: number;
  maxFollowUpIterations?: number;
  maxExecIterations?: number;
  planConfidence?: number;
}

/**
 * Load JSON config file if it exists
 */
function loadConfigFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    // Silently ignore parse errors
    return null;
  }
}

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
}

/**
 * Resolve configuration from all sources with explicit precedence
 * CLI flags > per-run config > repo config > user config > defaults
 */
export function resolveConfig(
  cliFlags: CliFlags,
  perRunConfig?: PerRunConfig | null,
  workingDirectory?: string
): EffectiveConfig {
  const cwd = workingDirectory ?? cliFlags.workingDirectory ?? process.cwd();
  const runId = generateRunId();
  const now = new Date().toISOString();

  // Load repo config
  const repoConfigPath = join(cwd, '.tenacious-c', 'config.json');
  const repoConfig = loadConfigFile<RepoConfig>(repoConfigPath);

  // Load user config
  const userConfigPath = join(homedir(), '.config', 'tenacious-c', 'config.json');
  const userConfig = loadConfigFile<UserConfig>(userConfigPath);

  // Track sources for debugging
  const sources: Partial<Record<string, ConfigSource>> = {};

  // Helper to resolve a value with precedence
  function resolveValue<T>(
    key: string,
    cli: T | undefined,
    perRun: T | undefined,
    repo: T | undefined,
    user: T | undefined,
    defaultVal: T
  ): T {
    if (cli !== undefined) {
      sources[key] = 'cli';
      return cli;
    }
    if (perRun !== undefined) {
      sources[key] = 'per-run';
      return perRun;
    }
    if (repo !== undefined) {
      sources[key] = 'repo';
      return repo;
    }
    if (user !== undefined) {
      sources[key] = 'user';
      return user;
    }
    sources[key] = 'default';
    return defaultVal;
  }

  // Resolve the base CLI tool (used as fallback for phase-specific tools)
  const baseTool = resolveValue<CliToolName>(
    'baseTool',
    cliFlags.cliTool,
    perRunConfig?.cliTool,
    repoConfig?.defaultCliTool,
    userConfig?.defaultCliTool,
    DEFAULT_CONFIG.tools.plan
  );

  // Check if unlimited mode is active
  const unlimitedIterations = cliFlags.thePromptOfDestiny ?? false;

  // Build effective config
  const config: EffectiveConfig = {
    schemaVersion: '1.0.0',
    input: cliFlags.input ?? '',
    runId,
    resolvedAt: now,

    limits: {
      maxPlanIterations: unlimitedIterations
        ? Number.MAX_SAFE_INTEGER
        : resolveValue(
            'maxPlanIterations',
            cliFlags.maxPlanIterations,
            undefined,
            repoConfig?.maxPlanIterations,
            userConfig?.maxPlanIterations,
            DEFAULT_CONFIG.limits.maxPlanIterations
          ),
      maxExecIterations: unlimitedIterations
        ? Number.MAX_SAFE_INTEGER
        : resolveValue(
            'maxExecIterations',
            cliFlags.execIterations,
            undefined,
            repoConfig?.maxExecIterations,
            userConfig?.maxExecIterations,
            DEFAULT_CONFIG.limits.maxExecIterations
          ),
      maxFollowUpIterations: unlimitedIterations
        ? Number.MAX_SAFE_INTEGER
        : resolveValue(
            'maxFollowUpIterations',
            cliFlags.maxFollowUpIterations,
            undefined,
            repoConfig?.maxFollowUpIterations,
            userConfig?.maxFollowUpIterations,
            DEFAULT_CONFIG.limits.maxFollowUpIterations
          ),
      maxGapAuditIterations: DEFAULT_CONFIG.limits.maxGapAuditIterations,
    },

    thresholds: {
      planConfidence: resolveValue(
        'planConfidence',
        cliFlags.planConfidence,
        undefined,
        repoConfig?.planConfidence,
        userConfig?.planConfidence,
        DEFAULT_CONFIG.thresholds.planConfidence
      ),
    },

    tools: {
      plan: resolveValue<CliToolName>(
        'planTool',
        cliFlags.planCliTool,
        perRunConfig?.planCliTool,
        repoConfig?.planCliTool,
        userConfig?.planCliTool,
        baseTool
      ),
      execute: resolveValue<CliToolName>(
        'executeTool',
        cliFlags.executeCliTool,
        perRunConfig?.executeCliTool,
        repoConfig?.executeCliTool,
        userConfig?.executeCliTool,
        baseTool
      ),
      audit: resolveValue<CliToolName>(
        'auditTool',
        cliFlags.auditCliTool,
        perRunConfig?.auditCliTool,
        repoConfig?.auditCliTool,
        userConfig?.auditCliTool,
        baseTool
      ),
    },

    models: {
      plan: resolveValue(
        'planModel',
        cliFlags.planModel,
        perRunConfig?.planModel,
        repoConfig?.planModel,
        userConfig?.planModel,
        undefined
      ),
      execute: resolveValue(
        'executeModel',
        cliFlags.executeModel,
        perRunConfig?.executeModel,
        repoConfig?.executeModel,
        userConfig?.executeModel,
        undefined
      ),
      audit: resolveValue(
        'auditModel',
        cliFlags.auditModel,
        perRunConfig?.auditModel,
        repoConfig?.auditModel,
        userConfig?.auditModel,
        undefined
      ),
    },

    verbosity: {
      verbose: cliFlags.verbose ?? DEFAULT_CONFIG.verbosity.verbose,
      debug: cliFlags.debug ?? DEFAULT_CONFIG.verbosity.debug,
      jsonOutput: cliFlags.jsonOutput ?? DEFAULT_CONFIG.verbosity.jsonOutput,
    },

    interactivity: {
      interactive: !(cliFlags.noInteractive ?? false),
      previewPlan: cliFlags.previewPlan ?? DEFAULT_CONFIG.interactivity.previewPlan,
    },

    runMode: {
      resume: cliFlags.resume ?? DEFAULT_CONFIG.runMode.resume,
      unlimitedIterations,
      mockMode: cliFlags.mockMode ?? DEFAULT_CONFIG.runMode.mockMode,
    },

    fallback: {
      fallbackTools: resolveValue<CliToolName[]>(
        'fallbackTools',
        cliFlags.fallbackCliTools,
        perRunConfig?.fallbackCliTools,
        repoConfig?.fallbackCliTools,
        userConfig?.fallbackCliTools,
        DEFAULT_CONFIG.fallback.fallbackTools
      ),
      maxRetries: DEFAULT_CONFIG.fallback.maxRetries,
      retryDelayMs: DEFAULT_CONFIG.fallback.retryDelayMs,
    },

    paths: {
      workingDirectory: cwd,
      artifactBaseDir: join(cwd, '.tenacious-c'),
      runDirectory: undefined, // Set later when run starts
    },

    sources: sources as Partial<Record<keyof EffectiveConfig, ConfigSource>>,
  };

  return config;
}

/**
 * Update config with run directory once it's known
 */
export function setRunDirectory(config: EffectiveConfig, runDirectory: string): EffectiveConfig {
  return {
    ...config,
    paths: {
      ...config.paths,
      runDirectory,
    },
  };
}

/**
 * Validate a CLI tool name
 */
export function isValidCliTool(tool: string): tool is CliToolName {
  return ['codex', 'copilot', 'cursor', 'claude', 'mock'].includes(tool);
}

/**
 * Parse CLI tool list from comma-separated string
 */
export function parseCliToolList(input: string): CliToolName[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter(isValidCliTool);
}
