/**
 * Deterministic File Naming (Phase 6.5)
 * Provides predictable artifact naming with version increments
 */

import { join, basename, extname } from 'path';

/**
 * Artifact types that follow naming conventions
 */
export type ArtifactType =
  | 'plan'
  | 'plan-metadata'
  | 'tool-curation-report'
  | 'tool-curation-metadata'
  | 'execution-summary'
  | 'execute-metadata'
  | 'gap-audit-summary'
  | 'gap-audit-metadata'
  | 'gap-plan'
  | 'requirements'
  | 'effective-config'
  | 'run-summary'
  | 'transcript-stdout'
  | 'transcript-stderr'
  | 'debug-bundle';

/**
 * Iteration context for file naming
 */
export interface NamingContext {
  /** Execution iteration (1-indexed, for execution/gap-audit/gap-plan) */
  execIteration?: number;
  /** Follow-up iteration within execution (0-indexed) */
  followUpIteration?: number;
  /** Plan revision number */
  planRevision?: number;
  /** Engine name for transcripts */
  engineName?: string;
  /** Timestamp for uniqueness */
  timestamp?: string;
}

/**
 * File naming patterns for each artifact type
 */
const ARTIFACT_PATTERNS: Record<ArtifactType, (ctx: NamingContext) => string> = {
  plan: () => 'plan.md',
  'plan-metadata': () => 'plan-metadata.json',
  'tool-curation-report': () => 'tool-curation-report.md',
  'tool-curation-metadata': () => 'tool-curation-metadata.json',
  'execution-summary': (ctx) => {
    const base = `execution-summary-${ctx.execIteration ?? 1}`;
    if (ctx.followUpIteration !== undefined && ctx.followUpIteration >= 0) {
      return `${base}-followup-${ctx.followUpIteration}.md`;
    }
    return `${base}.md`;
  },
  'execute-metadata': () => 'execute-metadata.json',
  'gap-audit-summary': (ctx) => `gap-audit-summary-${ctx.execIteration ?? 1}.md`,
  'gap-audit-metadata': () => 'gap-audit-metadata.json',
  'gap-plan': (ctx) => `gap-plan-${ctx.execIteration ?? 1}.md`,
  requirements: () => 'requirements.txt',
  'effective-config': () => 'effective-config.json',
  'run-summary': () => 'run-summary.md',
  'transcript-stdout': (ctx) => {
    const engine = ctx.engineName ?? 'engine';
    const ts = ctx.timestamp ?? new Date().toISOString().replace(/[:.]/g, '-');
    return `${engine}-stdout-${ts}.log`;
  },
  'transcript-stderr': (ctx) => {
    const engine = ctx.engineName ?? 'engine';
    const ts = ctx.timestamp ?? new Date().toISOString().replace(/[:.]/g, '-');
    return `${engine}-stderr-${ts}.log`;
  },
  'debug-bundle': (ctx) => {
    const ts = ctx.timestamp ?? new Date().toISOString().replace(/[:.]/g, '-');
    return `debug-bundle-${ts}.zip`;
  },
};

/**
 * Get the filename for an artifact type
 */
export function getArtifactFilename(type: ArtifactType, context: NamingContext = {}): string {
  const pattern = ARTIFACT_PATTERNS[type];
  return pattern(context);
}

/**
 * Get the full path for an artifact within a directory
 */
export function getArtifactPath(
  baseDir: string,
  type: ArtifactType,
  context: NamingContext = {}
): string {
  return join(baseDir, getArtifactFilename(type, context));
}

/**
 * Directory structure for a run
 */
export interface RunDirectoryStructure {
  /** Root run directory (.tenacious-c/<timestamp>) */
  root: string;
  /** Plan output directory */
  plan: string;
  /** Tool curation output directory */
  toolCuration: string;
  /** Execute output directory (initial) */
  execute: string;
  /** Execute output directory for a specific iteration */
  executeN: (n: number) => string;
  /** Gap audit output directory (initial) */
  gapAudit: string;
  /** Gap audit output directory for a specific iteration */
  gapAuditN: (n: number) => string;
  /** Gap plan output directory (initial) */
  gapPlan: string;
  /** Gap plan output directory for a specific iteration */
  gapPlanN: (n: number) => string;
  /** Transcript output directory */
  transcripts: string;
}

/**
 * Get the directory structure for a run
 */
export function getRunDirectoryStructure(rootDir: string): RunDirectoryStructure {
  return {
    root: rootDir,
    plan: join(rootDir, 'plan'),
    toolCuration: join(rootDir, 'tool-curation'),
    execute: join(rootDir, 'execute'),
    executeN: (n: number) => (n === 1 ? join(rootDir, 'execute') : join(rootDir, `execute-${n}`)),
    gapAudit: join(rootDir, 'gap-audit'),
    gapAuditN: (n: number) =>
      n === 1 ? join(rootDir, 'gap-audit') : join(rootDir, `gap-audit-${n}`),
    gapPlan: join(rootDir, 'gap-plan'),
    gapPlanN: (n: number) => (n === 1 ? join(rootDir, 'gap-plan') : join(rootDir, `gap-plan-${n}`)),
    transcripts: join(rootDir, 'transcripts'),
  };
}

/**
 * Generate a timestamp-based run directory name
 */
export function generateRunDirectoryName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
}

/**
 * Parse a run directory name back to a Date
 */
export function parseRunDirectoryName(name: string): Date | null {
  // Format: YYYY-MM-DD_HH-MM-SS-sssZ
  const match = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{3})Z?$/);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second, ms] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`);
}

/**
 * Find the next available version number for a file
 * E.g., if plan-v1.md exists, returns 2
 */
export function findNextVersion(
  existingFiles: string[],
  baseName: string,
  extension: string
): number {
  const pattern = new RegExp(`^${escapeRegex(baseName)}-v(\\d+)${escapeRegex(extension)}$`);
  let maxVersion = 0;

  for (const file of existingFiles) {
    const name = basename(file);
    const match = name.match(pattern);
    if (match) {
      const version = parseInt(match[1], 10);
      if (version > maxVersion) {
        maxVersion = version;
      }
    }
  }

  return maxVersion + 1;
}

/**
 * Generate a versioned filename
 * E.g., plan-v1.md, plan-v2.md
 */
export function getVersionedFilename(baseName: string, version: number, extension: string): string {
  return `${baseName}-v${version}${extension}`;
}

/**
 * Parse a versioned filename
 */
export function parseVersionedFilename(
  filename: string
): { baseName: string; version: number; extension: string } | null {
  const ext = extname(filename);
  const nameWithoutExt = basename(filename, ext);
  const match = nameWithoutExt.match(/^(.+)-v(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    baseName: match[1],
    version: parseInt(match[2], 10),
    extension: ext,
  };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate an artifact filename against expected pattern
 */
export function isValidArtifactFilename(filename: string, type: ArtifactType): boolean {
  const expected = getArtifactFilename(type, {});
  // For types that include context (iteration numbers), do a prefix check
  if (type === 'execution-summary' || type === 'gap-audit-summary' || type === 'gap-plan') {
    const prefix = expected.replace(/\d+/, '\\d+').replace('.', '\\.');
    return new RegExp(`^${prefix}$`).test(filename);
  }
  return filename === expected;
}

/**
 * Get all standard artifact paths for a run directory
 */
export function getStandardArtifactPaths(
  runDir: string,
  execIteration: number = 1,
  followUpIteration?: number
): Record<ArtifactType, string> {
  const dirs = getRunDirectoryStructure(runDir);
  const ctx: NamingContext = {
    execIteration,
    followUpIteration,
  };

  return {
    plan: getArtifactPath(dirs.plan, 'plan'),
    'plan-metadata': getArtifactPath(dirs.plan, 'plan-metadata'),
    'tool-curation-report': getArtifactPath(dirs.toolCuration, 'tool-curation-report'),
    'tool-curation-metadata': getArtifactPath(dirs.toolCuration, 'tool-curation-metadata'),
    'execution-summary': getArtifactPath(dirs.executeN(execIteration), 'execution-summary', ctx),
    'execute-metadata': getArtifactPath(dirs.executeN(execIteration), 'execute-metadata'),
    'gap-audit-summary': getArtifactPath(dirs.gapAuditN(execIteration), 'gap-audit-summary', ctx),
    'gap-audit-metadata': getArtifactPath(dirs.gapAuditN(execIteration), 'gap-audit-metadata'),
    'gap-plan': getArtifactPath(dirs.gapPlanN(execIteration), 'gap-plan', ctx),
    requirements: join(runDir, getArtifactFilename('requirements')),
    'effective-config': join(runDir, getArtifactFilename('effective-config')),
    'run-summary': join(runDir, getArtifactFilename('run-summary')),
    'transcript-stdout': getArtifactPath(dirs.transcripts, 'transcript-stdout', ctx),
    'transcript-stderr': getArtifactPath(dirs.transcripts, 'transcript-stderr', ctx),
    'debug-bundle': join(runDir, getArtifactFilename('debug-bundle', ctx)),
  };
}
