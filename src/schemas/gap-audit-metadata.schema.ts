/**
 * Schema for gap audit metadata JSON file
 * This file is output alongside the gap audit summary markdown file
 */

export interface GapAuditMetadata {
  /**
   * Whether any implementation/quality gaps were identified
   */
  gapsIdentified: boolean;
}

/**
 * JSON Schema definition for validation
 */
export const gapAuditMetadataJsonSchema = {
  type: 'object',
  required: ['gapsIdentified'],
  properties: {
    gapsIdentified: {
      type: 'boolean',
      description: 'Whether any implementation/quality gaps were identified',
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
  gapsIdentified: false,
};
