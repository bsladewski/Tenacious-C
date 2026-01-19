/**
 * IO module - filesystem abstraction for testability
 */

export { RealFileSystem, createRealFileSystem } from './real-file-system';
export { MemoryFileSystem, createMemoryFileSystem } from './memory-file-system';

// File naming utilities
export {
  ArtifactType,
  NamingContext,
  RunDirectoryStructure,
  getArtifactFilename,
  getArtifactPath,
  getRunDirectoryStructure,
  generateRunDirectoryName,
  parseRunDirectoryName,
  findNextVersion,
  getVersionedFilename,
  parseVersionedFilename,
  isValidArtifactFilename,
  getStandardArtifactPaths,
} from './file-naming';

// Execution state persistence
export { loadExecutionState } from './load-execution-state';
export { saveExecutionState } from './save-execution-state';
export { findLatestResumableRun } from './find-latest-run';

// Metadata reading
export { readPlanMetadata } from './read-metadata';
export { readExecuteMetadata } from './read-execute-metadata';
export { readGapAuditMetadata } from './read-gap-audit-metadata';
export { clearOpenQuestions } from './update-metadata';

// Artifact scanning
export {
  ExecutionArtifacts,
  GapAuditArtifacts,
  getExecutionArtifacts,
  verifyGapAuditArtifacts,
  verifyPlanFile,
} from './scan-execution-artifacts';

// Other IO utilities
export { writeRequirements } from './write-requirements';
export { trackQAHistory, readQAHistory } from './track-qa-history';
