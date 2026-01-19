/**
 * FileSystem interface (F5, F30)
 * Abstracts filesystem operations for testability
 */

import { Result } from './result';

/**
 * Options for writing files
 */
export interface WriteOptions {
  /** File encoding (default: 'utf-8') */
  encoding?: BufferEncoding;
  /** Whether to use atomic writes (write to temp, then rename) */
  atomic?: boolean;
  /** Create parent directories if they don't exist */
  createParents?: boolean;
}

/**
 * Options for reading files
 */
export interface ReadOptions {
  /** File encoding (default: 'utf-8') */
  encoding?: BufferEncoding;
}

/**
 * Options for listing directories
 */
export interface ListOptions {
  /** Whether to include subdirectories recursively */
  recursive?: boolean;
  /** Filter pattern (glob-style) */
  pattern?: string;
}

/**
 * File statistics
 */
export interface FileStats {
  /** Size in bytes */
  size: number;
  /** Whether it's a file */
  isFile: boolean;
  /** Whether it's a directory */
  isDirectory: boolean;
  /** Creation time */
  createdAt: Date;
  /** Last modified time */
  modifiedAt: Date;
}

/**
 * Error types for filesystem operations
 */
export type FileSystemErrorCode =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'ALREADY_EXISTS'
  | 'NOT_A_FILE'
  | 'NOT_A_DIRECTORY'
  | 'PATH_TRAVERSAL'
  | 'IO_ERROR';

/**
 * Filesystem operation error
 */
export interface FileSystemError {
  code: FileSystemErrorCode;
  message: string;
  path: string;
  cause?: Error;
}

/**
 * Interface for filesystem operations
 * Implementations can be real (Node.js fs) or mock (in-memory for testing)
 */
export interface FileSystem {
  /**
   * Read a file's contents as a string
   */
  readFile(path: string, options?: ReadOptions): Promise<Result<string, FileSystemError>>;

  /**
   * Write content to a file
   */
  writeFile(
    path: string,
    content: string,
    options?: WriteOptions
  ): Promise<Result<void, FileSystemError>>;

  /**
   * Check if a file or directory exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file statistics
   */
  stat(path: string): Promise<Result<FileStats, FileSystemError>>;

  /**
   * Create a directory (and optionally parents)
   */
  mkdir(path: string, recursive?: boolean): Promise<Result<void, FileSystemError>>;

  /**
   * Remove a file
   */
  remove(path: string): Promise<Result<void, FileSystemError>>;

  /**
   * Remove a directory (optionally recursive)
   */
  rmdir(path: string, recursive?: boolean): Promise<Result<void, FileSystemError>>;

  /**
   * List directory contents
   */
  list(path: string, options?: ListOptions): Promise<Result<string[], FileSystemError>>;

  /**
   * Copy a file
   */
  copy(src: string, dest: string): Promise<Result<void, FileSystemError>>;

  /**
   * Rename/move a file or directory
   */
  rename(oldPath: string, newPath: string): Promise<Result<void, FileSystemError>>;

  /**
   * Resolve a path to absolute form
   */
  resolve(...paths: string[]): string;

  /**
   * Join path segments
   */
  join(...paths: string[]): string;

  /**
   * Get directory name from a path
   */
  dirname(path: string): string;

  /**
   * Get the base name from a path
   */
  basename(path: string, ext?: string): string;

  /**
   * Get the file extension
   */
  extname(path: string): string;

  /**
   * Check if a path is absolute
   */
  isAbsolute(path: string): boolean;
}

/**
 * Create a FileSystemError
 */
export function createFileSystemError(
  code: FileSystemErrorCode,
  path: string,
  message?: string,
  cause?: Error
): FileSystemError {
  const defaultMessages: Record<FileSystemErrorCode, string> = {
    NOT_FOUND: `Path not found: ${path}`,
    PERMISSION_DENIED: `Permission denied: ${path}`,
    ALREADY_EXISTS: `Path already exists: ${path}`,
    NOT_A_FILE: `Not a file: ${path}`,
    NOT_A_DIRECTORY: `Not a directory: ${path}`,
    PATH_TRAVERSAL: `Path traversal detected: ${path}`,
    IO_ERROR: `IO error: ${path}`,
  };

  return {
    code,
    path,
    message: message ?? defaultMessages[code],
    cause,
  };
}
