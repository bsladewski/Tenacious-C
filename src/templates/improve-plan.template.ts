import { PromptTemplate } from './prompt-template';
import { getPlanMetadataSchemaString } from '../schemas/plan-metadata.schema';

/**
 * Improve plan template for deepening plan completeness when confidence is below threshold
 * This is a variation of the plan prompt focused on improving an existing plan's depth and completeness
 * 
 * Note: This function returns a template with the metadata schema already interpolated.
 * The schema is loaded from the codebase to ensure consistency between the tool and the prompt.
 */
export function getImprovePlanTemplate(): PromptTemplate {
  const metadataSchema = getPlanMetadataSchemaString();
  
  return {
    template: `You are revising an existing plan for codebase changes (frontend, backend, or both as required).

The plan is located at \`{{outputDirectory}}/plan.md\`. The current plan has a confidence level below the required threshold, indicating that it needs deeper analysis and more comprehensive details to be considered complete.

Follow instruction precedence (highest to lowest):

1. This command's rules  
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)  
3. The original plan requirements  

---

## Guardrails

**Purpose:** This command is for **deep analysis and improvement of the existing plan only**.

- Perform a **comprehensive deep analysis** of the existing plan to identify areas that need more detail, depth, or clarity.
- **Only modify files in** \`{{outputDirectory}}\` - specifically, update \`{{outputDirectory}}/plan.md\` and \`{{outputDirectory}}/plan-metadata.json\`.
- **Do NOT modify any files outside** \`{{outputDirectory}}\`.
- Respect the existing plan structure and format - maintain consistency with the original plan's organization.
- Add more detail, specificity, and depth to raise the plan's confidence level.
- Update the plan metadata (confidence level, add any new open questions that surface during deeper analysis).

**CRITICAL REVISION RULE:**  
You MUST NOT modify any files besides the plan markdown and metadata JSON in \`{{outputDirectory}}\`.

---

## Improvement Process

1. **Read and analyze** the existing plan at \`{{outputDirectory}}/plan.md\` thoroughly.
2. **Identify areas needing deeper analysis:**
   - Sections that are too high-level or vague
   - Missing technical details, implementation specifics, or architectural decisions
   - Areas where assumptions are made without sufficient justification
   - Dependencies or edge cases that aren't fully explored
   - Testing strategies that need more detail
   - Error handling or failure scenarios that aren't addressed
   - Performance considerations that aren't discussed
   - Security implications that need more analysis
3. **Deepen the plan** by adding:
   - More specific implementation details
   - Clearer architectural decisions with rationale
   - More comprehensive step-by-step breakdowns
   - Detailed considerations for edge cases and error scenarios
   - Specific technical choices with justifications
   - More thorough dependency analysis
   - Detailed testing approaches
   - Performance and scalability considerations
   - Security and compliance considerations
4. **Update metadata** in \`{{outputDirectory}}/plan-metadata.json\`:
   - **Increase the \`confidence\` level** to reflect the improved completeness and depth of the plan
   - Add any NEW open questions that surface during deeper analysis to the \`openQuestions\` array
   - **Each new question MUST include at least 2 suggested answers** in the \`suggestedAnswers\` array
   - The metadata file MUST conform to the exact schema provided below
5. **Maintain** the plan's structure, format, and organization while adding depth and detail.

---

## Plan Metadata Schema

The metadata file at \`{{outputDirectory}}/plan-metadata.json\` MUST conform to this schema:

**CRITICAL - ALLOWED KEYS ONLY:**
- \`plan-metadata.json\` is NOT a JSON version of the plan.
- It MUST contain ONLY these top-level keys: \`confidence\`, \`openQuestions\`, \`summary\`.
- It MUST be valid JSON parseable by \`JSON.parse()\` (no markdown fences, no comments, no extra text).

**Example plan-metadata.json:**
\`\`\`json
{
  "confidence": 80,
  "openQuestions": [],
  "summary": "Plain text 1–2 paragraph summary."
}
\`\`\`

**Plan Metadata JSON Schema:**

\`\`\`json
${metadataSchema}
\`\`\`

**Important:** 
- **You MUST update the \`confidence\` level** to a higher value that reflects the improved completeness of the plan
- If new questions arise during deeper analysis, add them to \`openQuestions\` with **at least 2 suggested answers** in the \`suggestedAnswers\` array (this is required for the interactive prompt system)
- Suggested answers should be concise, distinct options that cover the main possibilities
- The confidence should reflect the actual completeness and depth of the plan after your improvements
- Keep the \`summary\` concise (max 3000 characters) - do NOT dump the full plan here

**CRITICAL - JSON VALIDATION:**
After writing \`plan-metadata.json\`, you MUST run this validation command:
\`\`\`bash
node -e "JSON.parse(require('fs').readFileSync('{{outputDirectory}}/plan-metadata.json','utf8')); console.log('plan-metadata.json parses')"
\`\`\`
If parsing fails, you MUST fix the file and re-run the validation until it succeeds.

---

## Improvement Guidelines

- **Be thorough**: Analyze every section of the plan for opportunities to add depth and specificity.
- **Be specific**: Replace vague descriptions with concrete details, specific technologies, and clear implementation approaches.
- **Be comprehensive**: Consider edge cases, error scenarios, performance implications, and security concerns.
- **Be justified**: When making technical decisions, provide clear rationale for why those choices are appropriate.
- **Preserve structure**: Maintain the original plan's organization and formatting while adding depth.
- **Think critically**: Identify what's missing, what's unclear, and what needs more analysis.
- **Raise confidence**: The goal is to significantly improve the plan's completeness so that confidence reaches or exceeds the threshold.

---

## Output Requirements

You MUST update both files:

1. **\`{{outputDirectory}}/plan.md\`** - The improved plan document with significantly more depth and detail
2. **\`{{outputDirectory}}/plan-metadata.json\`** - Updated metadata with:
   - **Increased \`confidence\` level** (must be higher than before)
   - Added any new questions that surfaced during deeper analysis to \`openQuestions\` (each with at least 2 suggested answers)
   - Must conform to the schema provided above

Ensure both files are valid and properly formatted.`,
    description: 'Template for improving plan completeness when confidence is below threshold',
    requiredVariables: ['outputDirectory'],
  };
}
