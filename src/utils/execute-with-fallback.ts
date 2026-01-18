import ora from 'ora';
import { AICliTool } from '../interfaces/ai-cli-tool';
import { ExecutionContext } from '../interfaces/execution-context';
import { CliToolType } from './cli-tool-preference';
import { CodexCliTool } from '../tools/codex-cli-tool';
import { CopilotCliTool } from '../tools/copilot-cli-tool';
import { CursorCliTool } from '../tools/cursor-cli-tool';
import { ClaudeCliTool } from '../tools/claude-cli-tool';
import { MockCliTool } from '../tools/mock-cli-tool';

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
 * Get a CLI tool instance for a given tool type
 */
function getToolInstance(toolType: CliToolType): AICliTool {
  switch (toolType) {
    case 'codex':
      return new CodexCliTool();
    case 'copilot':
      return new CopilotCliTool();
    case 'cursor':
      return new CursorCliTool();
    case 'claude':
      return new ClaudeCliTool();
    case 'mock':
      return new MockCliTool();
  }
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
  tool: AICliTool,
  toolType: CliToolType | null,
  prompt: string,
  model: string | null | undefined,
  fallbackTools: CliToolType[],
  context?: ExecutionContext
): Promise<ExecuteWithFallbackResult> {
  // Try primary tool first
  try {
    await tool.execute(prompt, model || undefined, context);
    return {
      success: true,
      usedTool: toolType,
      fallbackOccurred: false,
      usedModel: model || null,
      remainingFallbackTools: fallbackTools,
    };
  } catch (primaryError) {
    // Primary tool failed after retries
    console.log(`\n⚠️  Primary tool failed: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}`);
    
    // Try fallback tools in order
    const remainingFallbacks = [...fallbackTools];
    
    while (remainingFallbacks.length > 0) {
      const fallbackToolType = remainingFallbacks.shift()!;
      
      // Skip if fallback is the same as the failed tool
      if (fallbackToolType === toolType) {
        continue;
      }
      
      console.log(`\n🔄 Falling back to ${fallbackToolType}...`);
      console.log(`   ⚠️  Model cleared (fallback tool may not support the same models)`);
      
      const fallbackTool = getToolInstance(fallbackToolType);
      
      try {
        // Execute without model (cleared on fallback), but pass context through
        await fallbackTool.execute(prompt, undefined, context);
        
        return {
          success: true,
          usedTool: fallbackToolType,
          fallbackOccurred: true,
          usedModel: null, // Model cleared on fallback
          remainingFallbackTools: remainingFallbacks,
        };
      } catch (fallbackError) {
        console.log(`\n⚠️  Fallback tool ${fallbackToolType} also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        // Continue to next fallback
      }
    }
    
    // All fallbacks exhausted
    throw new Error(`All CLI tools failed. Primary tool error: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}`);
  }
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
