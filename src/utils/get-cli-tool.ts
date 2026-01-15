import { AICliTool } from '../interfaces/ai-cli-tool';
import { CodexCliTool } from '../tools/codex-cli-tool';
import { CopilotCliTool } from '../tools/copilot-cli-tool';
import { CursorCliTool } from '../tools/cursor-cli-tool';
import { ClaudeCliTool } from '../tools/claude-cli-tool';
import { CliToolType } from './cli-tool-preference';
import { loadCliToolPreference, saveCliToolPreference } from './cli-tool-preference';
import { detectAvailableTools } from './detect-cli-tools';
import { promptForCliTool } from './prompt-cli-tool';

/**
 * Get the appropriate CLI tool instance based on user preference or auto-detection
 * @param specifiedTool - Tool type specified via --cli-tool argument, or null
 * @returns An AICliTool instance
 */
export async function getCliTool(specifiedTool: CliToolType | null): Promise<AICliTool> {
  // If tool is explicitly specified, use it and save preference
  if (specifiedTool) {
    // Save the explicitly specified tool as preference for future runs
    saveCliToolPreference(specifiedTool);
    
    if (specifiedTool === 'codex') {
      return new CodexCliTool();
    } else if (specifiedTool === 'copilot') {
      return new CopilotCliTool();
    } else if (specifiedTool === 'cursor') {
      return new CursorCliTool();
    } else {
      return new ClaudeCliTool();
    }
  }
  
  // Check for saved preference
  const savedPreference = loadCliToolPreference();
  if (savedPreference) {
    // Verify the saved tool is still available
    const available = detectAvailableTools();
    if ((savedPreference === 'codex' && available.codex) || 
        (savedPreference === 'copilot' && available.copilot) ||
        (savedPreference === 'cursor' && available.cursor) ||
        (savedPreference === 'claude' && available.claude)) {
      if (savedPreference === 'codex') {
        return new CodexCliTool();
      } else if (savedPreference === 'copilot') {
        return new CopilotCliTool();
      } else if (savedPreference === 'cursor') {
        return new CursorCliTool();
      } else {
        return new ClaudeCliTool();
      }
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
      const tool = new CodexCliTool();
      saveCliToolPreference('codex');
      return tool;
    } else if (available.copilot) {
      const tool = new CopilotCliTool();
      saveCliToolPreference('copilot');
      return tool;
    } else if (available.cursor) {
      const tool = new CursorCliTool();
      saveCliToolPreference('cursor');
      return tool;
    } else {
      const tool = new ClaudeCliTool();
      saveCliToolPreference('claude');
      return tool;
    }
  }
  
  // Multiple tools are available - prompt user to select
  const selectedTool = await promptForCliTool(available);
  
  // Save the selection for future runs
  saveCliToolPreference(selectedTool);
  
  if (selectedTool === 'codex') {
    return new CodexCliTool();
  } else if (selectedTool === 'copilot') {
    return new CopilotCliTool();
  } else if (selectedTool === 'cursor') {
    return new CursorCliTool();
  } else {
    return new ClaudeCliTool();
  }
}
