import { PromptTemplate } from './prompt-template';
import { getGapAuditMetadataSchemaString } from '../schemas/gap-audit-metadata.schema';

/**
 * Nemesis mode sub-prompt for more adversarial gap audits
 * This prompt is inserted into the gap audit template when nemesis mode is enabled
 */
const NEMESIS_PROMPT = `You are auditing an implementation produced by an **external system** with **unknown incentives** and **minimal domain knowledge**. Assume the implementer may have:
- optimized for "passing" rather than correctness,
- cut corners, skipped edge cases, or introduced subtle regressions,
- misunderstood repository conventions, requirements, or contracts.

### Strict failure rule
This audit is considered **failed** if any defect, missing behavior, or incorrect behavior is later found that **should reasonably have been detected by this gap analysis**.

Therefore, you must behave as a **high-skepticism adversarial reviewer**:
- Actively search for missing requirements coverage, incorrect behavior, and hidden regressions.
- Treat ambiguous areas as high-risk and attempt to disambiguate by reading repository docs, contracts, tests, and code.
- Prefer identifying *probable* failure points over giving the benefit of the doubt.

### Required audit depth
To avoid missing defects:
1) Trace each requirement to concrete implementation evidence (routes, handlers, functions, UI flows, etc.).
2) Identify edge cases and negative paths (null/empty, invalid inputs, boundary conditions, permission/authorization, failure handling).
3) Verify integration points and contracts (API shapes, schema assumptions, DB/pipeline semantics, side effects).
4) Verify consistency with repository standards (linting, formatting, AGENTS rules, documented conventions).
5) Evaluate correctness beyond "it compiles": look for logical bugs, race conditions, brittle assumptions, and incomplete wiring.

### Output requirements in Nemesis Mode
In addition to your normal outputs, you MUST include:
- A **Risk Register**: the top 5–15 most likely defect vectors, each with:
  - why it's risky,
  - where in code it might manifest,
  - how to validate it (tests to add, checks to run, scenarios to try).
- A **Defect Hypothesis List**: concrete "this might be broken" hypotheses with pointers to relevant code.
- **No rubber-stamps**: If you cannot confirm a requirement is met from evidence, mark it as \`partial\` or \`unmet\` and describe what is missing.

You must still remain accurate and evidence-based: do not invent defects. If you suspect a defect but cannot confirm it, label it as a *risk/hypothesis* and propose validation steps.`;

/**
 * Gap audit template for verifying implementation completeness and quality
 * This template is used to audit the codebase against requirements and plan
 * 
 * Based on the Cursor audit command structure
 */
export function getGapAuditTemplate(nemesisMode: boolean = false): PromptTemplate {
  const metadataSchema = getGapAuditMetadataSchemaString();
  
  return {
    template: `You are auditing the codebase (frontend, backend, or both as required) to verify that the implementation completes all requirements and follows best practices.

**PRIMARY FOCUS:** Your main task is to thoroughly review the ACTUAL IMPLEMENTATION - read the code, examine changes, verify requirements are met through code analysis, check test quality, and identify gaps in the implementation itself. Do NOT rely primarily on execution summaries or verification tool outputs. These are supplementary checks, not replacements for deep code review.

The requirements are defined by:
1. The original requirements at \`{{requirementsPath}}\`
2. The plan file at \`{{planPath}}\`

Follow instruction precedence (highest to lowest):

1. This command's rules  
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)  
3. The original requirements and plan
${nemesisMode ? `\n---\n\n${NEMESIS_PROMPT}\n\n---\n` : ''}
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
   - Follows workspace-specific conventions (e.g., security, structured errors, i18n/a11y/routing) where applicable

3. **Implementation Quality:**
   - Code is well-structured and maintainable
   - Tests are present and appropriate
   - Error handling is robust
   - Performance considerations are addressed
   - Documentation is updated where needed

**CRITICAL:** Your PRIMARY focus must be on thoroughly reviewing the actual implementation changes. You MUST:
- Read and analyze the actual code changes that were made
- Verify requirements are met by examining the implementation, not just by checking summaries
- Review test coverage and quality by examining test files
- Check code quality by reading the actual source code
- Look for edge cases, error handling, and best practices in the code itself

Do NOT rely solely on execution summaries or verification tool outputs. These are supplementary information, not a replacement for deep code review.

---

## Verification Command Status (Secondary Check)

**IMPORTANT NOTE:** This verification tools check is a SECONDARY validation step. It supplements but does NOT replace your primary audit of the actual implementation. You must still perform deep code review regardless of verification tool results.

The plan file and requirements file contain a "Verification Tools / Gates" section (or "Verification Requirements" section) that was auto-generated by the Tool Curation phase.

As a secondary check (after your primary code review), you should verify:
1. Check the plan's "Verification Tools / Gates" section to see which verification commands are required
2. **Read the execution summary at \`{{executionSummaryPath}}\`** and check the "Verification Tools Executed" section
3. **Also check for follow-up execution summaries** in the same directory (pattern: \`execution-summary-{{executionIteration}}-followup-*.md\`) and check their "Verification Tools Executed" sections
4. Verify that all listed commands from the plan were documented as executed in at least one execution summary (main or follow-up)
5. Verify that all commands passed (or failures are documented with justification)

**Evidence of execution:**
- The execution summary MUST contain a "Verification Tools Executed" section
- Each verification command from the plan's "Verification Tools / Gates" section MUST be listed in the execution summary's "Verification Tools Executed" section
- Each entry MUST indicate whether the command passed or failed
- If a command failed, there MUST be documentation of the failure and either a resolution or justification

**If verifications were not run or are failing without documented justification:**
- This is a secondary gap - note it in the audit summary but do not let it overshadow implementation gaps
- Set \`gapsIdentified\` to \`true\` if this is the only issue, but prioritize implementation quality gaps
- Be specific: name which verification commands were missing or failed

---

## Agent Skills Compliance (Secondary Check)

The plan file and requirements file may contain an "Agent Skills" section that was auto-generated by the Tool Curation phase. These files list project-specific conventions and coding standards.

As part of your quality audit, check whether the implementation follows the conventions described in the listed agent skill files:
- Review the agent skill files referenced in the plan/requirements
- Verify the implementation adheres to the coding standards, naming conventions, architecture rules, and testing patterns described in those files
- If the implementation violates conventions from agent skill files, note this as a gap with a specific reference to which convention was violated and where

**If the execution summary does not have a "Verification Tools Executed" section, or if verification commands from the plan are missing from that section:**
- This is a documentation gap - the verification tools were not properly documented as executed
- Set \`gapsIdentified\` to \`true\` if this is the only issue, but prioritize implementation quality gaps
- List this as a gap in the audit summary, but remember: missing documentation does not mean the tools weren't run - focus on whether the implementation itself is correct

**Acceptable justifications for skipped verifications:**
- The command requires infrastructure not available in this environment (e.g., Docker, database)
- The command is documented as optional or known-broken
- The change is purely documentation/non-code and the verification is code-only
- The justification MUST be documented in the execution summary's "Verification Tools Executed" section

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
    requiredVariables: ['requirementsPath', 'planPath', 'outputDirectory', 'executionIteration', 'executionSummaryPath'],
  };
}
