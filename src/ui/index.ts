/**
 * UI module - user interface utilities
 * Provides spinners, prompts, and output formatting
 */

// Spinner service
export {
  SpinnerService,
  SpinnerServiceConfig,
  SpinnerOptions,
  Spinner,
  createSpinnerService,
  getDefaultSpinnerService,
  resetDefaultSpinnerService,
} from './spinner-service';

// Inquirer-based prompter
export {
  InquirerPrompter,
  InquirerPrompterConfig,
  createInquirerPrompter,
  createNonInteractivePrompter,
} from './inquirer-prompter';

// CLI tool selection prompts
export { promptForCliTool } from './prompt-cli-tool';

// Question and answer prompts
export { promptForAnswers, formatAnswers } from './prompt-questions';

// Hard blocker resolution prompts
export { promptForHardBlockerResolution, formatHardBlockerResolutions } from './prompt-hard-blockers';

// Plan preview
export { previewPlan } from './preview-plan';
