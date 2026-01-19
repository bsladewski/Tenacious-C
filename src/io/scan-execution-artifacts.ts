import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

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
   * Whether gap audit is truly complete (both files exist)
   */
  isComplete: boolean;
}

/**
 * Verify gap audit artifacts exist
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

  return {
    metadataExists,
    summaryExists,
    isComplete: metadataExists && summaryExists,
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
