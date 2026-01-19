/**
 * Debug Bundle Generator (Phase 9.7)
 * Creates a zip archive containing all artifacts for debugging
 */

import { join, basename, relative } from 'path';
import { FileSystem } from '../types/file-system';
import { RunSummary } from './run-summary';
import { EffectiveConfig } from '../types/effective-config';
import { isOk } from '../types/result';

/**
 * Debug bundle manifest
 */
export interface DebugBundleManifest {
  /** Schema version */
  schemaVersion: '1.0.0';
  /** When the bundle was created */
  createdAt: string;
  /** Run ID */
  runId: string;
  /** Files included in the bundle */
  files: DebugBundleFile[];
  /** Run summary */
  runSummary?: RunSummary;
  /** Effective config (redacted) */
  config?: EffectiveConfig;
}

/**
 * File entry in the debug bundle
 */
export interface DebugBundleFile {
  /** Path within the bundle */
  path: string;
  /** Original absolute path */
  originalPath: string;
  /** File size in bytes */
  size: number;
  /** File type category */
  category: 'plan' | 'execute' | 'gap-audit' | 'gap-plan' | 'transcript' | 'config' | 'state' | 'summary';
}

/**
 * Debug bundle options
 */
export interface DebugBundleOptions {
  /** Run directory to bundle */
  runDirectory: string;
  /** Output path for the bundle */
  outputPath: string;
  /** Whether to include transcripts */
  includeTranscripts?: boolean;
  /** Run summary to include */
  runSummary?: RunSummary;
  /** Effective config to include */
  config?: EffectiveConfig;
}

/**
 * Collect files for the debug bundle
 */
export async function collectBundleFiles(
  fs: FileSystem,
  runDirectory: string,
  includeTranscripts: boolean = true
): Promise<DebugBundleFile[]> {
  const files: DebugBundleFile[] = [];

  // Helper to categorize files
  function categorize(dir: string): DebugBundleFile['category'] {
    if (dir.includes('plan') && !dir.includes('gap-plan')) return 'plan';
    if (dir.includes('execute')) return 'execute';
    if (dir.includes('gap-audit')) return 'gap-audit';
    if (dir.includes('gap-plan')) return 'gap-plan';
    if (dir.includes('transcript')) return 'transcript';
    if (dir.includes('config') || dir.endsWith('.json')) return 'config';
    return 'state';
  }

  // Recursively collect files
  async function collectDir(dir: string): Promise<void> {
    const exists = await fs.exists(dir);
    if (!exists) return;

    const entriesResult = await fs.list(dir);
    if (!isOk(entriesResult)) return;

    for (const entry of entriesResult.value) {
      const fullPath = join(dir, entry);
      const statsResult = await fs.stat(fullPath);

      if (!isOk(statsResult)) continue;
      const stats = statsResult.value;

      if (stats.isDirectory) {
        // Skip transcripts if not included
        if (!includeTranscripts && entry === 'transcripts') {
          continue;
        }
        await collectDir(fullPath);
      } else if (stats.isFile) {
        const relativePath = relative(runDirectory, fullPath);
        const category = categorize(relativePath);

        // Skip transcripts if not included
        if (!includeTranscripts && category === 'transcript') {
          continue;
        }

        files.push({
          path: relativePath,
          originalPath: fullPath,
          size: stats.size ?? 0,
          category,
        });
      }
    }
  }

  await collectDir(runDirectory);

  return files;
}

/**
 * Create a debug bundle manifest
 */
export function createBundleManifest(
  runId: string,
  files: DebugBundleFile[],
  runSummary?: RunSummary,
  config?: EffectiveConfig
): DebugBundleManifest {
  return {
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    runId,
    files,
    runSummary,
    config,
  };
}

/**
 * Format the manifest as JSON
 */
export function formatManifest(manifest: DebugBundleManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Create a simple text-based bundle (without actual zip)
 * This is useful when zip libraries are not available
 */
export async function createTextBundle(
  fs: FileSystem,
  options: DebugBundleOptions
): Promise<string> {
  const files = await collectBundleFiles(
    fs,
    options.runDirectory,
    options.includeTranscripts ?? true
  );

  const manifest = createBundleManifest(
    options.runSummary?.runId ?? basename(options.runDirectory),
    files,
    options.runSummary,
    options.config
  );

  const lines: string[] = [
    '===============================================',
    '         TENACIOUS-C DEBUG BUNDLE',
    '===============================================',
    '',
    `Run ID: ${manifest.runId}`,
    `Created: ${manifest.createdAt}`,
    `Files: ${files.length}`,
    '',
    '## Manifest',
    '',
    formatManifest(manifest),
    '',
  ];

  // Add file contents
  for (const file of files) {
    lines.push('===============================================');
    lines.push(`FILE: ${file.path}`);
    lines.push(`Category: ${file.category}`);
    lines.push(`Size: ${file.size} bytes`);
    lines.push('===============================================');
    lines.push('');

    const contentResult = await fs.readFile(file.originalPath);
    if (isOk(contentResult)) {
      lines.push(contentResult.value);
    } else {
      lines.push(`[Error reading file: ${contentResult.error.message}]`);
    }

    lines.push('');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get bundle statistics
 */
export function getBundleStats(files: DebugBundleFile[]): {
  totalFiles: number;
  totalSize: number;
  byCategory: Record<DebugBundleFile['category'], { count: number; size: number }>;
} {
  const byCategory: Record<DebugBundleFile['category'], { count: number; size: number }> = {
    plan: { count: 0, size: 0 },
    execute: { count: 0, size: 0 },
    'gap-audit': { count: 0, size: 0 },
    'gap-plan': { count: 0, size: 0 },
    transcript: { count: 0, size: 0 },
    config: { count: 0, size: 0 },
    state: { count: 0, size: 0 },
    summary: { count: 0, size: 0 },
  };

  let totalSize = 0;

  for (const file of files) {
    byCategory[file.category].count++;
    byCategory[file.category].size += file.size;
    totalSize += file.size;
  }

  return {
    totalFiles: files.length,
    totalSize,
    byCategory,
  };
}

/**
 * Format bundle stats as human-readable text
 */
export function formatBundleStats(stats: ReturnType<typeof getBundleStats>): string {
  const lines: string[] = [
    `Total files: ${stats.totalFiles}`,
    `Total size: ${formatSize(stats.totalSize)}`,
    '',
    'By category:',
  ];

  for (const [category, data] of Object.entries(stats.byCategory)) {
    if (data.count > 0) {
      lines.push(`  ${category}: ${data.count} files (${formatSize(data.size)})`);
    }
  }

  return lines.join('\n');
}

/**
 * Format size in human-readable form
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
