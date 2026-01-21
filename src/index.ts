#!/usr/bin/env node

import { executePlanWithOrchestrator } from './commands/orchestrator-plan';
import { setMockConfig, MockConfig } from './engines/mock-config';
import { readFileSync } from 'fs';
import { parseArgs, printUsage } from './cli';

// Export the interface and implementation for use in other modules
export { AICliTool } from './types/ai-cli-tool';
export { ExecutionContext } from './types/execution-context';

// Export orchestrator plan command
export { executePlanWithOrchestrator } from './commands/orchestrator-plan';

// Export prompt template system
export { PromptTemplate, interpolateTemplate } from './templates/prompt-template';
export { placeholderTemplate, getPlaceholderTemplate } from './templates/plan.template';

// Export plan metadata schema
export {
  PlanMetadata,
  OpenQuestion,
  planMetadataJsonSchema,
  getPlanMetadataSchemaString,
  examplePlanMetadata,
} from './schemas/plan-metadata.schema';

// Export CLI module
export { parseArgs, printUsage } from './cli';
export type { ParsedArgs, ParseResult, CliToolName } from './cli';

// Export engine adapters (new architecture)
export {
  EngineAdapter,
  BaseEngineAdapter,
  CursorAdapter,
  ClaudeAdapter,
  CodexAdapter,
  CopilotAdapter,
  MockAdapter,
  createCursorAdapter,
  createClaudeAdapter,
  createCodexAdapter,
  createCopilotAdapter,
  createMockAdapter,
} from './engines';

// Main CLI entry point
async function main() {
  // Parse arguments using the new CLI parser
  const result = parseArgs(process.argv);

  // Handle parse errors
  if (!result.success) {
    console.error(result.error);
    printUsage();
    process.exit(1);
  }

  const args = result.args!;

  // Handle --help flag
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Handle --version flag
  if (args.version) {
    const path = await import('path');
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
    console.log(pkg.version);
    process.exit(0);
  }

  // Handle no arguments case
  if (process.argv.length <= 2 && !args.resume) {
    printUsage();
    process.exit(1);
  }

  // If --the-prompt-of-destiny is set, notify user (values already overridden by parser)
  if (args.thePromptOfDestiny) {
    console.log('\n🌟 The Prompt of Destiny activated! All iteration limits overridden. Continuing until truly done...');
  }

  // Parse mock config if provided
  if (args.mockConfigPath) {
    try {
      let configJson: string;
      // Check if it's a file path or JSON string
      if (args.mockConfigPath.startsWith('{') || args.mockConfigPath.startsWith('[')) {
        // It's a JSON string
        configJson = args.mockConfigPath;
      } else {
        // It's a file path
        configJson = readFileSync(args.mockConfigPath, 'utf-8');
      }
      const config = JSON.parse(configJson) as Partial<MockConfig>;
      setMockConfig(config);
    } catch (error) {
      console.error(`Error: Failed to parse mock config: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } else if (args.mockMode) {
    // Mock mode enabled but no config provided - use defaults
    setMockConfig(null);
  }

  // If resume is set, input is not required
  if (!args.resume && !args.input) {
    console.error('Error: No prompt or file path provided');
    printUsage();
    process.exit(1);
  }

  try {
    // Use the Orchestrator-based execution (now the default)
    await executePlanWithOrchestrator(
      args.resume ? '' : args.input,
      args.maxPlanIterations,
      args.planConfidence,
      args.maxFollowUpIterations,
      args.execIterations,
      args.thePromptOfDestiny,
      args.cliTool,
      args.previewPlan,
      args.resume,
      args.planModel,
      args.executeModel,
      args.auditModel,
      args.planCliTool,
      args.executeCliTool,
      args.auditCliTool,
      args.fallbackCliTools,
      args.noInteractive,
      args.verbose,
      args.debug,
      args.jsonOutput,
      args.nemesis,
      args.planOnly
    );
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
