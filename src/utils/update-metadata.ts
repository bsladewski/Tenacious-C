import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { PlanMetadata } from '../schemas/plan-metadata.schema';

/**
 * Clear open questions from metadata (before prompting user)
 * @param outputDirectory - Directory containing plan-metadata.json
 */
export function clearOpenQuestions(outputDirectory: string): void {
  const metadataPath = resolve(outputDirectory, 'plan-metadata.json');
  
  try {
    const fileContent = readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(fileContent) as PlanMetadata;
    
    // Clear open questions array
    metadata.openQuestions = [];
    
    // Write back to file
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
  } catch (error) {
    // If we can't update, that's okay - we'll continue anyway
    console.warn(`Warning: Could not clear open questions in metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
}
