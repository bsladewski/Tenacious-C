/**
 * Real FileSystem implementation (F5, F19, F26)
 * Uses Node.js fs module with atomic writes and path traversal protection
 */

import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  stat as fsStat,
  mkdir as fsMkdir,
  unlink as fsUnlink,
  rmdir as fsRmdir,
  readdir as fsReaddir,
  copyFile as fsCopyFile,
  rename as fsRename,
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { promisify } from 'util';
import {
  resolve,
  join,
  dirname,
  basename,
  extname,
  isAbsolute,
  relative,
} from 'path';
import { randomBytes } from 'crypto';
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

// Promisified versions
const readFileAsync = promisify(fsReadFile);
const writeFileAsync = promisify(fsWriteFile);
const statAsync = promisify(fsStat);
const mkdirAsync = promisify(fsMkdir);
const unlinkAsync = promisify(fsUnlink);
const rmdirAsync = promisify(fsRmdir);
const readdirAsync = promisify(fsReaddir);
const copyFileAsync = promisify(fsCopyFile);
const renameAsync = promisify(fsRename);

/**
 * Real implementation of FileSystem using Node.js fs
 */
export class RealFileSystem implements FileSystem {
  private readonly basePath?: string;

  /**
   * Create a real filesystem
   * @param basePath - Optional base path for path traversal protection
   */
  constructor(basePath?: string) {
    this.basePath = basePath ? resolve(basePath) : undefined;
  }

  /**
   * Check if a path is within the allowed base path
   */
  private isWithinBasePath(path: string): boolean {
    if (!this.basePath) {
      return true; // No restriction
    }
    const normalizedPath = resolve(path);
    const relativePath = relative(this.basePath, normalizedPath);
    // Check for path traversal attempts
    return !relativePath.startsWith('..') && !isAbsolute(relativePath);
  }

  /**
   * Validate path against traversal attacks
   */
  private validatePath(path: string): Result<string, FileSystemError> {
    const normalizedPath = resolve(path);
    if (!this.isWithinBasePath(normalizedPath)) {
      return err(createFileSystemError('PATH_TRAVERSAL', path));
    }
    return ok(normalizedPath);
  }

  async readFile(
    path: string,
    options?: ReadOptions
  ): Promise<Result<string, FileSystemError>> {
    const validatedPath = this.validatePath(path);
    if (!validatedPath.ok) {
      return validatedPath;
    }

    try {
      const encoding = options?.encoding ?? 'utf-8';
      const content = await readFileAsync(validatedPath.value, { encoding });
      return ok(content);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return err(createFileSystemError('NOT_FOUND', path));
      }
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', path));
      }
      if (nodeError.code === 'EISDIR') {
        return err(createFileSystemError('NOT_A_FILE', path));
      }
      return err(
        createFileSystemError('IO_ERROR', path, nodeError.message, error as Error)
      );
    }
  }

  async writeFile(
    path: string,
    content: string,
    options?: WriteOptions
  ): Promise<Result<void, FileSystemError>> {
    const validatedPath = this.validatePath(path);
    if (!validatedPath.ok) {
      return validatedPath;
    }

    try {
      const encoding = options?.encoding ?? 'utf-8';

      // Create parent directories if requested
      if (options?.createParents) {
        const dir = dirname(validatedPath.value);
        mkdirSync(dir, { recursive: true });
      }

      // Atomic write: write to temp file, then rename
      if (options?.atomic ?? true) {
        const tempPath = `${validatedPath.value}.${randomBytes(8).toString('hex')}.tmp`;
        try {
          writeFileSync(tempPath, content, { encoding });
          renameSync(tempPath, validatedPath.value);
        } catch (error) {
          // Clean up temp file if rename fails
          try {
            unlinkSync(tempPath);
          } catch {
            // Ignore cleanup errors
          }
          throw error;
        }
      } else {
        await writeFileAsync(validatedPath.value, content, { encoding });
      }

      return ok(undefined);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', path));
      }
      if (nodeError.code === 'ENOENT') {
        return err(
          createFileSystemError(
            'NOT_FOUND',
            path,
            'Parent directory does not exist'
          )
        );
      }
      return err(
        createFileSystemError('IO_ERROR', path, nodeError.message, error as Error)
      );
    }
  }

  async exists(path: string): Promise<boolean> {
    const validatedPath = this.validatePath(path);
    if (!validatedPath.ok) {
      return false;
    }
    return existsSync(validatedPath.value);
  }

  async stat(path: string): Promise<Result<FileStats, FileSystemError>> {
    const validatedPath = this.validatePath(path);
    if (!validatedPath.ok) {
      return validatedPath;
    }

    try {
      const stats = await statAsync(validatedPath.value);
      return ok({
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return err(createFileSystemError('NOT_FOUND', path));
      }
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', path));
      }
      return err(
        createFileSystemError('IO_ERROR', path, nodeError.message, error as Error)
      );
    }
  }

  async mkdir(
    path: string,
    recursive?: boolean
  ): Promise<Result<void, FileSystemError>> {
    const validatedPath = this.validatePath(path);
    if (!validatedPath.ok) {
      return validatedPath;
    }

    try {
      await mkdirAsync(validatedPath.value, { recursive: recursive ?? false });
      return ok(undefined);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EEXIST') {
        return err(createFileSystemError('ALREADY_EXISTS', path));
      }
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', path));
      }
      return err(
        createFileSystemError('IO_ERROR', path, nodeError.message, error as Error)
      );
    }
  }

  async remove(path: string): Promise<Result<void, FileSystemError>> {
    const validatedPath = this.validatePath(path);
    if (!validatedPath.ok) {
      return validatedPath;
    }

    try {
      await unlinkAsync(validatedPath.value);
      return ok(undefined);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return err(createFileSystemError('NOT_FOUND', path));
      }
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', path));
      }
      if (nodeError.code === 'EISDIR') {
        return err(createFileSystemError('NOT_A_FILE', path));
      }
      return err(
        createFileSystemError('IO_ERROR', path, nodeError.message, error as Error)
      );
    }
  }

  async rmdir(
    path: string,
    recursive?: boolean
  ): Promise<Result<void, FileSystemError>> {
    const validatedPath = this.validatePath(path);
    if (!validatedPath.ok) {
      return validatedPath;
    }

    try {
      await rmdirAsync(validatedPath.value, { recursive: recursive ?? false });
      return ok(undefined);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return err(createFileSystemError('NOT_FOUND', path));
      }
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', path));
      }
      if (nodeError.code === 'ENOTDIR') {
        return err(createFileSystemError('NOT_A_DIRECTORY', path));
      }
      return err(
        createFileSystemError('IO_ERROR', path, nodeError.message, error as Error)
      );
    }
  }

  async list(
    path: string,
    options?: ListOptions
  ): Promise<Result<string[], FileSystemError>> {
    const validatedPath = this.validatePath(path);
    if (!validatedPath.ok) {
      return validatedPath;
    }

    try {
      const entries = await readdirAsync(validatedPath.value, {
        recursive: options?.recursive ?? false,
        withFileTypes: false,
      });

      let files = entries as string[];

      // Apply pattern filter if specified
      if (options?.pattern) {
        const pattern = this.globToRegex(options.pattern);
        files = files.filter((f) => pattern.test(f));
      }

      return ok(files);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return err(createFileSystemError('NOT_FOUND', path));
      }
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', path));
      }
      if (nodeError.code === 'ENOTDIR') {
        return err(createFileSystemError('NOT_A_DIRECTORY', path));
      }
      return err(
        createFileSystemError('IO_ERROR', path, nodeError.message, error as Error)
      );
    }
  }

  async copy(src: string, dest: string): Promise<Result<void, FileSystemError>> {
    const validatedSrc = this.validatePath(src);
    if (!validatedSrc.ok) {
      return validatedSrc;
    }

    const validatedDest = this.validatePath(dest);
    if (!validatedDest.ok) {
      return validatedDest;
    }

    try {
      await copyFileAsync(validatedSrc.value, validatedDest.value);
      return ok(undefined);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return err(createFileSystemError('NOT_FOUND', src));
      }
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', src));
      }
      return err(
        createFileSystemError('IO_ERROR', src, nodeError.message, error as Error)
      );
    }
  }

  async rename(
    oldPath: string,
    newPath: string
  ): Promise<Result<void, FileSystemError>> {
    const validatedOld = this.validatePath(oldPath);
    if (!validatedOld.ok) {
      return validatedOld;
    }

    const validatedNew = this.validatePath(newPath);
    if (!validatedNew.ok) {
      return validatedNew;
    }

    try {
      await renameAsync(validatedOld.value, validatedNew.value);
      return ok(undefined);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return err(createFileSystemError('NOT_FOUND', oldPath));
      }
      if (nodeError.code === 'EACCES') {
        return err(createFileSystemError('PERMISSION_DENIED', oldPath));
      }
      return err(
        createFileSystemError('IO_ERROR', oldPath, nodeError.message, error as Error)
      );
    }
  }

  resolve(...paths: string[]): string {
    return resolve(...paths);
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
}

/**
 * Create a real filesystem with optional base path restriction
 */
export function createRealFileSystem(basePath?: string): FileSystem {
  return new RealFileSystem(basePath);
}
