import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ToolCurationMetadata } from '../schemas/tool-curation-metadata.schema';

/**
 * Read and parse tool curation metadata from JSON file
 * @param outputDirectory - Directory containing tool-curation-metadata.json
 * @returns Parsed ToolCurationMetadata object
 * @throws Error if file doesn't exist or is invalid
 */
export function readToolCurationMetadata(outputDirectory: string): ToolCurationMetadata {
  const metadataPath = resolve(outputDirectory, 'tool-curation-metadata.json');

  try {
    const fileContent = readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(fileContent) as ToolCurationMetadata;

    // Basic validation
    if (typeof metadata.summary !== 'string') {
      throw new Error('Invalid metadata: summary must be a string');
    }

    return metadata;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse tool-curation-metadata.json: ${error.message}`);
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`tool-curation-metadata.json not found in ${outputDirectory}`);
    }
    throw error;
  }
}
