import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PREFERENCE_FILE = 'cli-tool-preference.json';
const TENACIOUS_C_DIR = '.tenacious-c';

export type CliToolType = 'codex' | 'copilot' | 'cursor' | 'claude' | 'mock';

interface CliToolPreference {
  tool: CliToolType;
}

/**
 * Get the path to the preference file
 */
function getPreferenceFilePath(): string {
  const tenaciousCDir = resolve(process.cwd(), TENACIOUS_C_DIR);
  return resolve(tenaciousCDir, PREFERENCE_FILE);
}

/**
 * Load the user's CLI tool preference
 * @returns The preferred tool type, or null if no preference is set
 */
export function loadCliToolPreference(): CliToolType | null {
  const preferencePath = getPreferenceFilePath();

  if (!existsSync(preferencePath)) {
    return null;
  }

  try {
    const fileContent = readFileSync(preferencePath, 'utf-8');
    const preference = JSON.parse(fileContent) as CliToolPreference;

    if (preference.tool === 'codex' || preference.tool === 'copilot' || preference.tool === 'cursor' || preference.tool === 'claude') {
      return preference.tool;
    }

    return null;
  } catch {
    // If we can't read or parse the preference file, return null
    return null;
  }
}

/**
 * Save the user's CLI tool preference
 * @param tool - The tool type to save as preference
 */
export function saveCliToolPreference(tool: CliToolType): void {
  const tenaciousCDir = resolve(process.cwd(), TENACIOUS_C_DIR);

  // Ensure .tenacious-c directory exists
  mkdirSync(tenaciousCDir, { recursive: true });

  const preferencePath = getPreferenceFilePath();
  const preference: CliToolPreference = { tool };

  try {
    writeFileSync(preferencePath, JSON.stringify(preference, null, 2) + '\n', 'utf-8');
  } catch (error) {
    console.warn(`Warning: Could not save CLI tool preference: ${error instanceof Error ? error.message : String(error)}`);
  }
}
