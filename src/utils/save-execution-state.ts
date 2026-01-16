import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { ExecutionState } from '../schemas/execution-state.schema';

const STATE_FILE = 'execution-state.json';

/**
 * Save execution state to allow resuming later
 * @param timestampDirectory - The .tenacious-c/<timestamp> directory
 * @param state - The execution state to save
 */
export function saveExecutionState(timestampDirectory: string, state: ExecutionState): void {
  const statePath = resolve(timestampDirectory, STATE_FILE);
  
  // Update last saved timestamp
  state.lastSaved = new Date().toISOString();
  
  try {
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  } catch (error) {
    console.warn(`Warning: Could not save execution state: ${error instanceof Error ? error.message : String(error)}`);
  }
}
