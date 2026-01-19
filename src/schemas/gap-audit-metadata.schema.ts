/**
 * Schema for gap audit metadata JSON file
 * This file is output alongside the gap audit summary markdown file
 */

export interface GapAuditMetadata {
  /**
   * Schema version for forward compatibility
   */
  schemaVersion: '1.0.0';

  /**
   * Whether any implementation/quality gaps were identified
   */
  gapsIdentified: boolean;

  /**
   * Brief terminal-friendly summary of the gap audit results (1-2 paragraphs worth of text)
   * This should be plain text, suitable for terminal display, summarizing what was audited and what gaps were found (if any)
   */
  summary: string;
}

/**
 * JSON Schema definition for validation
 */
export const gapAuditMetadataJsonSchema = {
  type: 'object',
  required: ['schemaVersion', 'gapsIdentified', 'summary'],
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: 'string',
      const: '1.0.0',
      description: 'Schema version for forward compatibility',
    },
    gapsIdentified: {
      type: 'boolean',
      description: 'Whether any implementation/quality gaps were identified',
    },
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: 3000,
      description: 'Brief terminal-friendly summary of the gap audit results (1-2 paragraphs worth of text). Plain text, suitable for terminal display, summarizing what was audited and what gaps were found (if any).',
    },
  },
};

/**
 * Get a formatted JSON schema string for use in prompts
 */
export function getGapAuditMetadataSchemaString(): string {
  return JSON.stringify(gapAuditMetadataJsonSchema, null, 2);
}

/**
 * Example of valid gap audit metadata
 */
export const exampleGapAuditMetadata: GapAuditMetadata = {
  schemaVersion: '1.0.0',
  gapsIdentified: false,
  summary: 'Completed comprehensive audit of the authentication implementation against the original requirements. Verified all core features are implemented, code quality meets standards, and tests are in place. No gaps identified - implementation is complete and ready for production.',
};
