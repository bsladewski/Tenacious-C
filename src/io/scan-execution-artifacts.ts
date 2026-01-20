import { readdirSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseExecuteMetadata,
  parsePlanMetadata,
  parseGapAuditMetadata,
} from '../schemas/validators';

/**
 * Result of scanning execution artifacts
 */
export interface ExecutionArtifacts {
  /**
   * Whether initial execution summary exists
   */
  initialExecutionDone: boolean;

  /**
   * Highest follow-up iteration number found (null if none)
   */
  lastFollowUpIteration: number | null;

  /**
   * Whether iteration 0 (hard blocker resolution) was done
   */
  hasDoneIteration0: boolean;

  /**
   * List of all completed follow-up iteration numbers found
   */
  allFollowUpIterations: number[];
}

/**
 * Scan execution output directory for summary files to determine progress
 * @param executeOutputDirectory - Directory containing execution summaries
 * @param executionIteration - The execution iteration number (e.g., 1, 2, 3)
 * @returns ExecutionArtifacts object with progress information
 */
export function getExecutionArtifacts(
  executeOutputDirectory: string,
  executionIteration: number
): ExecutionArtifacts {
  const result: ExecutionArtifacts = {
    initialExecutionDone: false,
    lastFollowUpIteration: null,
    hasDoneIteration0: false,
    allFollowUpIterations: [],
  };

  if (!existsSync(executeOutputDirectory)) {
    return result;
  }

  try {
    const files = readdirSync(executeOutputDirectory);

    // Check for initial execution summary
    const initialSummaryPattern = `execution-summary-${executionIteration}.md`;
    result.initialExecutionDone = files.includes(initialSummaryPattern);

    // Scan for follow-up summary files
    // Pattern: execution-summary-{executionIteration}-followup-{followUpIteration}.md
    const followUpPattern = new RegExp(`^execution-summary-${executionIteration}-followup-(\\d+)\\.md$`);

    for (const file of files) {
      const match = file.match(followUpPattern);
      if (match) {
        const followUpIteration = parseInt(match[1], 10);
        result.allFollowUpIterations.push(followUpIteration);

        // Check if iteration 0 was done
        if (followUpIteration === 0) {
          result.hasDoneIteration0 = true;
        }

        // Track highest iteration
        if (result.lastFollowUpIteration === null || followUpIteration > result.lastFollowUpIteration) {
          result.lastFollowUpIteration = followUpIteration;
        }
      }
    }

    // Sort iterations for easier debugging
    result.allFollowUpIterations.sort((a, b) => a - b);

  } catch (error) {
    // If we can't read the directory, return empty result
    // This is safe - caller will treat as no progress
    console.warn(`Warning: Could not scan execution directory ${executeOutputDirectory}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Result of verifying gap audit artifacts
 */
export interface GapAuditArtifacts {
  /**
   * Whether gap audit metadata file exists
   */
  metadataExists: boolean;

  /**
   * Whether gap audit summary markdown file exists
   */
  summaryExists: boolean;

  /**
   * Whether gap audit is truly complete (both files exist and metadata is valid)
   */
  isComplete: boolean;

  /**
   * List of validation errors (e.g., invalid JSON, schema violations)
   */
  errors: string[];
}

/**
 * Verify gap audit artifacts exist and validate JSON structure
 * @param gapAuditOutputDirectory - Directory containing gap audit artifacts
 * @param executionIteration - The execution iteration number
 * @returns GapAuditArtifacts object with verification results
 */
export function verifyGapAuditArtifacts(
  gapAuditOutputDirectory: string,
  executionIteration: number
): GapAuditArtifacts {
  const metadataPath = resolve(gapAuditOutputDirectory, 'gap-audit-metadata.json');
  const summaryPath = resolve(gapAuditOutputDirectory, `gap-audit-summary-${executionIteration}.md`);

  const metadataExists = existsSync(metadataPath);
  const summaryExists = existsSync(summaryPath);
  const errors: string[] = [];

  // Validate JSON structure if metadata file exists
  if (metadataExists) {
    try {
      const content = readFileSync(metadataPath, 'utf-8');
      const parseResult = parseGapAuditMetadata(content);
      if (!parseResult.success) {
        errors.push(
          `Invalid gap-audit-metadata.json: ${parseResult.errors?.join(', ') || 'Unknown validation error'}`
        );
      }
    } catch (error) {
      errors.push(
        `Failed to read gap-audit-metadata.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    metadataExists,
    summaryExists,
    isComplete: metadataExists && summaryExists && errors.length === 0,
    errors,
  };
}

/**
 * Verify a plan file exists at the given path
 * @param planPath - Path to the plan file (can be relative or absolute)
 * @returns Object with verification result and resolved path
 */
export function verifyPlanFile(planPath: string): { exists: boolean; resolvedPath: string } {
  const resolvedPath = resolve(planPath);
  const exists = existsSync(resolvedPath);

  return {
    exists,
    resolvedPath,
  };
}

/**
 * Result of artifact validation
 */
export interface ArtifactValidationResult {
  /**
   * Whether all required artifacts are valid
   */
  valid: boolean;

  /**
   * List of missing file paths (relative to output directory)
   */
  missing: string[];

  /**
   * List of validation errors (e.g., invalid JSON, schema violations)
   */
  errors: string[];
}

/**
 * Validate execution artifacts after CLI tool execution
 * Checks for both summary markdown and metadata JSON, and validates JSON structure
 * 
 * @param executeOutputDirectory - Directory containing execution artifacts
 * @param executionIteration - The execution iteration number (e.g., 1, 2, 3)
 * @returns ArtifactValidationResult with validation status and any issues
 */
export function validateExecutionArtifacts(
  executeOutputDirectory: string,
  executionIteration: number
): ArtifactValidationResult {
  const result: ArtifactValidationResult = {
    valid: true,
    missing: [],
    errors: [],
  };

  // Check for execution summary markdown
  const summaryFilename = `execution-summary-${executionIteration}.md`;
  const summaryPath = resolve(executeOutputDirectory, summaryFilename);
  if (!existsSync(summaryPath)) {
    result.valid = false;
    result.missing.push(summaryFilename);
  }

  // Check for execute-metadata.json
  const metadataFilename = 'execute-metadata.json';
  const metadataPath = resolve(executeOutputDirectory, metadataFilename);
  if (!existsSync(metadataPath)) {
    result.valid = false;
    result.missing.push(metadataFilename);
  } else {
    // Validate JSON structure
    try {
      const content = readFileSync(metadataPath, 'utf-8');
      const parseResult = parseExecuteMetadata(content);
      if (!parseResult.success) {
        result.valid = false;
        result.errors.push(
          `Invalid ${metadataFilename}: ${parseResult.errors?.join(', ') || 'Unknown validation error'}`
        );
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(
        `Failed to read ${metadataFilename}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Validate plan artifacts after CLI tool execution
 * Checks for both plan markdown and metadata JSON, and validates JSON structure
 * 
 * @param planOutputDirectory - Directory containing plan artifacts
 * @returns ArtifactValidationResult with validation status and any issues
 */
export function validatePlanArtifacts(planOutputDirectory: string): ArtifactValidationResult {
  const result: ArtifactValidationResult = {
    valid: true,
    missing: [],
    errors: [],
  };

  // Check for plan.md
  const planFilename = 'plan.md';
  const planPath = resolve(planOutputDirectory, planFilename);
  if (!existsSync(planPath)) {
    result.valid = false;
    result.missing.push(planFilename);
  }

  // Check for plan-metadata.json
  const metadataFilename = 'plan-metadata.json';
  const metadataPath = resolve(planOutputDirectory, metadataFilename);
  if (!existsSync(metadataPath)) {
    result.valid = false;
    result.missing.push(metadataFilename);
  } else {
    // Validate JSON structure
    try {
      const content = readFileSync(metadataPath, 'utf-8');
      const parseResult = parsePlanMetadata(content);
      if (!parseResult.success) {
        result.valid = false;
        result.errors.push(
          `Invalid ${metadataFilename}: ${parseResult.errors?.join(', ') || 'Unknown validation error'}`
        );
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(
        `Failed to read ${metadataFilename}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Validate gap audit artifacts after CLI tool execution
 * Enhanced version that validates JSON structure in addition to file existence
 * 
 * @param gapAuditOutputDirectory - Directory containing gap audit artifacts
 * @param executionIteration - The execution iteration number
 * @returns ArtifactValidationResult with validation status and any issues
 */
export function validateGapAuditArtifacts(
  gapAuditOutputDirectory: string,
  executionIteration: number
): ArtifactValidationResult {
  const result: ArtifactValidationResult = {
    valid: true,
    missing: [],
    errors: [],
  };

  // Check for gap-audit-summary-{executionIteration}.md
  const summaryFilename = `gap-audit-summary-${executionIteration}.md`;
  const summaryPath = resolve(gapAuditOutputDirectory, summaryFilename);
  if (!existsSync(summaryPath)) {
    result.valid = false;
    result.missing.push(summaryFilename);
  }

  // Check for gap-audit-metadata.json
  const metadataFilename = 'gap-audit-metadata.json';
  const metadataPath = resolve(gapAuditOutputDirectory, metadataFilename);
  if (!existsSync(metadataPath)) {
    result.valid = false;
    result.missing.push(metadataFilename);
  } else {
    // Validate JSON structure
    try {
      const content = readFileSync(metadataPath, 'utf-8');
      const parseResult = parseGapAuditMetadata(content);
      if (!parseResult.success) {
        result.valid = false;
        result.errors.push(
          `Invalid ${metadataFilename}: ${parseResult.errors?.join(', ') || 'Unknown validation error'}`
        );
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(
        `Failed to read ${metadataFilename}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}
