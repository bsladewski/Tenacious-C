import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { ExecutionState } from '../schemas/execution-state.schema';

const STATE_FILE = 'execution-state.json';

/**
 * Load execution state from a timestamp directory
 * @param timestampDirectory - The .tenacious-c/<timestamp> directory
 * @returns The execution state, or null if not found
 */
export function loadExecutionState(timestampDirectory: string): ExecutionState | null {
  const statePath = resolve(timestampDirectory, STATE_FILE);

  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const fileContent = readFileSync(statePath, 'utf-8');
    const state = JSON.parse(fileContent) as ExecutionState;
    return state;
  } catch (error) {
    console.warn(`Warning: Could not load execution state: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
