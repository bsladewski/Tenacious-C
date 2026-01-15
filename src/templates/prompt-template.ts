/**
 * Interface for prompt templates that support string interpolation
 */
export interface PromptTemplate {
  /**
   * The template string with placeholders (e.g., "{{variable}}")
   */
  template: string;

  /**
   * Description of what this template is used for
   */
  description?: string;

  /**
   * List of required variables for this template
   */
  requiredVariables?: string[];
}

/**
 * Process a prompt template by interpolating variables
 * @param template - The prompt template
 * @param variables - Object with variable names as keys and values to interpolate
 * @returns The interpolated prompt string
 * @throws Error if required variables are missing
 */
export function interpolateTemplate(
  template: PromptTemplate,
  variables: Record<string, string>
): string {
  // Check for required variables
  if (template.requiredVariables) {
    const missing = template.requiredVariables.filter(
      (varName) => !(varName in variables) || variables[varName] === undefined
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required variables: ${missing.join(', ')}`
      );
    }
  }

  // Replace placeholders in format {{variableName}}
  let result = template.template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, value);
  }

  // Warn about unused variables (optional, but helpful for debugging)
  const usedPlaceholders = result.match(/\{\{(\w+)\}\}/g);
  if (usedPlaceholders) {
    const unusedVars = usedPlaceholders
      .map((p) => p.replace(/[{}]/g, ''))
      .filter((varName) => !(varName in variables));
    if (unusedVars.length > 0) {
      console.warn(
        `Warning: Template contains placeholders without values: ${unusedVars.join(', ')}`
      );
    }
  }

  return result;
}
