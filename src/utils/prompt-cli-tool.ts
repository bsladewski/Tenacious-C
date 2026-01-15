import inquirer from 'inquirer';
import { CliToolType } from './cli-tool-preference';

/**
 * Prompt user to select a CLI tool when multiple are available
 * @param availableTools - Object indicating which tools are available
 * @returns The selected tool type
 */
export async function promptForCliTool(availableTools: {
  codex: boolean;
  copilot: boolean;
  cursor: boolean;
}): Promise<CliToolType> {
  const choices = [];
  
  if (availableTools.codex) {
    choices.push({
      name: 'Codex',
      value: 'codex' as CliToolType,
    });
  }
  
  if (availableTools.copilot) {
    choices.push({
      name: 'GitHub Copilot',
      value: 'copilot' as CliToolType,
    });
  }
  
  if (availableTools.cursor) {
    choices.push({
      name: 'Cursor',
      value: 'cursor' as CliToolType,
    });
  }
  
  if (choices.length === 0) {
    throw new Error('No CLI tools are available. Please install Codex CLI or GitHub Copilot CLI.');
  }
  
  if (choices.length === 1) {
    // Only one option, return it without prompting
    return choices[0].value;
  }
  
  // Multiple options, prompt user to select
  const response = await inquirer.prompt([
    {
      type: 'select',
      name: 'tool',
      message: 'Multiple CLI tools are available. Which one would you like to use?',
      choices: choices,
      default: 0,
    },
  ]);
  
  return response.tool as CliToolType;
}
