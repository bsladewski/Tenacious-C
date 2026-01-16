import { PromptTemplate } from './prompt-template';
import { getExecuteMetadataSchemaString } from '../schemas/execute-metadata.schema';

/**
 * Execute follow-ups template for executing follow-up items from a previous execution
 * This template is used to iteratively execute follow-ups until none remain
 */
export function getExecuteFollowUpsTemplate(): PromptTemplate {
  const metadataSchema = getExecuteMetadataSchemaString();
  
  return {
    template: `You are executing follow-up items from a previous execution run for the codebase (frontend, backend, or both as required).

The previous execution summary is located at \`{{executionSummaryPath}}\`. This summary contains follow-up items that need to be addressed.

{{hardBlockerResolutions}}

**Note:** If hard blocker resolutions are provided above, use them to resolve the blockers and continue execution. If this section is empty, proceed with the follow-ups from the execution summary.

Follow instruction precedence (highest to lowest):

1. This command's rules  
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)  
3. The follow-up items from the execution summary
4. Hard blocker resolutions (if provided above)

**Important:** If any follow-up item is incomplete/ambiguous, do your best to proceed. Make reasonable assumptions and continue execution. The tool is designed to be iterative and will handle refinement in subsequent passes.

---

## Scope Detection

From the follow-up items, determine scope:

- If clearly frontend-only → limit changes to frontend
- If clearly backend-only → limit changes to backend
- If cross-cutting → implement in both with clear separation

---

## Execution Mode

**Follow-up-driven execution:**
- Read the execution summary at \`{{executionSummaryPath}}\`
- Focus on the "Follow-ups" section
- Execute each follow-up item in order
- Do not add new scope unless required by the follow-ups or repo rules
- If prior execution progress is evident (e.g., some follow-ups already completed), continue from the first incomplete follow-up

---

## Completion Rule

Your goal is to complete ALL follow-up items for this run.

- Do NOT stop just because some tests are still failing after the first attempt
- As long as remaining failures are clearly related to the current follow-up and can be fixed within scope using minimal, safe changes, KEEP ITERATING on that follow-up until the tests pass
- Only stop early if you hit a HARD BLOCKER condition

---

## Hard Blockers

**Hard blockers are RARE** and mean the agent absolutely cannot continue without user input. They break the automatic iterative flow.

Examples of hard blockers:
- Docker service is not running but the follow-up requires docker commands
- Missing critical credentials that cannot be inferred or worked around
- Required external service is completely unavailable and no workaround exists
- System-level permissions are missing and cannot be obtained programmatically

**NOT hard blockers:**
- Ambiguous follow-ups (make reasonable assumptions and proceed)
- Test failures (iterate until they pass)
- Missing dependencies (install them)
- Configuration issues (fix them)

If you encounter a hard blocker:
- Add it to the \`hardBlockers\` array in \`execute-metadata.json\` with a clear description and reason
- Continue with other follow-ups if possible, or stop if the blocker prevents all progress
- Document the blocker clearly in the execution summary

---

## Execution Guidelines

As you work:

- Make small, safe, scoped changes
- After each meaningful change, run appropriate lint and focused tests for the affected area (use repo-standard commands)
- Update/add tests to maintain coverage standards and prevent regressions
- Maintain architecture/layering, security, structured errors, and i18n/a11y/routing conventions per repo rules where applicable

---

## Test Strategy

Use a tiered strategy (be conservative with full-suite runs):

1. **Targeted tests** (single file or smallest relevant group)
2. **Focused suite / domain-level tests** (only if clearly needed)
3. **Full suite** (only if explicitly required by the follow-ups, or strictly necessary due to broad, cross-cutting changes)

Prefer the smallest scope that can meaningfully validate the changes just made.
If a full-suite run is not explicitly required, you may recommend it in "Follow-ups" but MUST NOT run it automatically.

---

## Execution Summary Reference

**Previous execution summary:** \`{{executionSummaryPath}}\`

Read the execution summary carefully, especially the "Follow-ups" section. Execute each follow-up item, checking them off as you complete them.

---

## Output Requirements

You MUST output **two files** in \`{{outputDirectory}}\`:

1. **Execution Summary Markdown:** \`{{outputDirectory}}/execution-summary-{{executionIteration}}-followup-{{followUpIteration}}.md\`
   - This file MUST contain the execution summary with the exact structure below
   - **Update the Follow-ups section** - remove completed follow-ups and add any new follow-ups that arise
   - **Note:** This is execution iteration {{executionIteration}}, follow-up iteration {{followUpIteration}} - use this filename for full history tracking

2. **Execute Metadata JSON:** \`{{outputDirectory}}/execute-metadata.json\`
   - This file MUST conform to the exact schema provided below
   - Set \`hasFollowUps\` to \`true\` if there are any follow-ups remaining in the execution summary (even if just one)
   - Set \`hasFollowUps\` to \`false\` if all follow-ups have been completed
   - Add any hard blockers to the \`hardBlockers\` array (should be rare)
   - **CRITICAL:** Follow-ups in the execution summary must be detailed, specific, and **actionable by the agent** - they will be executed programmatically in iterative runs

**Execution Summary Structure** (for \`execution-summary-{{executionIteration}}-followup-{{followUpIteration}}.md\`):

\`\`\`markdown
# Execution Summary
- Mode: <plan-driven|requirements-driven>
- Scope: <frontend|backend|both>

# Checklist
- [ ] Follow-up 1: <what changed + file refs>
- [ ] Follow-up 2: <...>

# Work Accomplished
- <Summary of what was accomplished in this follow-up iteration>
- <List key changes, files created/modified, follow-ups completed>
- <Include metrics if relevant: tests added, lines changed, etc.>
- <Be specific and comprehensive - this summary will be used to generate a final report>
- <If this is a follow-up iteration, also include cumulative work from previous iterations>

# Tests & Lint Run
- <commands or scripts used>

# Deviations
- <None> OR
- <what changed from follow-ups and why>

# Follow-ups
- <detailed list of remaining follow-up items, each with sufficient context>
\`\`\`

**Important about Follow-ups:**
- Follow-ups are items that need attention but don't prevent execution from continuing
- **CRITICAL: Follow-ups MUST be actionable by the agent** - they will be executed programmatically in iterative runs
- Each follow-up MUST be detailed and specific - include context, file references, and what needs to be done
- Follow-ups will be used for iterative execution, so they must contain enough information for the agent to execute them programmatically
- **Remove completed follow-ups** from the list
- **Add new follow-ups** that arise during execution (must be agent-actionable)
- **If hard blockers were resolved:** After resolving hard blockers, you MUST add a follow-up to continue with the remaining work that was blocked. For example: "Continue with remaining plan steps that were blocked by [blocker description]"

**What makes a good follow-up (agent-actionable):**
- Running tests, linting, or other automated checks: "Run full test suite to verify no regressions were introduced"
- Code changes the agent can make: "Add rate limiting to authentication middleware in \`src/middleware/auth.ts\`"
- Documentation updates: "Update API documentation in \`docs/api.md\` to reflect new endpoint at \`/api/v2/users\`"
- Automated verification: "Run accessibility audit using \`npm run a11y:check\`"
- Dependency updates: "Update \`package.json\` dependencies to latest compatible versions"

**What does NOT make a good follow-up (requires manual human intervention):**
- Manual verification across devices: "Verify UI changes on iPhone, iPad, and Android devices"
- Manual testing that can't be automated: "Manually test the checkout flow with a real credit card"
- Human review/approval: "Have a team member review the security implications"
- Manual deployment steps: "Deploy to staging and manually verify"
- Things requiring human judgment without automated tooling: "Check if the design looks good on mobile"

**Rule:** If a follow-up requires manual human intervention and there's no automated tooling to support it, it should NOT be included as a follow-up. Only include follow-ups that the agent can execute programmatically.

- If there are no follow-ups remaining, use "- None" or leave the section empty

**Execute Metadata JSON Schema:**

\`\`\`json
${metadataSchema}
\`\`\`

**Important:**
- The \`hasFollowUps\` boolean indicates whether the Follow-ups section in the execution summary has any items (set to \`true\` if there are any follow-ups listed, even if just one, or \`false\` if all follow-ups are complete)
- Hard blockers should be rare - only include them when execution absolutely cannot continue without user intervention
- Each hard blocker must have a clear \`description\` and \`reason\` explaining why it prevents continuation
- The \`summary\` field must contain a brief terminal-friendly summary (1-2 paragraphs worth of text) of what was accomplished in this follow-up execution
  - Use plain text (no markdown formatting)
  - Suitable for terminal display
  - Summarize the key work completed: what follow-up items were addressed, files modified, and any notable achievements`,
    description: 'Template for executing follow-up items from a previous execution',
    requiredVariables: ['executionSummaryPath', 'outputDirectory', 'executionIteration', 'followUpIteration'],
  };
}
