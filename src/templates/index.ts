/**
 * Export all prompt templates
 */
export { PromptTemplate, interpolateTemplate } from './prompt-template';
export { placeholderTemplate, getPlaceholderTemplate } from './plan.template';
export { getAnswerQuestionsTemplate } from './answer-questions.template';

// Re-export for convenience
export { interpolateTemplate as interpolate } from './prompt-template';
