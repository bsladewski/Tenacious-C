/**
 * Schema for plan metadata JSON file
 * This file is output alongside the plan markdown file
 */

export interface PlanMetadata {
  /**
   * Confidence level (0-100) in the plan's completeness and accuracy
   */
  confidence: number;

  /**
   * List of open questions that need clarification
   */
  openQuestions: OpenQuestion[];
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
  required: ['confidence', 'openQuestions'],
  properties: {
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Confidence level (0-100) in the plan\'s completeness and accuracy',
    },
    openQuestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['question'],
        properties: {
          question: {
            type: 'string',
            description: 'The question that needs to be answered',
          },
          suggestedAnswers: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Suggested answers or options for the question',
          },
        },
      },
      description: 'List of open questions that need clarification',
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
  confidence: 80,
  openQuestions: [
    {
      question: 'What framework should be used for the frontend?',
      suggestedAnswers: ['React', 'Angular', 'Vue'],
    },
  ],
};
