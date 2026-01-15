import { writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Write the original requirements to a file in the timestamp directory
 * @param timestampDirectory - The timestamp directory (.tenacious-c/<timestamp>)
 * @param requirements - The requirements string to store
 */
export function writeRequirements(timestampDirectory: string, requirements: string): void {
  const requirementsPath = resolve(timestampDirectory, 'requirements.txt');
  
  try {
    writeFileSync(requirementsPath, requirements, 'utf-8');
  } catch (error) {
    console.warn(`Warning: Could not write requirements.txt: ${error instanceof Error ? error.message : String(error)}`);
  }
}
