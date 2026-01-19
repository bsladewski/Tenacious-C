import { CliToolType } from '../config/cli-tool-preference';
import { loadCliToolPreference, saveCliToolPreference } from '../config/cli-tool-preference';
import { detectAvailableTools } from './detect-cli-tools';
import { promptForCliTool } from '../ui/prompt-cli-tool';

// =============================================================================
// DEPRECATED: AICliTool-based functions
// These functions are maintained for backward compatibility but internally
// delegate to the CliToolType-based selection functions.
// =============================================================================

/**
 * Dummy AICliTool implementation for backward compatibility
 * @deprecated The AICliTool interface is deprecated; use selectCliTool instead
 */
class DummyCliTool {
  async execute(): Promise<void> {
    throw new Error('DummyCliTool.execute() should not be called - use executeWithFallback with toolType instead');
  }
}

/**
 * Get the appropriate CLI tool instance based on user preference or auto-detection
 * @deprecated Use selectCliTool instead - the returned AICliTool is now a dummy that should not be used
 * @param specifiedTool - Tool type specified via --cli-tool argument, or null
 * @returns A dummy AICliTool instance (the actual execution uses EngineAdapter internally)
 */
export async function getCliTool(specifiedTool: CliToolType | null): Promise<DummyCliTool> {
  // Perform the selection logic (which may prompt the user and save preferences)
  await selectCliTool(specifiedTool);
  // Return a dummy tool - the actual execution will use EngineAdapter
  return new DummyCliTool();
}

/**
 * Get a CLI tool instance without saving preferences (for action-specific overrides)
 * @deprecated Use selectCliToolWithoutSaving instead
 * @param specifiedTool - Tool type to use, or null to use default detection
 * @returns A dummy AICliTool instance
 */
async function getCliToolWithoutSaving(specifiedTool: CliToolType | null): Promise<DummyCliTool> {
  await selectCliToolWithoutSaving(specifiedTool);
  return new DummyCliTool();
}

/**
 * Action types for CLI tool selection
 */
export type ActionType = 'plan' | 'execute' | 'audit';

/**
 * Get the appropriate CLI tool for a specific action type
 * @deprecated Use selectCliToolForAction instead
 * @param actionType - The type of action (plan, execute, or audit)
 * @param actionSpecificTool - Tool specified for this specific action, or null
 * @param defaultTool - Default tool to use if action-specific tool is not specified, or null
 * @returns A dummy AICliTool instance
 */
export async function getCliToolForAction(
  _actionType: ActionType,
  actionSpecificTool: CliToolType | null,
  defaultTool: CliToolType | null
): Promise<DummyCliTool> {
  // If there's an action-specific tool, use it (without saving preferences)
  if (actionSpecificTool) {
    return await getCliToolWithoutSaving(actionSpecificTool);
  }

  // Otherwise, use the default tool (which may save preferences if it's the main --cli-tool)
  return await getCliTool(defaultTool);
}

// =============================================================================
// NEW: CliToolType-based selection functions
// These functions handle tool selection logic and return CliToolType directly.
// =============================================================================

/**
 * Select the appropriate CLI tool type based on user preference or auto-detection
 * @param specifiedTool - Tool type specified via --cli-tool argument, or null
 * @returns The selected CliToolType
 */
export async function selectCliTool(specifiedTool: CliToolType | null): Promise<CliToolType> {
  // If tool is explicitly specified, use it and save preference (except mock)
  if (specifiedTool) {
    // Save the explicitly specified tool as preference for future runs (but not mock)
    if (specifiedTool !== 'mock') {
      saveCliToolPreference(specifiedTool);
    }
    return specifiedTool;
  }

  // Check for saved preference
  const savedPreference = loadCliToolPreference();
  if (savedPreference) {
    // Verify the saved tool is still available (mock is never saved)
    const available = detectAvailableTools();
    if ((savedPreference === 'codex' && available.codex) ||
        (savedPreference === 'copilot' && available.copilot) ||
        (savedPreference === 'cursor' && available.cursor) ||
        (savedPreference === 'claude' && available.claude)) {
      return savedPreference;
    }
  }

  // No preference or saved tool not available - detect and prompt if needed
  const available = detectAvailableTools();

  if (!available.codex && !available.copilot && !available.cursor && !available.claude) {
    throw new Error('No CLI tools are available. Please install Codex CLI, GitHub Copilot CLI, Cursor CLI, or Claude Code CLI.');
  }

  // Count available tools
  const availableCount = [available.codex, available.copilot, available.cursor, available.claude].filter(Boolean).length;

  // If only one is available, use it
  if (availableCount === 1) {
    if (available.codex) {
      saveCliToolPreference('codex');
      return 'codex';
    } else if (available.copilot) {
      saveCliToolPreference('copilot');
      return 'copilot';
    } else if (available.cursor) {
      saveCliToolPreference('cursor');
      return 'cursor';
    } else {
      saveCliToolPreference('claude');
      return 'claude';
    }
  }

  // Multiple tools are available - prompt user to select
  const selectedTool = await promptForCliTool(available);

  // Save the selection for future runs
  saveCliToolPreference(selectedTool);

  return selectedTool;
}

/**
 * Select a CLI tool type without saving preferences (for action-specific overrides)
 * @param specifiedTool - Tool type to use, or null to use default detection
 * @returns The selected CliToolType
 */
export async function selectCliToolWithoutSaving(specifiedTool: CliToolType | null): Promise<CliToolType> {
  // If tool is explicitly specified, use it but don't save preference
  if (specifiedTool) {
    return specifiedTool;
  }

  // No tool specified - use the default selectCliTool which handles preferences
  return await selectCliTool(null);
}

/**
 * Select the appropriate CLI tool type for a specific action
 * @param actionType - The type of action (plan, execute, or audit)
 * @param actionSpecificTool - Tool specified for this specific action, or null
 * @param defaultTool - Default tool to use if action-specific tool is not specified, or null
 * @returns The selected CliToolType
 */
export async function selectCliToolForAction(
  _actionType: ActionType,
  actionSpecificTool: CliToolType | null,
  defaultTool: CliToolType | null
): Promise<CliToolType> {
  // If there's an action-specific tool, use it (without saving preferences)
  if (actionSpecificTool) {
    return await selectCliToolWithoutSaving(actionSpecificTool);
  }

  // Otherwise, use the default tool (which may save preferences if it's the main --cli-tool)
  return await selectCliTool(defaultTool);
}
