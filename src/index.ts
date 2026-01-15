#!/usr/bin/env node

import { executePlan } from './commands/plan';

// Export the interface and implementation for use in other modules
export { AICliTool } from './interfaces/ai-cli-tool';
export { CodexCliTool } from './tools/codex-cli-tool';

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
    console.error('Usage: tenacious-c <prompt|file-path> [--max-plan-iterations <number>]');
    console.error('');
    console.error('Examples:');
    console.error('  tenacious-c "Add user authentication"');
    console.error('  tenacious-c requirements.txt');
    console.error('  tenacious-c "Add user authentication" --max-plan-iterations 5');
    console.error('');
    console.error('Options:');
    console.error('  --max-plan-iterations <number>  Maximum number of plan revisions (default: 10)');
    process.exit(1);
  }

  // Parse arguments
  let input = '';
  let maxRevisions = 10; // Default value
  
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
    } else {
      // It's part of the input prompt
      if (input) {
        input += ' ' + arg;
      } else {
        input = arg;
      }
    }
  }

  if (!input) {
    console.error('Error: No prompt or file path provided');
    process.exit(1);
  }

  try {
    await executePlan(input, maxRevisions);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
