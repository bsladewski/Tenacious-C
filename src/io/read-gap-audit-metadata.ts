import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GapAuditMetadata } from '../schemas/gap-audit-metadata.schema';

/**
 * Read and parse gap audit metadata from JSON file
 * @param outputDirectory - Directory containing gap-audit-metadata.json
 * @returns Parsed GapAuditMetadata object
 * @throws Error if file doesn't exist or is invalid
 */
export function readGapAuditMetadata(outputDirectory: string): GapAuditMetadata {
  const metadataPath = resolve(outputDirectory, 'gap-audit-metadata.json');

  try {
    const fileContent = readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(fileContent) as GapAuditMetadata;

    // Basic validation
    if (typeof metadata.gapsIdentified !== 'boolean') {
      throw new Error('Invalid metadata: gapsIdentified must be a boolean');
    }

    return metadata;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse gap-audit-metadata.json: ${error.message}`);
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`gap-audit-metadata.json not found in ${outputDirectory}`);
    }
    throw error;
  }
}
