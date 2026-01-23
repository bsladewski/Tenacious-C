/**
 * Schema for tool curation metadata JSON file
 * This file is output alongside the tool curation report markdown file
 */

/**
 * Tool curation metadata interface
 */
export interface ToolCurationMetadata {
  /**
   * Schema version for forward compatibility
   */
  schemaVersion: '1.0.0';

  /**
   * Brief terminal-friendly summary of the tool curation results (1-2 paragraphs worth of text)
   * This should be plain text, suitable for terminal display, summarizing what verification
   * commands were selected and why
   */
  summary: string;
}

/**
 * JSON Schema definition for validation
 */
export const toolCurationMetadataJsonSchema = {
  type: 'object',
  required: ['schemaVersion', 'summary'],
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: 'string',
      const: '1.0.0',
      description: 'Schema version for forward compatibility',
    },
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: 3000,
      description: 'Brief terminal-friendly summary of the tool curation results (1-2 paragraphs worth of text). Plain text, suitable for terminal display, summarizing what verification commands were selected and why.',
    },
  },
};

/**
 * Get a formatted JSON schema string for use in prompts
 */
export function getToolCurationMetadataSchemaString(): string {
  return JSON.stringify(toolCurationMetadataJsonSchema, null, 2);
}

/**
 * Example of valid tool curation metadata
 */
export const exampleToolCurationMetadata: ToolCurationMetadata = {
  schemaVersion: '1.0.0',
  summary: 'Selected 3 verification commands based on repository tooling: npm run lint (ESLint configured), npm run test (Vitest configured), and npm run build (TypeScript compilation). These commands must pass before the implementation is considered complete.',
};
