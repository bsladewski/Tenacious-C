/**
 * CLI Types
 *
 * Type definitions for CLI argument parsing
 */

/** Valid CLI tool names */
export type CliToolName = 'codex' | 'copilot' | 'cursor' | 'claude' | 'mock';

/** Parsed CLI arguments */
export interface ParsedArgs {
  /** Input prompt or file path */
  input: string;

  /** Maximum number of plan revisions */
  maxPlanIterations: number;

  /** Minimum confidence threshold (0-100) */
  planConfidence: number;

  /** Maximum number of follow-up execution iterations */
  maxFollowUpIterations: number;

  /** Maximum number of plan-based execution iterations */
  execIterations: number;

  /** Override all iteration limits - continue until truly done */
  thePromptOfDestiny: boolean;

  /** Default CLI tool to use for all phases */
  cliTool: CliToolName | null;

  /** CLI tool to use for plan generation/revisions */
  planCliTool: CliToolName | null;

  /** CLI tool to use for execution/follow-ups */
  executeCliTool: CliToolName | null;

  /** CLI tool to use for gap audits */
  auditCliTool: CliToolName | null;

  /** Model to use for plan generation and revisions */
  planModel: string | null;

  /** Model to use for plan execution and follow-ups */
  executeModel: string | null;

  /** Model to use for gap audits */
  auditModel: string | null;

  /** Fallback CLI tools to try if primary tool fails */
  fallbackCliTools: CliToolName[];

  /** Preview the initial plan before execution */
  previewPlan: boolean;

  /** Resume the most recent interrupted run */
  resume: boolean;

  /** Use mock CLI tool for testing */
  mockMode: boolean;

  /** Mock tool configuration (JSON string or file path) */
  mockConfigPath: string | null;

  /** Show help and exit */
  help: boolean;

  /** Show version and exit */
  version: boolean;

  /** Use experimental Orchestrator-based execution */
  experimentalOrchestrator: boolean;

  /** Disable interactive prompts; use defaults or fail */
  noInteractive: boolean;

  /** Enable verbose output with more progress details */
  verbose: boolean;

  /** Enable debug mode with full diagnostics */
  debug: boolean;

  /** Output machine-readable JSON summary */
  jsonOutput: boolean;

  /** Enable nemesis mode for more adversarial gap audits */
  nemesis: boolean;
}

/** Default values for parsed arguments */
export const DEFAULT_ARGS: ParsedArgs = {
  input: '',
  maxPlanIterations: 10,
  planConfidence: 85,
  maxFollowUpIterations: 10,
  execIterations: 5,
  thePromptOfDestiny: false,
  cliTool: null,
  planCliTool: null,
  executeCliTool: null,
  auditCliTool: null,
  planModel: null,
  executeModel: null,
  auditModel: null,
  fallbackCliTools: [],
  previewPlan: false,
  resume: false,
  mockMode: false,
  mockConfigPath: null,
  help: false,
  version: false,
  experimentalOrchestrator: false,
  noInteractive: false,
  verbose: false,
  debug: false,
  jsonOutput: false,
  nemesis: false,
};

/** Result of parsing arguments */
export interface ParseResult {
  success: boolean;
  args?: ParsedArgs;
  error?: string;
}
