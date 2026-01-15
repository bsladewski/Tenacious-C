import inquirer from 'inquirer';
import { HardBlocker } from '../schemas/execute-metadata.schema';

/**
 * Prompt user to provide resolution input for hard blockers
 * @param hardBlockers - Array of hard blockers that need resolution
 * @returns Map of blocker description to user's resolution input
 */
export async function promptForHardBlockerResolution(
  hardBlockers: HardBlocker[]
): Promise<Map<string, string>> {
  const resolutions = new Map<string, string>();

  for (const blocker of hardBlockers) {
    console.log(`\n🚫 Hard Blocker Detected:`);
    console.log(`   Description: ${blocker.description}`);
    console.log(`   Reason: ${blocker.reason}\n`);

    const response = await inquirer.prompt([
      {
        type: 'input',
        name: 'resolution',
        message: 'Please provide input to resolve this blocker (e.g., credentials, commands to run, configuration changes):',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please provide resolution input';
          }
          return true;
        },
      },
    ]);

    resolutions.set(blocker.description, response.resolution);
  }

  return resolutions;
}

/**
 * Format hard blocker resolutions as a string for the template
 * @param hardBlockers - Array of hard blockers
 * @param resolutions - Map of blocker description to resolution
 * @returns Formatted string with blocker info and resolutions
 */
export function formatHardBlockerResolutions(
  hardBlockers: HardBlocker[],
  resolutions: Map<string, string>
): string {
  const lines: string[] = [];
  lines.push('## Hard Blocker Resolutions');
  lines.push('');
  lines.push('The following hard blockers were encountered and have been resolved with user input:');
  lines.push('');

  for (const blocker of hardBlockers) {
    const resolution = resolutions.get(blocker.description) || '';
    lines.push(`### Blocker: ${blocker.description}`);
    lines.push(`**Reason:** ${blocker.reason}`);
    lines.push(`**User Resolution:** ${resolution}`);
    lines.push('');
  }

  lines.push('**Important:** Use the user-provided resolutions above to address these blockers and continue execution.');
  lines.push('After resolving the blockers, add a follow-up to the execution summary to continue with the remaining work.');

  return lines.join('\n');
}
