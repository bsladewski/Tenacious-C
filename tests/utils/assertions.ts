/**
 * Test Assertions for Integration Tests
 *
 * Provides helper functions for validating artifacts and metadata.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validatePlanMetadata,
  validateExecuteMetadata,
  validateGapAuditMetadata,
} from '../../src/schemas/validators';

/**
 * Assert that a file exists and optionally validate its content.
 */
export function assertFileExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected file to exist: ${filePath}`);
  }
}

/**
 * Assert that a directory contains specific files.
 */
export function assertDirectoryContains(dirPath: string, files: string[]): void {
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    assertFileExists(fullPath);
  }
}

/**
 * Assert that a JSON file is valid and can be parsed.
 */
export function assertValidJson(filePath: string): unknown {
  assertFileExists(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON in file ${filePath}: ${e}`);
  }
}

/**
 * Assert that a plan metadata file is valid.
 */
export function assertValidPlanMetadata(filePath: string): void {
  const data = assertValidJson(filePath);
  const result = validatePlanMetadata(data);
  if (!result.success) {
    throw new Error(
      `Invalid plan metadata in ${filePath}: ${result.errors?.join(', ')}`
    );
  }
}

/**
 * Assert that an execute metadata file is valid.
 */
export function assertValidExecuteMetadata(filePath: string): void {
  const data = assertValidJson(filePath);
  const result = validateExecuteMetadata(data);
  if (!result.success) {
    throw new Error(
      `Invalid execute metadata in ${filePath}: ${result.errors?.join(', ')}`
    );
  }
}

/**
 * Assert that a gap audit metadata file is valid.
 */
export function assertValidGapAuditMetadata(filePath: string): void {
  const data = assertValidJson(filePath);
  const result = validateGapAuditMetadata(data);
  if (!result.success) {
    throw new Error(
      `Invalid gap audit metadata in ${filePath}: ${result.errors?.join(', ')}`
    );
  }
}

/**
 * Read and parse a JSON artifact file.
 */
export function readJsonArtifact<T>(filePath: string): T {
  assertFileExists(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Assert that a markdown file exists and is non-empty.
 */
export function assertValidMarkdownArtifact(filePath: string): string {
  assertFileExists(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.trim().length === 0) {
    throw new Error(`Expected non-empty markdown file: ${filePath}`);
  }
  return content;
}
