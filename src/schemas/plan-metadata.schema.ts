/**
 * Schema for plan metadata JSON file
 * This file is output alongside the plan markdown file
 */

export interface PlanMetadata {
  /**
   * Schema version for forward compatibility
   */
  schemaVersion: '1.0.0';

  /**
   * Confidence level (0-100) in the plan's completeness and accuracy
   */
  confidence: number;

  /**
   * List of open questions that need clarification
   */
  openQuestions: OpenQuestion[];

  /**
   * Brief terminal-friendly summary of what was planned (1-2 paragraphs worth of text)
   * This should be plain text, suitable for terminal display, summarizing the key aspects of the plan
   */
  summary: string;
}

export interface OpenQuestion {
  /**
   * The question that needs to be answered
   */
  question: string;

  /**
   * Suggested answers or options for the question
   */
  suggestedAnswers?: string[];
}

/**
 * JSON Schema definition for validation
 */
export const planMetadataJsonSchema = {
  type: 'object',
  required: ['schemaVersion', 'confidence', 'openQuestions', 'summary'],
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: 'string',
      const: '1.0.0',
      description: 'Schema version for forward compatibility',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Confidence level (0-100) in the plan\'s completeness and accuracy',
    },
    openQuestions: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        required: ['question'],
        additionalProperties: false,
        properties: {
          question: {
            type: 'string',
            minLength: 1,
            description: 'The question that needs to be answered',
          },
          suggestedAnswers: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1,
            },
            description: 'Suggested answers or options for the question',
          },
        },
      },
      description: 'List of open questions that need clarification',
    },
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: 3000,
      description: 'Brief terminal-friendly summary of what was planned (1-2 paragraphs worth of text). Plain text, suitable for terminal display, summarizing the key aspects of the plan.',
    },
  },
};

/**
 * Get a formatted JSON schema string for use in prompts
 */
export function getPlanMetadataSchemaString(): string {
  return JSON.stringify(planMetadataJsonSchema, null, 2);
}

/**
 * Example of valid plan metadata
 */
export const examplePlanMetadata: PlanMetadata = {
  schemaVersion: '1.0.0',
  confidence: 80,
  openQuestions: [
    {
      question: 'What framework should be used for the frontend?',
      suggestedAnswers: ['React', 'Angular', 'Vue'],
    },
  ],
  summary: 'This plan outlines the implementation of a user authentication system with JWT tokens, password hashing, and session management. The implementation will be split across three phases: core authentication logic, API endpoints, and frontend integration. Key components include user registration, login, token refresh, and password reset functionality.',
};
