/**
 * Schema for execute metadata JSON file
 * This file is output alongside the execution summary markdown file
 */

export interface ExecuteMetadata {
  /**
   * Whether any follow-ups exist (details are in execution-summary.md)
   */
  hasFollowUps: boolean;

  /**
   * List of hard blockers that prevent execution from continuing
   * Hard blockers are rare and mean the agent absolutely cannot continue without user input.
   * Examples: Docker service not running when docker commands are required,
   * missing critical credentials that cannot be inferred, etc.
   */
  hardBlockers: HardBlocker[];
}

export interface HardBlocker {
  /**
   * Description of the hard blocker
   */
  description: string;

  /**
   * Why this prevents execution from continuing
   */
  reason: string;
}

/**
 * JSON Schema definition for validation
 */
export const executeMetadataJsonSchema = {
  type: 'object',
  required: ['hasFollowUps', 'hardBlockers'],
  properties: {
    hasFollowUps: {
      type: 'boolean',
      description: 'Whether any follow-ups exist (details are in execution-summary.md)',
    },
    hardBlockers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'reason'],
        properties: {
          description: {
            type: 'string',
            description: 'Description of the hard blocker',
          },
          reason: {
            type: 'string',
            description: 'Why this prevents execution from continuing',
          },
        },
      },
      description: 'List of hard blockers that prevent execution from continuing',
    },
  },
};

/**
 * Get a formatted JSON schema string for use in prompts
 */
export function getExecuteMetadataSchemaString(): string {
  return JSON.stringify(executeMetadataJsonSchema, null, 2);
}

/**
 * Example of valid execute metadata
 */
export const exampleExecuteMetadata: ExecuteMetadata = {
  hasFollowUps: false,
  hardBlockers: [],
};
