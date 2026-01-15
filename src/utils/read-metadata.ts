import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PlanMetadata } from '../schemas/plan-metadata.schema';

/**
 * Read and parse plan metadata from JSON file
 * @param outputDirectory - Directory containing plan-metadata.json
 * @returns Parsed PlanMetadata object
 * @throws Error if file doesn't exist or is invalid
 */
export function readPlanMetadata(outputDirectory: string): PlanMetadata {
  const metadataPath = resolve(outputDirectory, 'plan-metadata.json');
  
  try {
    const fileContent = readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(fileContent) as PlanMetadata;
    
    // Basic validation
    if (typeof metadata.confidence !== 'number') {
      throw new Error('Invalid metadata: confidence must be a number');
    }
    if (!Array.isArray(metadata.openQuestions)) {
      throw new Error('Invalid metadata: openQuestions must be an array');
    }
    
    return metadata;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse plan-metadata.json: ${error.message}`);
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`plan-metadata.json not found in ${outputDirectory}`);
    }
    throw error;
  }
}
