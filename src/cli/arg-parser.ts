/**
 * CLI Argument Parser
 *
 * Parses command line arguments into structured ParsedArgs
 */

import { ParsedArgs, ParseResult, DEFAULT_ARGS, CliToolName } from './types';

/** Valid CLI tool names for validation */
const VALID_CLI_TOOLS: CliToolName[] = ['codex', 'copilot', 'cursor', 'claude', 'mock'];

/**
 * Validate that a value is a valid CLI tool name
 */
function isValidCliTool(value: string): value is CliToolName {
  return VALID_CLI_TOOLS.includes(value as CliToolName);
}

/**
 * Parse a positive integer from a string
 */
function parsePositiveInt(value: string, name: string): { value?: number; error?: string } {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) {
    return { error: `${name} must be a positive integer` };
  }
  return { value: parsed };
}

/**
 * Parse a percentage (0-100) from a string
 */
function parsePercentage(value: string, name: string): { value?: number; error?: string } {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0 || parsed > 100) {
    return { error: `${name} must be a number between 0 and 100` };
  }
  return { value: parsed };
}

/**
 * Parse a CLI tool name from a string
 */
function parseCliTool(value: string, name: string): { value?: CliToolName; error?: string } {
  if (!isValidCliTool(value)) {
    return { error: `${name} must be one of: ${VALID_CLI_TOOLS.join(', ')}` };
  }
  return { value };
}

/**
 * Parse a comma-separated list of CLI tools
 */
function parseCliToolList(value: string, name: string): { value?: CliToolName[]; error?: string } {
  const tools = value.split(',').map(t => t.trim());
  for (const tool of tools) {
    if (!isValidCliTool(tool)) {
      return { error: `Invalid fallback tool "${tool}" in ${name}. Must be one of: ${VALID_CLI_TOOLS.join(', ')}` };
    }
  }
  return { value: tools as CliToolName[] };
}

/**
 * Get the value for an argument, handling both --arg value and --arg=value formats
 */
function getArgValue(args: string[], index: number, argName: string): { value?: string; skip: number; error?: string } {
  const arg = args[index];

  // Check for --arg=value format
  if (arg.includes('=')) {
    const value = arg.split('=')[1];
    if (!value) {
      return { error: `${argName}= requires a value`, skip: 0 };
    }
    return { value, skip: 0 };
  }

  // Check for --arg value format
  const nextArg = args[index + 1];
  if (!nextArg || nextArg.startsWith('--')) {
    return { error: `${argName} requires a value`, skip: 0 };
  }
  return { value: nextArg, skip: 1 };
}

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[]): ParseResult {
  const args = argv.slice(2); // Remove node and script path
  const result: ParsedArgs = { ...DEFAULT_ARGS };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const argBase = arg.split('=')[0]; // Get the base argument name

    switch (argBase) {
      case '--help':
      case '-h': {
        result.help = true;
        break;
      }

      case '--version':
      case '-v': {
        result.version = true;
        break;
      }

      case '--max-plan-iterations': {
        const { value, skip, error } = getArgValue(args, i, '--max-plan-iterations');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parsePositiveInt(value!, '--max-plan-iterations');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.maxPlanIterations = parsed.value!;
        i += skip;
        break;
      }

      case '--plan-confidence': {
        const { value, skip, error } = getArgValue(args, i, '--plan-confidence');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parsePercentage(value!, '--plan-confidence');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.planConfidence = parsed.value!;
        i += skip;
        break;
      }

      case '--max-follow-up-iterations': {
        const { value, skip, error } = getArgValue(args, i, '--max-follow-up-iterations');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parsePositiveInt(value!, '--max-follow-up-iterations');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.maxFollowUpIterations = parsed.value!;
        i += skip;
        break;
      }

      case '--exec-iterations': {
        const { value, skip, error } = getArgValue(args, i, '--exec-iterations');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parsePositiveInt(value!, '--exec-iterations');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.execIterations = parsed.value!;
        i += skip;
        break;
      }

      case '--cli-tool': {
        const { value, skip, error } = getArgValue(args, i, '--cli-tool');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parseCliTool(value!, '--cli-tool');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.cliTool = parsed.value!;
        i += skip;
        break;
      }

      case '--plan-cli-tool': {
        const { value, skip, error } = getArgValue(args, i, '--plan-cli-tool');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parseCliTool(value!, '--plan-cli-tool');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.planCliTool = parsed.value!;
        i += skip;
        break;
      }

      case '--execute-cli-tool': {
        const { value, skip, error } = getArgValue(args, i, '--execute-cli-tool');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parseCliTool(value!, '--execute-cli-tool');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.executeCliTool = parsed.value!;
        i += skip;
        break;
      }

      case '--audit-cli-tool': {
        const { value, skip, error } = getArgValue(args, i, '--audit-cli-tool');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parseCliTool(value!, '--audit-cli-tool');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.auditCliTool = parsed.value!;
        i += skip;
        break;
      }

      case '--plan-model': {
        const { value, skip, error } = getArgValue(args, i, '--plan-model');
        if (error) return { success: false, error: `Error: ${error}` };
        result.planModel = value!;
        i += skip;
        break;
      }

      case '--execute-model': {
        const { value, skip, error } = getArgValue(args, i, '--execute-model');
        if (error) return { success: false, error: `Error: ${error}` };
        result.executeModel = value!;
        i += skip;
        break;
      }

      case '--audit-model': {
        const { value, skip, error } = getArgValue(args, i, '--audit-model');
        if (error) return { success: false, error: `Error: ${error}` };
        result.auditModel = value!;
        i += skip;
        break;
      }

      case '--fallback-cli-tools': {
        const { value, skip, error } = getArgValue(args, i, '--fallback-cli-tools');
        if (error) return { success: false, error: `Error: ${error}` };
        const parsed = parseCliToolList(value!, '--fallback-cli-tools');
        if (parsed.error) return { success: false, error: `Error: ${parsed.error}` };
        result.fallbackCliTools = parsed.value!;
        i += skip;
        break;
      }

      case '--preview-plan': {
        result.previewPlan = true;
        break;
      }

      case '--resume': {
        result.resume = true;
        break;
      }

      case '--the-prompt-of-destiny': {
        result.thePromptOfDestiny = true;
        break;
      }

      case '--mock': {
        result.mockMode = true;
        result.cliTool = 'mock';
        break;
      }

      case '--mock-config': {
        const { value, skip, error } = getArgValue(args, i, '--mock-config');
        if (error) return { success: false, error: `Error: ${error}` };
        result.mockConfigPath = value!;
        i += skip;
        break;
      }

      case '--experimental-orchestrator': {
        result.experimentalOrchestrator = true;
        break;
      }

      case '--no-interactive': {
        result.noInteractive = true;
        break;
      }

      case '--verbose': {
        result.verbose = true;
        break;
      }

      case '--debug': {
        result.debug = true;
        break;
      }

      case '--json': {
        result.jsonOutput = true;
        break;
      }

      default: {
        // Check for unknown flags
        if (arg.startsWith('--')) {
          return { success: false, error: `Error: Unknown option: ${argBase}` };
        }
        // It's part of the input prompt
        if (result.input) {
          result.input += ' ' + arg;
        } else {
          result.input = arg;
        }
      }
    }
  }

  // Apply --the-prompt-of-destiny overrides
  if (result.thePromptOfDestiny) {
    result.maxPlanIterations = Number.MAX_SAFE_INTEGER;
    result.maxFollowUpIterations = Number.MAX_SAFE_INTEGER;
    result.execIterations = Number.MAX_SAFE_INTEGER;
  }

  return { success: true, args: result };
}
