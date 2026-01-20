import { PromptTemplate } from './prompt-template';
import { getGapAuditMetadataSchemaString } from '../schemas/gap-audit-metadata.schema';

/**
 * Gap audit template for verifying implementation completeness and quality
 * This template is used to audit the codebase against requirements and plan
 * 
 * Based on the Cursor audit command structure
 */
export function getGapAuditTemplate(): PromptTemplate {
  const metadataSchema = getGapAuditMetadataSchemaString();
  
  return {
    template: `You are auditing the codebase (frontend, backend, or both as required) to verify that the implementation completes all requirements and follows best practices.

The requirements are defined by:
1. The original requirements at \`{{requirementsPath}}\`
2. The plan file at \`{{planPath}}\`

Follow instruction precedence (highest to lowest):

1. This command's rules  
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)  
3. The original requirements and plan

**CRITICAL READ-ONLY RULE:**
You MUST NOT modify any files besides the audit report and metadata JSON in \`{{outputDirectory}}\`.
You MUST NOT create TODO lists in the codebase.
This command is for analysis and writing an audit report only.

**CRITICAL ENVIRONMENT SAFETY RULES:**
- **NEVER modify live environments** (production, staging, or any deployed environment)
- **NEVER push code to remote origins** (no \`git push\`, \`git push origin\`, or any remote repository operations)
- **NEVER deploy to any environment** (no deployment commands, CI/CD triggers, or environment modifications)
- If gaps mention deployment or environment changes, they must be marked as requiring manual human intervention and should NOT be included as agent-actionable gaps

---

## Scope Detection

From the requirements and plan, determine scope:

- If clearly frontend-only → audit only frontend
- If clearly backend-only → audit only backend
- If cross-cutting → audit both and separate findings into frontend/backend sections

---

## Audit Process

Perform a deep, accuracy-first audit to verify:

1. **Requirements Completeness:**
   - All requirements from the original requirements file have been implemented
   - All steps from the plan have been completed
   - No missing features or functionality

2. **Quality Standards:**
   - Code follows best practices and patterns
   - Conforms to all agent rules (cursorrules/, agents.md, etc.)
   - Aligns with repository documentation
   - Maintains architecture/layering conventions
   - Follows security, structured errors, and i18n/a11y/routing conventions where applicable

3. **Implementation Quality:**
   - Code is well-structured and maintainable
   - Tests are present and appropriate
   - Error handling is robust
   - Performance considerations are addressed
   - Documentation is updated where needed

---

## Gap Identification

Identify gaps that represent:
- Missing requirements or incomplete implementation
- Deviations from the plan
- Quality issues that can be addressed programmatically
- Best practice violations
- Agent rule violations
- Documentation gaps

**CRITICAL: Gaps MUST be actionable by the agent**

**What makes a good gap (agent-actionable):**
- Missing code implementation: "Add error handling for API failures in \`src/api/client.ts\`"
- Missing tests: "Add unit tests for \`src/utils/validator.ts\`"
- Code quality issues: "Refactor \`src/components/Form.tsx\` to extract validation logic"
- Documentation gaps: "Update \`docs/api.md\` to document new endpoint at \`/api/v2/users\`"
- Best practice violations: "Replace inline styles with CSS modules in \`src/components/Button.tsx\`"
- Agent rule violations: "Add accessibility labels to form inputs in \`src/components/LoginForm.tsx\`"

**What does NOT make a good gap (requires manual human intervention):**
- Manual verification: "Verify responsive design on mobile and web devices" (unless automated tooling exists)
- Human judgment: "Check if the design looks good"
- Manual testing: "Test the checkout flow with a real credit card"
- Human review: "Have a team member review the security implications"
- **Deployment to any environment: "Deploy to staging/production and verify"** - NEVER include deployment steps as gaps
- **Pushing code to remote: "Push changes to remote repository"** - NEVER include git push operations as gaps
- Things requiring human judgment without automated tooling

**Rule:** If a gap requires manual human intervention and there's no automated tooling to support it, it should NOT be included as a gap. Only include gaps that the agent can address programmatically.

---

## Output Requirements

You MUST output **two files** in \`{{outputDirectory}}\`:

1. **Gap Audit Summary Markdown:** \`{{outputDirectory}}/gap-audit-summary-{{executionIteration}}.md\`
   - This file MUST contain the audit report with the exact structure below
   - Detail all gaps discovered (only agent-actionable gaps)
   - If no gaps are found, explicitly state that
   - **Note:** This is execution iteration {{executionIteration}} - use this filename for full history tracking

2. **Gap Audit Metadata JSON:** \`{{outputDirectory}}/gap-audit-metadata.json\`
   - **CRITICAL - ALLOWED KEYS ONLY:** This file is NOT a JSON version of the gap audit summary. It MUST contain ONLY these top-level keys: \`gapsIdentified\`, \`summary\`. Do NOT add any other keys.
   - **CRITICAL - VALID JSON ONLY:** The file MUST be valid JSON parseable by \`JSON.parse()\`. No markdown code fences, no comments, no extra text before or after the JSON object.
   - Set \`gapsIdentified\` to \`true\` if any gaps were found, \`false\` otherwise
   - **CRITICAL - VALIDATION REQUIRED:** After writing \`gap-audit-metadata.json\`, you MUST run this validation command:
     \`\`\`bash
     node -e "JSON.parse(require('fs').readFileSync('{{outputDirectory}}/gap-audit-metadata.json','utf8')); console.log('gap-audit-metadata.json parses')"
     \`\`\`
     If parsing fails, you MUST fix the file and re-run the validation until it succeeds.

**Gap Audit Summary Structure** (for \`gap-audit-summary-{{executionIteration}}.md\`):

\`\`\`markdown
# Gap Audit Summary
- Target area(s): <frontend|backend|both>
- Date: <ISO timestamp>

# Requirements Completeness
- <assessment of whether all requirements were met>
- <any missing requirements or incomplete implementations>

# Quality Standards
- <assessment of code quality and best practices>
- <any violations of agent rules or repository conventions>

# Implementation Gaps
- <detailed list of agent-actionable gaps, each with sufficient context>
  - Gap 1: <description, file references, and what needs to be done>
  - Gap 2: <description, file references, and what needs to be done>

# Summary
- <overall assessment>
- <total number of gaps identified>
\`\`\`

**Gap Audit Metadata JSON Requirements:**

**CRITICAL - ALLOWED KEYS ONLY:**
- \`gap-audit-metadata.json\` is NOT a JSON version of the gap audit summary.
- It MUST contain ONLY these top-level keys: \`gapsIdentified\`, \`summary\`.
- It MUST be valid JSON parseable by \`JSON.parse()\` (no markdown fences, no comments, no extra text).

**Example gap-audit-metadata.json:**
\`\`\`json
{
  "gapsIdentified": false,
  "summary": "Plain text 1–2 paragraph summary."
}
\`\`\`

**Gap Audit Metadata JSON Schema:**

\`\`\`json
${metadataSchema}
\`\`\`

**Important:**
- The \`gapsIdentified\` boolean indicates whether any agent-actionable gaps were found
- Only include gaps that can be addressed programmatically by the agent
- Each gap must be detailed and specific with file references and clear action items
- The \`summary\` field must contain a brief terminal-friendly summary (1-2 paragraphs worth of text) of the audit results
  - Use plain text (no markdown formatting)
  - Suitable for terminal display
  - Summarize what was audited, the overall assessment, and whether gaps were found (and if so, a brief overview of the types of gaps)
  - Keep it concise (max 3000 characters) - do NOT dump the full gap audit summary here

**CRITICAL - JSON VALIDATION:**
After writing \`gap-audit-metadata.json\`, you MUST run this validation command:
\`\`\`bash
node -e "JSON.parse(require('fs').readFileSync('{{outputDirectory}}/gap-audit-metadata.json','utf8')); console.log('gap-audit-metadata.json parses')"
\`\`\`
If parsing fails, you MUST fix the file and re-run the validation until it succeeds.

---

## FINAL VERIFICATION CHECKLIST

**CRITICAL:** Before completing your response, you MUST verify ALL of the following:

- [ ] Created \`{{outputDirectory}}/gap-audit-summary-{{executionIteration}}.md\` with the gap audit summary
- [ ] Created \`{{outputDirectory}}/gap-audit-metadata.json\` with ONLY the allowed keys (gapsIdentified, summary)
- [ ] Ran the JSON validation command and it succeeded (output shows "gap-audit-metadata.json parses")
- [ ] Both files are in the correct location (\`{{outputDirectory}}\`) with the correct filenames
- [ ] The \`gapsIdentified\` boolean correctly reflects whether any gaps were found

**WARNING:** If any of these checks fail, you MUST fix them before completing your response.

**NOTE:** The calling system will automatically verify these files exist after execution completes. If the files are missing or malformed, the execution will be treated as a failure and may trigger retries or fallback to a different tool.`,
    description: 'Template for auditing implementation completeness and quality',
    requiredVariables: ['requirementsPath', 'planPath', 'outputDirectory', 'executionIteration'],
  };
}
