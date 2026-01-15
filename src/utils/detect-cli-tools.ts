import { execSync } from 'child_process';

/**
 * Check if a command is available in the system PATH
 * @param command - Command name to check
 * @returns true if command is available, false otherwise
 */
function isCommandAvailable(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Codex CLI is available
 * @returns true if codex command is available
 */
export function isCodexAvailable(): boolean {
  return isCommandAvailable('codex');
}

/**
 * Check if GitHub Copilot CLI is available
 * @returns true if copilot command is available (new standalone CLI)
 */
export function isCopilotAvailable(): boolean {
  // Check for the new GitHub Copilot CLI (standalone tool, not gh extension)
  // The new CLI is installed via npm as @github/copilot and uses the 'copilot' command
  return isCommandAvailable('copilot');
}

/**
 * Check if Cursor CLI is available
 * @returns true if cursor-agent command is available
 */
export function isCursorAvailable(): boolean {
  return isCommandAvailable('cursor-agent');
}

/**
 * Check if Claude Code CLI is available
 * @returns true if claude command is available
 */
export function isClaudeAvailable(): boolean {
  return isCommandAvailable('claude');
}

/**
 * Detect which CLI tools are available
 * @returns Object with availability status for each tool
 */
export function detectAvailableTools(): {
  codex: boolean;
  copilot: boolean;
  cursor: boolean;
  claude: boolean;
} {
  return {
    codex: isCodexAvailable(),
    copilot: isCopilotAvailable(),
    cursor: isCursorAvailable(),
    claude: isClaudeAvailable(),
  };
}
