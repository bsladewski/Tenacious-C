/**
 * Temporary Directory Management for Integration Tests
 *
 * Provides utilities for creating and managing temporary directories
 * that are automatically cleaned up after tests.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Creates a unique temporary directory for test isolation.
 * Returns the path to the created directory.
 */
export function createTempDir(prefix = 'tenacious-c-test-'): string {
  const tmpBase = os.tmpdir();
  const uniqueDir = fs.mkdtempSync(path.join(tmpBase, prefix));
  return uniqueDir;
}

/**
 * Removes a directory and all its contents recursively.
 */
export function removeTempDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Context object for managing a test directory lifecycle.
 */
export interface TempDirContext {
  /** Path to the temporary directory */
  path: string;
  /** Cleanup function to remove the directory */
  cleanup: () => void;
  /** Create a file in the temp directory */
  writeFile: (relativePath: string, content: string) => string;
  /** Read a file from the temp directory */
  readFile: (relativePath: string) => string;
  /** Check if a file exists in the temp directory */
  exists: (relativePath: string) => boolean;
  /** Create a subdirectory in the temp directory */
  mkdir: (relativePath: string) => string;
}

/**
 * Creates a temporary directory context with helper methods.
 */
export function createTempDirContext(prefix?: string): TempDirContext {
  const dirPath = createTempDir(prefix);

  return {
    path: dirPath,
    cleanup: () => removeTempDir(dirPath),
    writeFile: (relativePath: string, content: string): string => {
      const fullPath = path.join(dirPath, relativePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, 'utf-8');
      return fullPath;
    },
    readFile: (relativePath: string): string => {
      const fullPath = path.join(dirPath, relativePath);
      return fs.readFileSync(fullPath, 'utf-8');
    },
    exists: (relativePath: string): boolean => {
      const fullPath = path.join(dirPath, relativePath);
      return fs.existsSync(fullPath);
    },
    mkdir: (relativePath: string): string => {
      const fullPath = path.join(dirPath, relativePath);
      fs.mkdirSync(fullPath, { recursive: true });
      return fullPath;
    },
  };
}
