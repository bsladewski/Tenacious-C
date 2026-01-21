import { AICliTool } from '../types/ai-cli-tool';
import { ExecutionContext } from '../types/execution-context';
import { CliToolType } from '../config/cli-tool-preference';

// New engine adapters for Phase 3+
import { EngineAdapter, EngineAdapterOptions } from './engine-adapter';
import { EngineExecutionOptions, isEngineSuccess } from '../types/engine-result';
import { createCursorAdapter } from './cursor-adapter';
import { createClaudeAdapter } from './claude-adapter';
import { createCodexAdapter } from './codex-adapter';
import { createCopilotAdapter } from './copilot-adapter';
import { createMockAdapter } from './mock-adapter';
import { createRealProcessRunner } from './real-process-runner';
import { getDefaultSpinnerService } from '../ui';
import {
  validateExecutionArtifacts,
  validatePlanArtifacts,
  validateGapAuditArtifacts,
} from '../io';

/**
 * Result of executing with fallback
 */
export interface ExecuteWithFallbackResult {
  /**
   * Whether the execution succeeded
   */
  success: boolean;

  /**
   * The tool that was used for successful execution (may differ from original if fallback occurred)
   */
  usedTool: CliToolType | null;

  /**
   * Whether a fallback occurred
   */
  fallbackOccurred: boolean;

  /**
   * The model that was used (null if cleared due to fallback)
   */
  usedModel: string | null;

  /**
   * Remaining fallback tools after this execution
   */
  remainingFallbackTools: CliToolType[];
}

/**
 * Execute a prompt with fallback support
 *
 * When the primary tool fails after exhausting retries, this function tries
 * the next tool in the fallback list. The model is cleared when falling back
 * because the fallback tool may not support the same models.
 *
 * @param tool - The primary CLI tool to use
 * @param toolType - The type of the primary tool (for tracking)
 * @param prompt - The prompt to execute
 * @param model - Optional model to use (cleared on fallback)
 * @param fallbackTools - List of fallback tools to try if primary fails
 * @param context - Optional execution context to pass to the tool
 * @returns Result containing success status and updated tool/model info
 */
export async function executeWithFallback(
  _tool: AICliTool,
  toolType: CliToolType | null,
  prompt: string,
  model: string | null | undefined,
  fallbackTools: CliToolType[],
  context?: ExecutionContext
): Promise<ExecuteWithFallbackResult> {
  // If no tool type specified, we can't use the engine adapter path
  if (!toolType) {
    throw new Error('Tool type must be specified for execution');
  }

  // Delegate to the engine adapter-based implementation
  // The AICliTool parameter is now ignored in favor of using EngineAdapter
  return executeWithEngineAdapter(toolType, prompt, model, fallbackTools, context);
}

/**
 * Configuration for phase-specific tool and model
 */
export interface PhaseToolConfig {
  tool: CliToolType | null;
  model: string | null;
}

/**
 * Mutable configuration that tracks current tool/model state for each phase
 * This is updated when fallback occurs
 */
export interface MutableToolConfig {
  plan: PhaseToolConfig;
  execute: PhaseToolConfig;
  audit: PhaseToolConfig;
  fallbackTools: CliToolType[];
}

/**
 * Create initial mutable tool config from CLI arguments
 */
export function createMutableToolConfig(
  defaultCliTool: CliToolType | null,
  planCliTool: CliToolType | null,
  executeCliTool: CliToolType | null,
  auditCliTool: CliToolType | null,
  planModel: string | null,
  executeModel: string | null,
  auditModel: string | null,
  fallbackCliTools: CliToolType[]
): MutableToolConfig {
  return {
    plan: {
      tool: planCliTool || defaultCliTool,
      model: planModel,
    },
    execute: {
      tool: executeCliTool || defaultCliTool,
      model: executeModel,
    },
    audit: {
      tool: auditCliTool || defaultCliTool,
      model: auditModel,
    },
    fallbackTools: [...fallbackCliTools],
  };
}

/**
 * Update phase config after fallback
 */
export function updatePhaseAfterFallback(
  config: MutableToolConfig,
  phase: 'plan' | 'execute' | 'audit',
  result: ExecuteWithFallbackResult
): void {
  if (result.fallbackOccurred) {
    config[phase].tool = result.usedTool;
    config[phase].model = null; // Model cleared on fallback
    config.fallbackTools = result.remainingFallbackTools;
  }
}

// =============================================================================
// NEW ENGINE ADAPTER-BASED EXECUTION (Phase 3+)
// These functions use the new EngineAdapter interface internally while
// maintaining backward compatibility with the existing execution flow.
// =============================================================================

/**
 * Shared process runner instance for engine adapters
 * Created lazily on first use
 */
let sharedProcessRunner: ReturnType<typeof createRealProcessRunner> | null = null;

/**
 * Get the shared process runner instance
 */
function getProcessRunner(): ReturnType<typeof createRealProcessRunner> {
  if (!sharedProcessRunner) {
    sharedProcessRunner = createRealProcessRunner();
  }
  return sharedProcessRunner;
}

/**
 * Create an engine adapter for a given tool type
 */
export function getEngineAdapter(toolType: CliToolType): EngineAdapter {
  const processRunner = getProcessRunner();
  const options: EngineAdapterOptions = { processRunner };

  switch (toolType) {
    case 'codex':
      return createCodexAdapter(options);
    case 'copilot':
      return createCopilotAdapter(options);
    case 'cursor':
      return createCursorAdapter(options);
    case 'claude':
      return createClaudeAdapter(options);
    case 'mock':
      return createMockAdapter();
  }
}

/**
 * Map ExecutionContext phase to EngineExecutionOptions mode
 */
function mapPhaseToMode(phase: ExecutionContext['phase']): EngineExecutionOptions['mode'] {
  switch (phase) {
    case 'plan-generation':
    case 'answer-questions':
    case 'improve-plan':
    case 'gap-plan':
      return 'plan';
    case 'execute-plan':
    case 'execute-follow-ups':
      return 'execute';
    case 'gap-audit':
      return 'audit';
    case 'generate-summary':
      return 'plan'; // Summary uses plan mode semantics
    default:
      return 'plan';
  }
}

/**
 * Convert ExecutionContext and prompt to EngineExecutionOptions
 */
export function contextToEngineOptions(
  prompt: string,
  model: string | null | undefined,
  context?: ExecutionContext
): EngineExecutionOptions {
  const mode = context ? mapPhaseToMode(context.phase) : 'plan';

  return {
    mode,
    userMessage: prompt,
    cwd: context?.outputDirectory ?? process.cwd(),
    model: model ?? undefined,
    transcriptDir: context?.outputDirectory,
  };
}

/**
 * Get a display name for a tool type
 */
function getToolDisplayName(toolType: CliToolType): string {
  switch (toolType) {
    case 'cursor':
      return 'Cursor';
    case 'claude':
      return 'Claude';
    case 'codex':
      return 'Codex';
    case 'copilot':
      return 'Copilot';
    case 'mock':
      return 'Mock';
    default:
      return toolType;
  }
}

/**
 * Validate artifacts based on the execution phase
 * Returns null if validation is not applicable for the phase
 */
function validateArtifactsForPhase(
  context: ExecutionContext
): { valid: boolean; missing: string[]; errors: string[] } | null {
  const { phase, outputDirectory, executionIteration } = context;

  if (!outputDirectory) {
    return null;
  }

  switch (phase) {
    case 'execute-plan':
    case 'execute-follow-ups':
      if (executionIteration === undefined) {
        return null;
      }
      return validateExecutionArtifacts(outputDirectory, executionIteration);

    case 'plan-generation':
    case 'improve-plan':
    case 'answer-questions':
      return validatePlanArtifacts(outputDirectory);

    case 'gap-audit':
      if (executionIteration === undefined) {
        return null;
      }
      return validateGapAuditArtifacts(outputDirectory, executionIteration);

    case 'gap-plan':
      // Gap plan uses the same plan validation but with a different filename pattern
      // For now, skip validation as the filename varies (gap-plan-{iteration}.md)
      return null;

    case 'generate-summary':
      // Summary generation doesn't produce artifacts we need to validate
      return null;

    default:
      return null;
  }
}

/**
 * Execute a prompt using engine adapters with fallback support
 *
 * This is the new implementation that uses EngineAdapter interface internally.
 * It provides the same external interface as executeWithFallback for backward compatibility.
 *
 * @param toolType - The type of the primary tool to use
 * @param prompt - The prompt to execute
 * @param model - Optional model to use (cleared on fallback)
 * @param fallbackTools - List of fallback tools to try if primary fails
 * @param context - Optional execution context
 * @returns Result containing success status and updated tool/model info
 */
export async function executeWithEngineAdapter(
  toolType: CliToolType,
  prompt: string,
  model: string | null | undefined,
  fallbackTools: CliToolType[],
  context?: ExecutionContext
): Promise<ExecuteWithFallbackResult> {
  const options = contextToEngineOptions(prompt, model, context);
  const spinnerService = getDefaultSpinnerService();

  // Try primary adapter first with retry logic for artifact validation
  const primaryAdapter = getEngineAdapter(toolType);
  const primaryToolName = getToolDisplayName(toolType);
  const primarySpinner = spinnerService.start(`Executing ${primaryToolName}`);

  try {
    // Retry loop for artifact validation (same as adapter retries: 2 retries = 3 total attempts)
    const maxRetries = 2;
    const retryDelayMs = 10000; // 10 seconds, matching adapter retry delay
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await primaryAdapter.execute(options);

        if (isEngineSuccess(result)) {
          // Validate artifacts after successful execution based on phase
          if (context?.phase && context?.outputDirectory) {
            const validationResult = validateArtifactsForPhase(context);
            if (validationResult && !validationResult.valid) {
              // Artifacts missing - treat as retryable failure
              const missingMsg = validationResult.missing.length > 0
                ? `Missing files: [${validationResult.missing.join(', ')}]`
                : '';
              const errorMsg = validationResult.errors.length > 0
                ? `Validation errors: [${validationResult.errors.join(', ')}]`
                : '';

              if (attempt < maxRetries) {
                // Retry the execution
                primarySpinner.setText(`${primaryToolName} execution completed but artifacts are missing or invalid (retry ${attempt + 1}/${maxRetries + 1})...`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                lastError = new Error(`Artifact validation failed: ${[missingMsg, errorMsg].filter(Boolean).join('. ')}`);
                continue; // Retry
              } else {
                // All retries exhausted
                primarySpinner.fail(`${primaryToolName} execution completed but artifacts are missing or invalid after ${maxRetries + 1} attempts`);
                throw new Error(`Artifact validation failed: ${[missingMsg, errorMsg].filter(Boolean).join('. ')}`);
              }
            }
          }

          // Success - artifacts are valid
          primarySpinner.succeed(`Executed ${primaryToolName}`);
          return {
            success: true,
            usedTool: toolType,
            fallbackOccurred: false,
            usedModel: model ?? null,
            remainingFallbackTools: fallbackTools,
          };
        }

        // Non-zero exit code - treat as failure (adapter already retried, so this is final)
        primarySpinner.fail(`${primaryToolName} execution failed`);
        throw new Error(`${toolType} execution failed with exit code ${result.exitCode}`);
      } catch (error) {
        // If this is an artifact validation error and we have retries left, continue the loop
        if (error instanceof Error && error.message.includes('Artifact validation failed') && attempt < maxRetries) {
          lastError = error;
          continue;
        }
        // Otherwise, rethrow to trigger fallback
        throw error;
      }
    }

    // If we exhausted retries, throw the last error
    if (lastError) {
      throw lastError;
    }
  } catch (primaryError) {
    primarySpinner.fail(`${primaryToolName} execution failed`);
    console.log(`\n⚠️  Primary engine adapter failed: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}`);

    // Try fallback adapters in order
    const remainingFallbacks = [...fallbackTools];

    while (remainingFallbacks.length > 0) {
      const fallbackToolType = remainingFallbacks.shift()!;

      // Skip if fallback is the same as the failed tool
      if (fallbackToolType === toolType) {
        continue;
      }

      console.log(`\n🔄 Falling back to ${fallbackToolType} engine adapter...`);
      console.log(`   ⚠️  Model cleared (fallback tool may not support the same models)`);

      const fallbackAdapter = getEngineAdapter(fallbackToolType);
      const fallbackOptions = contextToEngineOptions(prompt, null, context); // Clear model
      const fallbackToolName = getToolDisplayName(fallbackToolType);
      const fallbackSpinner = spinnerService.start(`Executing ${fallbackToolName}`);

      try {
        // Same retry logic for fallback tools
        const maxRetries = 2;
        const retryDelayMs = 10000; // 10 seconds, matching adapter retry delay
        let lastFallbackError: Error | undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const result = await fallbackAdapter.execute(fallbackOptions);

            if (isEngineSuccess(result)) {
              // Validate artifacts after successful fallback execution based on phase
              if (context?.phase && context?.outputDirectory) {
                const validationResult = validateArtifactsForPhase(context);
                if (validationResult && !validationResult.valid) {
                  // Artifacts missing - treat as retryable failure
                  const missingMsg = validationResult.missing.length > 0
                    ? `Missing files: [${validationResult.missing.join(', ')}]`
                    : '';
                  const errorMsg = validationResult.errors.length > 0
                    ? `Validation errors: [${validationResult.errors.join(', ')}]`
                    : '';

                  if (attempt < maxRetries) {
                    // Retry the execution
                    fallbackSpinner.setText(`${fallbackToolName} execution completed but artifacts are missing or invalid (retry ${attempt + 1}/${maxRetries + 1})...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                    lastFallbackError = new Error(`Artifact validation failed: ${[missingMsg, errorMsg].filter(Boolean).join('. ')}`);
                    continue; // Retry
                  } else {
                    // All retries exhausted
                    fallbackSpinner.fail(`${fallbackToolName} execution completed but artifacts are missing or invalid after ${maxRetries + 1} attempts`);
                    throw new Error(`Artifact validation failed: ${[missingMsg, errorMsg].filter(Boolean).join('. ')}`);
                  }
                }
              }

              // Success - artifacts are valid
              fallbackSpinner.succeed(`Executed ${fallbackToolName}`);
              return {
                success: true,
                usedTool: fallbackToolType,
                fallbackOccurred: true,
                usedModel: null, // Model cleared on fallback
                remainingFallbackTools: remainingFallbacks,
              };
            }

            // Non-zero exit code - treat as failure (adapter already retried, so this is final)
            fallbackSpinner.fail(`${fallbackToolName} execution failed`);
            throw new Error(`${fallbackToolType} execution failed with exit code ${result.exitCode}`);
          } catch (error) {
            // If this is an artifact validation error and we have retries left, continue the loop
            if (error instanceof Error && error.message.includes('Artifact validation failed') && attempt < maxRetries) {
              lastFallbackError = error;
              continue;
            }
            // Otherwise, rethrow to trigger next fallback
            throw error;
          }
        }

        // If we exhausted retries, throw the last error
        if (lastFallbackError) {
          throw lastFallbackError;
        }
      } catch (fallbackError) {
        fallbackSpinner.fail(`${fallbackToolName} execution failed`);
        console.log(`\n⚠️  Fallback engine adapter ${fallbackToolType} also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        // Continue to next fallback
      }
    }

    // All fallbacks exhausted
    throw new Error(`All engine adapters failed. Primary error: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}`);
  }

  // This should never be reached, but TypeScript requires it
  throw new Error('Unexpected execution path');
}

/**
 * Check if an engine adapter is available for a given tool type
 */
export async function isEngineAdapterAvailable(toolType: CliToolType): Promise<boolean> {
  const adapter = getEngineAdapter(toolType);
  return adapter.isAvailable();
}

/**
 * Get the version of an engine adapter
 */
export async function getEngineAdapterVersion(toolType: CliToolType): Promise<string | undefined> {
  const adapter = getEngineAdapter(toolType);
  return adapter.getVersion();
}
