#!/usr/bin/env node

import { executePlan } from './commands/plan';

// Export the interface and implementation for use in other modules
export { AICliTool } from './interfaces/ai-cli-tool';
export { CodexCliTool } from './tools/codex-cli-tool';
export { CopilotCliTool } from './tools/copilot-cli-tool';
export { CursorCliTool } from './tools/cursor-cli-tool';
export { ClaudeCliTool } from './tools/claude-cli-tool';

// Export plan command
export { executePlan } from './commands/plan';

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

// Main CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: tenacious-c <prompt|file-path> [--max-plan-iterations <number>] [--plan-confidence <number>] [--max-follow-up-iterations <number>] [--exec-iterations <number>] [--cli-tool <codex|copilot|cursor|claude>] [--plan-cli-tool <codex|copilot|cursor|claude>] [--execute-cli-tool <codex|copilot|cursor|claude>] [--audit-cli-tool <codex|copilot|cursor|claude>] [--plan-model <model>] [--execute-model <model>] [--audit-model <model>] [--preview-plan] [--resume] [--the-prompt-of-destiny]');
    console.error('');
    console.error('Examples:');
    console.error('  tenacious-c "Add user authentication"');
    console.error('  tenacious-c requirements.txt');
    console.error('  tenacious-c "Add user authentication" --max-plan-iterations 5');
    console.error('  tenacious-c "Add user authentication" --plan-confidence 90');
    console.error('  tenacious-c "Add user authentication" --max-follow-up-iterations 15');
    console.error('  tenacious-c "Add user authentication" --exec-iterations 3');
    console.error('  tenacious-c "Add user authentication" --cli-tool copilot');
    console.error('  tenacious-c "Add user authentication" --cli-tool cursor');
    console.error('  tenacious-c "Add user authentication" --cli-tool claude');
    console.error('  tenacious-c "Add user authentication" --plan-model sonnet-4.5 --execute-model opus-4.5-thinking --audit-model gpt-5.2-codex');
    console.error('  tenacious-c "Add user authentication" --plan-cli-tool codex --execute-cli-tool claude --audit-cli-tool codex');
    console.error('  tenacious-c "Add user authentication" --preview-plan');
    console.error('  tenacious-c --resume');
    console.error('  tenacious-c "Add user authentication" --the-prompt-of-destiny');
    console.error('');
    console.error('Options:');
    console.error('  --max-plan-iterations <number>      Maximum number of plan revisions (default: 10)');
    console.error('  --plan-confidence <number>          Minimum confidence threshold (0-100) (default: 85)');
    console.error('  --max-follow-up-iterations <number>  Maximum number of follow-up execution iterations (default: 10)');
    console.error('  --exec-iterations <number>          Maximum number of plan-based execution iterations (default: 5)');
    console.error('  --cli-tool <codex|copilot|cursor|claude>  CLI tool to use (default: auto-detect or prompt, saved as preference)');
    console.error('  --plan-cli-tool <codex|copilot|cursor|claude>  CLI tool to use for plan generation/revisions (overrides --cli-tool, not saved)');
    console.error('  --execute-cli-tool <codex|copilot|cursor|claude>  CLI tool to use for execution/follow-ups (overrides --cli-tool, not saved)');
    console.error('  --audit-cli-tool <codex|copilot|cursor|claude>  CLI tool to use for gap audits (overrides --cli-tool, not saved)');
    console.error('  --plan-model <model>               Model to use for plan generation and revisions (optional)');
    console.error('  --execute-model <model>            Model to use for plan execution and follow-ups (optional)');
    console.error('  --audit-model <model>               Model to use for gap audits (optional)');
    console.error('  --preview-plan                      Preview the initial plan before execution');
    console.error('  --resume                            Resume the most recent interrupted run');
    console.error('  --the-prompt-of-destiny             Override all iteration limits - continue until truly done');
    process.exit(1);
  }

  // Parse arguments
  let input = '';
  let maxRevisions = 10; // Default value
  let planConfidence = 85; // Default value
  let maxFollowUpIterations = 10; // Default value
  let execIterations = 5; // Default value
  let thePromptOfDestiny = false; // Default value
  let cliTool: 'codex' | 'copilot' | 'cursor' | 'claude' | null = null; // Default value
  let planModel: string | null = null; // Default value
  let executeModel: string | null = null; // Default value
  let auditModel: string | null = null; // Default value
  let planCliTool: 'codex' | 'copilot' | 'cursor' | 'claude' | null = null; // Default value
  let executeCliTool: 'codex' | 'copilot' | 'cursor' | 'claude' | null = null; // Default value
  let auditCliTool: 'codex' | 'copilot' | 'cursor' | 'claude' | null = null; // Default value
  let previewPlan = false; // Default value
  let resume = false; // Default value
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--max-plan-iterations') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --max-plan-iterations requires a number value');
        process.exit(1);
      }
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed < 1) {
        console.error('Error: --max-plan-iterations must be a positive integer');
        process.exit(1);
      }
      maxRevisions = parsed;
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--max-plan-iterations=')) {
      // Handle --max-plan-iterations=5 format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --max-plan-iterations= requires a number value');
        process.exit(1);
      }
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed < 1) {
        console.error('Error: --max-plan-iterations must be a positive integer');
        process.exit(1);
      }
      maxRevisions = parsed;
    } else if (arg === '--plan-confidence') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --plan-confidence requires a number value');
        process.exit(1);
      }
      const parsed = parseFloat(value);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        console.error('Error: --plan-confidence must be a number between 0 and 100');
        process.exit(1);
      }
      planConfidence = parsed;
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--plan-confidence=')) {
      // Handle --plan-confidence=85 format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --plan-confidence= requires a number value');
        process.exit(1);
      }
      const parsed = parseFloat(value);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        console.error('Error: --plan-confidence must be a number between 0 and 100');
        process.exit(1);
      }
      planConfidence = parsed;
    } else if (arg === '--max-follow-up-iterations') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --max-follow-up-iterations requires a number value');
        process.exit(1);
      }
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed < 1) {
        console.error('Error: --max-follow-up-iterations must be a positive integer');
        process.exit(1);
      }
      maxFollowUpIterations = parsed;
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--max-follow-up-iterations=')) {
      // Handle --max-follow-up-iterations=10 format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --max-follow-up-iterations= requires a number value');
        process.exit(1);
      }
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed < 1) {
        console.error('Error: --max-follow-up-iterations must be a positive integer');
        process.exit(1);
      }
      maxFollowUpIterations = parsed;
    } else if (arg === '--exec-iterations') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --exec-iterations requires a number value');
        process.exit(1);
      }
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed < 1) {
        console.error('Error: --exec-iterations must be a positive integer');
        process.exit(1);
      }
      execIterations = parsed;
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--exec-iterations=')) {
      // Handle --exec-iterations=5 format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --exec-iterations= requires a number value');
        process.exit(1);
      }
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed < 1) {
        console.error('Error: --exec-iterations must be a positive integer');
        process.exit(1);
      }
      execIterations = parsed;
    } else if (arg === '--cli-tool') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --cli-tool requires a value (codex, copilot, or cursor)');
        process.exit(1);
      }
      if (value !== 'codex' && value !== 'copilot' && value !== 'cursor' && value !== 'claude') {
        console.error('Error: --cli-tool must be one of "codex", "copilot", "cursor", or "claude"');
        process.exit(1);
      }
      cliTool = value as 'codex' | 'copilot' | 'cursor' | 'claude';
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--cli-tool=')) {
      // Handle --cli-tool=copilot format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --cli-tool= requires a value (codex, copilot, or cursor)');
        process.exit(1);
      }
      if (value !== 'codex' && value !== 'copilot' && value !== 'cursor' && value !== 'claude') {
        console.error('Error: --cli-tool must be one of "codex", "copilot", "cursor", or "claude"');
        process.exit(1);
      }
      cliTool = value as 'codex' | 'copilot' | 'cursor' | 'claude';
    } else if (arg === '--plan-model') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --plan-model requires a model name value');
        process.exit(1);
      }
      planModel = value;
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--plan-model=')) {
      // Handle --plan-model=sonnet-4.5 format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --plan-model= requires a model name value');
        process.exit(1);
      }
      planModel = value;
    } else if (arg === '--execute-model') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --execute-model requires a model name value');
        process.exit(1);
      }
      executeModel = value;
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--execute-model=')) {
      // Handle --execute-model=opus-4.5-thinking format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --execute-model= requires a model name value');
        process.exit(1);
      }
      executeModel = value;
    } else if (arg === '--audit-model') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --audit-model requires a model name value');
        process.exit(1);
      }
      auditModel = value;
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--audit-model=')) {
      // Handle --audit-model=gpt-5.2-codex format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --audit-model= requires a model name value');
        process.exit(1);
      }
      auditModel = value;
    } else if (arg === '--plan-cli-tool') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --plan-cli-tool requires a value (codex, copilot, cursor, or claude)');
        process.exit(1);
      }
      if (value !== 'codex' && value !== 'copilot' && value !== 'cursor' && value !== 'claude') {
        console.error('Error: --plan-cli-tool must be one of "codex", "copilot", "cursor", or "claude"');
        process.exit(1);
      }
      planCliTool = value as 'codex' | 'copilot' | 'cursor' | 'claude';
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--plan-cli-tool=')) {
      // Handle --plan-cli-tool=codex format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --plan-cli-tool= requires a value (codex, copilot, cursor, or claude)');
        process.exit(1);
      }
      if (value !== 'codex' && value !== 'copilot' && value !== 'cursor' && value !== 'claude') {
        console.error('Error: --plan-cli-tool must be one of "codex", "copilot", "cursor", or "claude"');
        process.exit(1);
      }
      planCliTool = value as 'codex' | 'copilot' | 'cursor' | 'claude';
    } else if (arg === '--execute-cli-tool') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --execute-cli-tool requires a value (codex, copilot, cursor, or claude)');
        process.exit(1);
      }
      if (value !== 'codex' && value !== 'copilot' && value !== 'cursor' && value !== 'claude') {
        console.error('Error: --execute-cli-tool must be one of "codex", "copilot", "cursor", or "claude"');
        process.exit(1);
      }
      executeCliTool = value as 'codex' | 'copilot' | 'cursor' | 'claude';
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--execute-cli-tool=')) {
      // Handle --execute-cli-tool=claude format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --execute-cli-tool= requires a value (codex, copilot, cursor, or claude)');
        process.exit(1);
      }
      if (value !== 'codex' && value !== 'copilot' && value !== 'cursor' && value !== 'claude') {
        console.error('Error: --execute-cli-tool must be one of "codex", "copilot", "cursor", or "claude"');
        process.exit(1);
      }
      executeCliTool = value as 'codex' | 'copilot' | 'cursor' | 'claude';
    } else if (arg === '--audit-cli-tool') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: --audit-cli-tool requires a value (codex, copilot, cursor, or claude)');
        process.exit(1);
      }
      if (value !== 'codex' && value !== 'copilot' && value !== 'cursor' && value !== 'claude') {
        console.error('Error: --audit-cli-tool must be one of "codex", "copilot", "cursor", or "claude"');
        process.exit(1);
      }
      auditCliTool = value as 'codex' | 'copilot' | 'cursor' | 'claude';
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith('--audit-cli-tool=')) {
      // Handle --audit-cli-tool=codex format
      const value = arg.split('=')[1];
      if (!value) {
        console.error('Error: --audit-cli-tool= requires a value (codex, copilot, cursor, or claude)');
        process.exit(1);
      }
      if (value !== 'codex' && value !== 'copilot' && value !== 'cursor' && value !== 'claude') {
        console.error('Error: --audit-cli-tool must be one of "codex", "copilot", "cursor", or "claude"');
        process.exit(1);
      }
      auditCliTool = value as 'codex' | 'copilot' | 'cursor' | 'claude';
    } else if (arg === '--preview-plan') {
      previewPlan = true;
    } else if (arg === '--resume') {
      resume = true;
    } else if (arg === '--the-prompt-of-destiny') {
      thePromptOfDestiny = true;
    } else {
      // It's part of the input prompt
      if (input) {
        input += ' ' + arg;
      } else {
        input = arg;
      }
    }
  }
  
  // If --the-prompt-of-destiny is set, override all iteration limits
  if (thePromptOfDestiny) {
    maxRevisions = Number.MAX_SAFE_INTEGER;
    maxFollowUpIterations = Number.MAX_SAFE_INTEGER;
    execIterations = Number.MAX_SAFE_INTEGER;
    console.log('\n🌟 The Prompt of Destiny activated! All iteration limits overridden. Continuing until truly done...');
  }

  // If resume is set, input is not required
  if (!resume && !input) {
    console.error('Error: No prompt or file path provided');
    process.exit(1);
  }

  try {
    // If resume is set, input is ignored (can be empty string)
    await executePlan(resume ? '' : input, maxRevisions, planConfidence, maxFollowUpIterations, execIterations, thePromptOfDestiny, cliTool, previewPlan, resume, planModel, executeModel, auditModel, planCliTool, executeCliTool, auditCliTool);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
