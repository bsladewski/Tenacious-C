import { readdirSync, statSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadExecutionState } from './load-execution-state';
import { ExecutionState } from '../schemas/execution-state.schema';

/**
 * Find the most recent run that can be resumed
 * @param tenaciousCDir - The .tenacious-c directory path
 * @returns The execution state of the most recent run, or null if none found
 */
export function findLatestResumableRun(tenaciousCDir: string): ExecutionState | null {
  if (!existsSync(tenaciousCDir)) {
    return null;
  }

  try {
    const entries = readdirSync(tenaciousCDir, { withFileTypes: true });

    // Filter to only directories (timestamp directories)
    const timestampDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: resolve(tenaciousCDir, entry.name),
        mtime: statSync(resolve(tenaciousCDir, entry.name)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Most recent first

    // Check each directory for a resumable state
    for (const dir of timestampDirs) {
      const state = loadExecutionState(dir.path);
      if (state && state.phase !== 'complete') {
        return state;
      }
    }

    return null;
  } catch (error) {
    console.warn(`Warning: Could not find latest run: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
