import { appendFileSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Track a question and answer in the Q&A history file
 * @param timestampDirectory - The timestamp directory (.tenacious-c/<timestamp>)
 * @param question - The question that was asked
 * @param answer - The answer that was provided
 */
export function trackQAHistory(timestampDirectory: string, question: string, answer: string): void {
  const historyPath = resolve(timestampDirectory, 'qa-history.md');
  
  try {
    const timestamp = new Date().toISOString();
    const entry = `## ${timestamp}\n\n**Question:** ${question}\n\n**Answer:** ${answer}\n\n---\n\n`;
    appendFileSync(historyPath, entry, 'utf-8');
  } catch (error) {
    console.warn(`Warning: Could not append to qa-history.md: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Read the Q&A history from the file
 * @param timestampDirectory - The timestamp directory (.tenacious-c/<timestamp>)
 * @returns The Q&A history as a string, or empty string if file doesn't exist
 */
export function readQAHistory(timestampDirectory: string): string {
  const historyPath = resolve(timestampDirectory, 'qa-history.md');
  
  try {
    if (existsSync(historyPath)) {
      return readFileSync(historyPath, 'utf-8');
    }
    return '';
  } catch (error) {
    console.warn(`Warning: Could not read qa-history.md: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}
