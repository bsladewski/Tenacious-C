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

  /**
   * Brief terminal-friendly summary of what was accomplished in this execution (1-2 paragraphs worth of text)
   * This should be plain text, suitable for terminal display, summarizing the key work completed
   */
  summary: string;
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
  required: ['hasFollowUps', 'hardBlockers', 'summary'],
  additionalProperties: false,
  properties: {
    hasFollowUps: {
      type: 'boolean',
      description: 'Whether any follow-ups exist (details are in execution-summary.md)',
    },
    hardBlockers: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        required: ['description', 'reason'],
        additionalProperties: false,
        properties: {
          description: {
            type: 'string',
            minLength: 1,
            description: 'Description of the hard blocker',
          },
          reason: {
            type: 'string',
            minLength: 1,
            description: 'Why this prevents execution from continuing',
          },
        },
      },
      description: 'List of hard blockers that prevent execution from continuing',
    },
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: 3000,
      description: 'Brief terminal-friendly summary of what was accomplished in this execution (1-2 paragraphs worth of text). Plain text, suitable for terminal display, summarizing the key work completed.',
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
  summary: 'Implemented user authentication system with JWT token generation and validation. Created login and registration API endpoints, added password hashing using bcrypt, and integrated session management middleware. All core authentication flows are now functional and tested.',
};
