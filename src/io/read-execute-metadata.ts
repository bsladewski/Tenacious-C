import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ExecuteMetadata } from '../schemas/execute-metadata.schema';

/**
 * Read and parse execute metadata from JSON file
 * @param outputDirectory - Directory containing execute-metadata.json
 * @returns Parsed ExecuteMetadata object
 * @throws Error if file doesn't exist or is invalid
 */
export function readExecuteMetadata(outputDirectory: string): ExecuteMetadata {
  const metadataPath = resolve(outputDirectory, 'execute-metadata.json');

  try {
    const fileContent = readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(fileContent) as ExecuteMetadata;

    // Basic validation
    if (typeof metadata.hasFollowUps !== 'boolean') {
      throw new Error('Invalid metadata: hasFollowUps must be a boolean');
    }
    if (!Array.isArray(metadata.hardBlockers)) {
      throw new Error('Invalid metadata: hardBlockers must be an array');
    }

    return metadata;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse execute-metadata.json: ${error.message}`);
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`execute-metadata.json not found in ${outputDirectory}`);
    }
    throw error;
  }
}
