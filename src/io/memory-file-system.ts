/**
 * In-memory FileSystem implementation (F30)
 * For testing - maintains virtual filesystem in memory
 */

import {
  resolve,
  join,
  dirname,
  basename,
  extname,
  isAbsolute,
  sep,
} from 'path';
import {
  FileSystem,
  FileStats,
  WriteOptions,
  ReadOptions,
  ListOptions,
  FileSystemError,
  createFileSystemError,
} from '../types/file-system';
import { Result, ok, err } from '../types/result';

/**
 * Virtual file entry
 */
interface VirtualFile {
  type: 'file';
  content: string;
  createdAt: Date;
  modifiedAt: Date;
}

/**
 * Virtual directory entry
 */
interface VirtualDirectory {
  type: 'directory';
  createdAt: Date;
  modifiedAt: Date;
}

type VirtualEntry = VirtualFile | VirtualDirectory;

/**
 * In-memory implementation of FileSystem for testing
 */
export class MemoryFileSystem implements FileSystem {
  private entries: Map<string, VirtualEntry> = new Map();
  private readonly basePath: string;

  constructor(basePath: string = '/') {
    this.basePath = basePath;
    // Create root directory
    this.entries.set(this.normalizePath(basePath), {
      type: 'directory',
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
  }

  /**
   * Normalize a path for internal storage
   */
  private normalizePath(path: string): string {
    // Convert to absolute path relative to basePath
    let normalized = isAbsolute(path) ? path : join(this.basePath, path);
    // Normalize separators and resolve . and ..
    normalized = resolve(normalized);
    return normalized;
  }

  /**
   * Get all parent directories of a path
   */
  private getParentDirs(path: string): string[] {
    const dirs: string[] = [];
    let current = dirname(path);
    while (current !== path && current !== dirname(current)) {
      dirs.push(current);
      path = current;
      current = dirname(current);
    }
    return dirs;
  }

  async readFile(
    path: string,
    _options?: ReadOptions
  ): Promise<Result<string, FileSystemError>> {
    const normalizedPath = this.normalizePath(path);
    const entry = this.entries.get(normalizedPath);

    if (!entry) {
      return err(createFileSystemError('NOT_FOUND', path));
    }

    if (entry.type === 'directory') {
      return err(createFileSystemError('NOT_A_FILE', path));
    }

    return ok(entry.content);
  }

  async writeFile(
    path: string,
    content: string,
    options?: WriteOptions
  ): Promise<Result<void, FileSystemError>> {
    const normalizedPath = this.normalizePath(path);
    const parentDir = dirname(normalizedPath);

    // Check if parent directory exists
    const parentEntry = this.entries.get(parentDir);
    if (!parentEntry) {
      if (options?.createParents) {
        // Create parent directories
        const mkdirResult = await this.mkdir(parentDir, true);
        if (!mkdirResult.ok) {
          return mkdirResult;
        }
      } else {
        return err(
          createFileSystemError('NOT_FOUND', parentDir, 'Parent directory does not exist')
        );
      }
    } else if (parentEntry.type !== 'directory') {
      return err(createFileSystemError('NOT_A_DIRECTORY', parentDir));
    }

    // Check if entry already exists and is a directory
    const existingEntry = this.entries.get(normalizedPath);
    if (existingEntry?.type === 'directory') {
      return err(createFileSystemError('NOT_A_FILE', path));
    }

    const now = new Date();
    this.entries.set(normalizedPath, {
      type: 'file',
      content,
      createdAt: existingEntry?.createdAt ?? now,
      modifiedAt: now,
    });

    return ok(undefined);
  }

  async exists(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path);
    return this.entries.has(normalizedPath);
  }

  async stat(path: string): Promise<Result<FileStats, FileSystemError>> {
    const normalizedPath = this.normalizePath(path);
    const entry = this.entries.get(normalizedPath);

    if (!entry) {
      return err(createFileSystemError('NOT_FOUND', path));
    }

    return ok({
      size: entry.type === 'file' ? entry.content.length : 0,
      isFile: entry.type === 'file',
      isDirectory: entry.type === 'directory',
      createdAt: entry.createdAt,
      modifiedAt: entry.modifiedAt,
    });
  }

  async mkdir(
    path: string,
    recursive?: boolean
  ): Promise<Result<void, FileSystemError>> {
    const normalizedPath = this.normalizePath(path);

    // Check if already exists
    const existingEntry = this.entries.get(normalizedPath);
    if (existingEntry) {
      if (existingEntry.type === 'directory') {
        return ok(undefined); // Directory already exists
      }
      return err(createFileSystemError('NOT_A_DIRECTORY', path));
    }

    // Check parent directory
    const parentDir = dirname(normalizedPath);
    if (parentDir !== normalizedPath) {
      const parentEntry = this.entries.get(parentDir);
      if (!parentEntry) {
        if (recursive) {
          const mkdirResult = await this.mkdir(parentDir, true);
          if (!mkdirResult.ok) {
            return mkdirResult;
          }
        } else {
          return err(
            createFileSystemError('NOT_FOUND', parentDir, 'Parent directory does not exist')
          );
        }
      } else if (parentEntry.type !== 'directory') {
        return err(createFileSystemError('NOT_A_DIRECTORY', parentDir));
      }
    }

    const now = new Date();
    this.entries.set(normalizedPath, {
      type: 'directory',
      createdAt: now,
      modifiedAt: now,
    });

    return ok(undefined);
  }

  async remove(path: string): Promise<Result<void, FileSystemError>> {
    const normalizedPath = this.normalizePath(path);
    const entry = this.entries.get(normalizedPath);

    if (!entry) {
      return err(createFileSystemError('NOT_FOUND', path));
    }

    if (entry.type === 'directory') {
      return err(createFileSystemError('NOT_A_FILE', path));
    }

    this.entries.delete(normalizedPath);
    return ok(undefined);
  }

  async rmdir(
    path: string,
    recursive?: boolean
  ): Promise<Result<void, FileSystemError>> {
    const normalizedPath = this.normalizePath(path);
    const entry = this.entries.get(normalizedPath);

    if (!entry) {
      return err(createFileSystemError('NOT_FOUND', path));
    }

    if (entry.type !== 'directory') {
      return err(createFileSystemError('NOT_A_DIRECTORY', path));
    }

    // Check if directory has children
    const prefix = normalizedPath + sep;
    const children = Array.from(this.entries.keys()).filter(
      (p) => p.startsWith(prefix) && p !== normalizedPath
    );

    if (children.length > 0) {
      if (recursive) {
        // Delete all children
        for (const child of children) {
          this.entries.delete(child);
        }
      } else {
        return err(
          createFileSystemError('IO_ERROR', path, 'Directory not empty')
        );
      }
    }

    this.entries.delete(normalizedPath);
    return ok(undefined);
  }

  async list(
    path: string,
    options?: ListOptions
  ): Promise<Result<string[], FileSystemError>> {
    const normalizedPath = this.normalizePath(path);
    const entry = this.entries.get(normalizedPath);

    if (!entry) {
      return err(createFileSystemError('NOT_FOUND', path));
    }

    if (entry.type !== 'directory') {
      return err(createFileSystemError('NOT_A_DIRECTORY', path));
    }

    const prefix = normalizedPath === '/' ? '/' : normalizedPath + sep;
    let files: string[] = [];

    for (const entryPath of this.entries.keys()) {
      if (entryPath.startsWith(prefix) && entryPath !== normalizedPath) {
        const relativePath = entryPath.slice(prefix.length);
        const isDirectChild = !relativePath.includes(sep);

        if (options?.recursive || isDirectChild) {
          files.push(relativePath);
        }
      }
    }

    // Apply pattern filter if specified
    if (options?.pattern) {
      const pattern = this.globToRegex(options.pattern);
      files = files.filter((f) => pattern.test(f));
    }

    return ok(files);
  }

  async copy(src: string, dest: string): Promise<Result<void, FileSystemError>> {
    const readResult = await this.readFile(src);
    if (!readResult.ok) {
      return readResult;
    }

    return this.writeFile(dest, readResult.value);
  }

  async rename(
    oldPath: string,
    newPath: string
  ): Promise<Result<void, FileSystemError>> {
    const normalizedOld = this.normalizePath(oldPath);
    const normalizedNew = this.normalizePath(newPath);

    const entry = this.entries.get(normalizedOld);
    if (!entry) {
      return err(createFileSystemError('NOT_FOUND', oldPath));
    }

    // Check if destination parent exists
    const destParent = dirname(normalizedNew);
    const destParentEntry = this.entries.get(destParent);
    if (!destParentEntry || destParentEntry.type !== 'directory') {
      return err(
        createFileSystemError('NOT_FOUND', destParent, 'Parent directory does not exist')
      );
    }

    this.entries.set(normalizedNew, entry);
    this.entries.delete(normalizedOld);

    return ok(undefined);
  }

  resolve(...paths: string[]): string {
    return resolve(this.basePath, ...paths);
  }

  join(...paths: string[]): string {
    return join(...paths);
  }

  dirname(path: string): string {
    return dirname(path);
  }

  basename(path: string, ext?: string): string {
    return basename(path, ext);
  }

  extname(path: string): string {
    return extname(path);
  }

  isAbsolute(path: string): boolean {
    return isAbsolute(path);
  }

  /**
   * Convert a glob pattern to a regex
   */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Get all entries (for debugging/testing)
   */
  getAllEntries(): Map<string, VirtualEntry> {
    return new Map(this.entries);
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.entries.clear();
    // Recreate root directory
    this.entries.set(this.normalizePath(this.basePath), {
      type: 'directory',
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
  }
}

/**
 * Create an in-memory filesystem for testing
 */
export function createMemoryFileSystem(basePath?: string): MemoryFileSystem {
  return new MemoryFileSystem(basePath);
}
