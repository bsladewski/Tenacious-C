# Tenacious C

An intelligent, iterative AI-powered development tool that generates comprehensive plans and executes them using AI CLI tools (Codex, GitHub Copilot, Cursor, or Claude Code). Tenacious C runs in "YOLO" mode, allowing AI tools to modify files and run commands without prompting for permission, making it ideal for iterative task completion.

## Features

- **Intelligent Planning**: Generates detailed, structured plans with confidence scoring
- **Iterative Refinement**: Automatically refines plans through question-answering and confidence-based improvements
- **Plan Execution**: Executes plans with automatic follow-up iterations to handle blockers
- **Plan-Only Mode**: Option to generate and refine plans without execution, useful for review and manual execution
- **Gap Analysis**: Performs gap audits and generates gap closure plans when execution reveals missing requirements
- **Nemesis Mode**: Optional adversarial gap audit mode for maximum thoroughness in defect detection
- **Multi-Tool Support**: Works with the Codex CLI, GitHub Copilot CLI, Cursor CLI, and Claude Code CLI
- **Smart Tool Selection**: Auto-detects available tools and remembers your preference
- **The Prompt of Destiny**: Override all limits to continue until truly done

## Installation

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn package manager
- One of the following AI CLI tools:
  - [Codex CLI](https://github.com/codex-cli/codex) installed and configured
  - [GitHub Copilot CLI](https://github.com/github/copilot-cli) installed via `npm install -g @github/copilot`
    - **Important**: Before using Copilot CLI in non-interactive mode, you must enable a model by running `copilot --model <model-name>` in interactive mode first. For example: `copilot --model gpt-5.1-codex` or `copilot --model claude-haiku-4.5`
  - [Cursor CLI](https://docs.cursor.com/en/cli) (cursor-agent) installed via `curl https://cursor.com/install -fsS | bash`
  - [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/quickstart) installed via `npm install -g @anthropic-ai/claude-code`

### Install from Local Source

1. Clone or navigate to this repository:
   ```bash
   cd /path/to/tenacious-c
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Install the tool globally using npm link:
   ```bash
   npm link
   ```

   This will make the `tenacious-c` command available in your terminal.

### Verify Installation

Run the tool without arguments to see usage information:
```bash
tenacious-c
```

## Usage

The `tenacious-c` command generates comprehensive plans and executes them using AI CLI tools. You can provide requirements either as a string prompt or by referencing a file.

### Basic Usage

**With a string prompt:**
```bash
tenacious-c "Add user authentication with JWT tokens to the Express backend"
```

**With a file:**
```bash
tenacious-c requirements.txt
```

### Command-Line Options

#### `--max-plan-iterations <number>`

Controls the maximum number of plan revisions. The tool uses an iterative approach to refine plans through question-answering and confidence-based improvements.

**Default:** `10`

**Example:**
```bash
tenacious-c "Add user authentication" --max-plan-iterations 5
```

#### `--plan-confidence <number>`

Sets the minimum confidence threshold (0-100) that the plan must meet before completion. If the plan's confidence is below this threshold, the tool will automatically trigger plan improvement revisions.

**Default:** `85`

**Example:**
```bash
tenacious-c "Add user authentication" --plan-confidence 90
```

#### `--max-follow-up-iterations <number>`

Maximum number of follow-up execution iterations. After initial plan execution, the tool can perform follow-up iterations to address blockers and complete remaining work.

**Default:** `10`

**Example:**
```bash
tenacious-c "Add user authentication" --max-follow-up-iterations 15
```

#### `--exec-iterations <number>`

Maximum number of plan-based execution iterations. The tool can execute the plan multiple times, performing gap audits and generating gap closure plans between iterations.

**Default:** `5`

**Example:**
```bash
tenacious-c "Add user authentication" --exec-iterations 3
```

#### `--cli-tool <codex|copilot|cursor|claude>`

Explicitly specify which CLI tool to use for all operations. If not specified, the tool will:
1. Check for a saved preference in `.tenacious-c/cli-tool-preference.json`
2. Auto-detect available tools
3. If only one is available, use it automatically
4. If multiple are available, prompt you to select one

**Example:**
```bash
tenacious-c "Add user authentication" --cli-tool copilot
tenacious-c "Add user authentication" --cli-tool cursor
tenacious-c "Add user authentication" --cli-tool claude
```

**Note:** This preference is saved for future runs. To use different tools for different phases, use the phase-specific flags below.

#### `--plan-cli-tool <codex|copilot|cursor|claude>`

Specify which CLI tool to use for plan generation and revisions. This overrides `--cli-tool` for planning operations only. This preference is **not saved** (unlike `--cli-tool`).

**Example:**
```bash
tenacious-c "Add user authentication" --plan-cli-tool codex
```

#### `--execute-cli-tool <codex|copilot|cursor|claude>`

Specify which CLI tool to use for plan execution and follow-up iterations. This overrides `--cli-tool` for execution operations only. This preference is **not saved** (unlike `--cli-tool`).

**Example:**
```bash
tenacious-c "Add user authentication" --execute-cli-tool claude
```

#### `--audit-cli-tool <codex|copilot|cursor|claude>`

Specify which CLI tool to use for gap audits. This overrides `--cli-tool` for audit operations only. This preference is **not saved** (unlike `--cli-tool`).

**Example:**
```bash
tenacious-c "Add user authentication" --audit-cli-tool codex
```

#### `--plan-model <model>`

Specify which model to use for plan generation and revisions. This is optional and depends on the CLI tool's model support.

**Example:**
```bash
tenacious-c "Add user authentication" --plan-model sonnet-4.5
```

#### `--execute-model <model>`

Specify which model to use for plan execution and follow-up iterations. This is optional and depends on the CLI tool's model support.

**Example:**
```bash
tenacious-c "Add user authentication" --execute-model opus-4.5-thinking
```

#### `--audit-model <model>`

Specify which model to use for gap audits. This is optional and depends on the CLI tool's model support.

**Example:**
```bash
tenacious-c "Add user authentication" --audit-model gpt-5.2-codex
```

**Combined Example:**
```bash
tenacious-c "Add user authentication" \
  --plan-cli-tool codex --plan-model sonnet-4.5 \
  --execute-cli-tool claude --execute-model opus-4.5-thinking \
  --audit-cli-tool codex --audit-model gpt-5.2-codex
```

#### `--fallback-cli-tools <tool1,tool2,...>`

Specify a comma-separated list of fallback CLI tools to try if the primary tool fails after exhausting its retry attempts. This provides resilience against rate limiting and connectivity issues.

When a CLI tool fails after retries, Tenacious C will:
1. Try the next tool in the fallback list
2. Clear the model configuration for that phase (since the fallback tool may not support the same models)
3. Continue execution with the fallback tool

**Important:** Fallback is phase-specific. If the execute tool fails, only the execute phase switches to the fallback tool - other phases continue using their configured tools.

**Default:** No fallback tools (empty list)

**Example:**
```bash
# Simple fallback from claude to codex to cursor
tenacious-c "Add user authentication" --cli-tool claude --fallback-cli-tools codex,cursor

# Complex configuration with phase-specific tools and fallback
tenacious-c "Add user authentication" \
  --plan-cli-tool copilot --plan-model gpt-5.2 \
  --execute-cli-tool claude --execute-model opus-4.5 \
  --audit-cli-tool codex \
  --fallback-cli-tools codex,cursor
# If Claude fails during execution, switches to codex (model cleared)
# Copilot continues for planning, Codex continues for audits
```

#### `--preview-plan`

Preview the initial plan markdown file before proceeding to execution. The tool will display the plan using the best available viewer (glow if available, otherwise less, or cat as fallback). Press 'q' to exit the viewer and continue.

**Example:**
```bash
tenacious-c "Add user authentication" --preview-plan
```

#### `--resume`

Resume the most recent interrupted run. The tool automatically saves execution state at key checkpoints, allowing you to resume after crashes, connectivity issues, or power loss. When resuming, the tool will:

- Find the most recent incomplete run
- Display the phase and progress information
- Continue from where it left off

**Example:**
```bash
tenacious-c --resume
```

**Note:** The tool saves state after each major phase (plan generation, execution, gap audit, gap plan). If a run is interrupted, use `--resume` to continue without losing progress.

#### `--plan-only`

Skip execution phase and stop after plan generation is complete. When enabled, the tool will:

- Generate and refine the plan as normal (including question-answering and confidence-based improvements)
- Skip the execution phase entirely
- Copy the final plan to the working directory as `plan_<timestamp>.md`
- Generate a final summary and exit

This mode is useful when you want to:
- Review plans before execution
- Generate plans for manual execution
- Test plan generation without incurring execution costs
- Create plans for documentation or review purposes

**Example:**
```bash
tenacious-c "Add user authentication" --plan-only
```

**Note:** In plan-only mode, the tool will still go through the full plan refinement process (answering questions, improving confidence) but will skip all execution, follow-up, and gap audit phases.

#### `--the-prompt-of-destiny`

Override all iteration limits. When enabled, the tool will continue iterating until the plan is truly complete, regardless of limits.

**Example:**
```bash
tenacious-c "Add user authentication" --the-prompt-of-destiny
```

#### `--nemesis`

Enable nemesis mode for more adversarial gap audits. When enabled, gap audits use a more skeptical, adversarial approach that:

- Assumes the implementation may have been optimized for "passing" rather than correctness
- Actively searches for missing requirements coverage, incorrect behavior, and hidden regressions
- Treats ambiguous areas as high-risk and attempts to disambiguate by reading repository docs, contracts, tests, and code
- Requires deeper audit depth with concrete implementation evidence, edge case identification, and integration point verification
- Produces additional outputs including a Risk Register and Defect Hypothesis List

This mode is useful when you want to ensure maximum thoroughness in gap detection, especially when auditing implementations from external systems or when you need to catch subtle defects that might be missed in a standard audit.

**Example:**
```bash
tenacious-c "Add user authentication" --nemesis
```

**Note:** Nemesis mode only affects gap audits. Planning and execution phases are not affected.

#### `--mock`

Enable mock mode for testing. Mock mode simulates the full execution workflow without calling real AI tools, making it ideal for:
- Testing the tool's workflow and logic
- Development and debugging
- Learning how the tool works
- Avoiding AI API costs during testing

When mock mode is enabled, the tool generates realistic file outputs (plan.md, plan-metadata.json, execute-metadata.json, etc.) to simulate a complete execution cycle.

**Example:**
```bash
tenacious-c "Add user authentication" --mock
```

#### `--mock-config <json|file>`

Configure mock mode behavior. You can provide either a JSON string or a path to a JSON file containing mock configuration options.

**Configuration Options:**
- `openQuestionIterations` (number, default: 2) - Number of times to output open questions before stopping
- `planRevisionIterations` (number, default: 2) - Number of low-confidence plan revisions before reaching threshold
- `executionIterations` (number, default: 2) - Number of execution iterations (gap audit cycles)
- `followUpIterations` (number, default: 2) - Number of follow-up iterations per execution before completing
- `hardBlockers` (boolean, default: false) - Whether to output hard blockers on the first plan execution
- `targetConfidence` (number, default: 85) - Confidence threshold to eventually reach (should match --plan-confidence)
- `startingConfidence` (number, default: 60) - Starting confidence (should be below threshold)

**Example with JSON string:**
```bash
tenacious-c "Add user authentication" --mock --mock-config '{"openQuestionIterations": 1, "hardBlockers": true}'
```

**Example with config file:**
```bash
# Create mock-config.json
cat > mock-config.json << EOF
{
  "openQuestionIterations": 1,
  "planRevisionIterations": 1,
  "executionIterations": 1,
  "followUpIterations": 1,
  "hardBlockers": true,
  "targetConfidence": 85,
  "startingConfidence": 60
}
EOF

# Use the config file
tenacious-c "Add user authentication" --mock --mock-config mock-config.json
```

**Note:** Mock mode is automatically selected when you use `--mock` or `--cli-tool mock`. It generates realistic outputs to enable end-to-end testing of the full workflow without calling real AI tools.

#### `--no-interactive`

Disable interactive prompts and use defaults or fail if input is required. This is useful for scripted execution where user interaction is not possible.

**Example:**
```bash
tenacious-c "Add user authentication" --no-interactive
```

**Note:** When enabled, the tool will skip prompts for open questions and hard blockers, which may result in incomplete plans or execution failures.

#### `--verbose`

Enable verbose output with more progress details. Shows additional information about what the tool is doing at each step.

**Example:**
```bash
tenacious-c "Add user authentication" --verbose
```

#### `--debug`

Enable debug mode with full diagnostics. Includes detailed logging, stack traces, and internal state information.

**Example:**
```bash
tenacious-c "Add user authentication" --debug
```

#### `--json`

Output machine-readable JSON summary at the end of execution. The summary includes execution statistics, artifact paths, and completion status.

**Example:**
```bash
tenacious-c "Add user authentication" --json
```

## How It Works

### Workflow Overview

Tenacious C follows a comprehensive workflow to ensure thorough plan generation and execution:

1. **Plan Generation**: Creates an initial plan based on your requirements
2. **Iterative Refinement**: Refines the plan through multiple iterations:
   - **Question-Answering Loop**: Prompts you to answer open questions
   - **Confidence-Based Improvement**: Automatically deepens the plan if confidence is below threshold
3. **Plan Execution** (optional with `--plan-only`): Executes the plan using the selected AI CLI tool
4. **Follow-Up Iterations**: Performs follow-up work to address blockers
5. **Gap Analysis**: If gaps are found, performs gap audits and generates gap closure plans
6. **Iterative Execution**: Repeats execution cycles until completion

**Note:** With `--plan-only`, the workflow stops after step 2, skipping all execution phases and copying the final plan to the working directory.

### Execution Engine

Tenacious C uses an Orchestrator-based execution engine with an explicit state machine. This provides:
- Better state tracking and resumability
- More reliable error handling
- Clearer state transitions
- Improved debugging capabilities

The orchestrator automatically saves execution state at key checkpoints, allowing you to resume interrupted runs with `--resume`.

### Plan Generation & Refinement

The tool generates structured plans with the following sections:

- **Requirements Snapshot**: Key goals and constraints
- **Scope**: Target areas, in-scope and out-of-scope items
- **Non-goals**: Explicit exclusions
- **Assumptions**: Key assumptions
- **Success Criteria**: Testable completion criteria
- **Implementation Plan**: Step-by-step approach with file changes
- **Testing Plan**: Testing strategy

Plans are refined iteratively:

1. **Question-Answering**: If the plan has open questions:
   - You're prompted to answer each question interactively
   - Suggested answers are provided when available
   - Custom answers are supported
   - The plan is revised with your answers
   - Process repeats if new questions arise

2. **Confidence Improvement**: If confidence is below threshold:
   - Plan is automatically deepened with more detail
   - More comprehensive analysis is added
   - Confidence level is updated
   - Process repeats if still below threshold

### Plan Execution

Once a plan is complete (no open questions and confidence meets threshold), it's executed:

1. **Initial Execution**: The plan is executed using the selected AI CLI tool
2. **Hard Blocker Resolution**: If hard blockers are found:
   - You're prompted to resolve them
   - Execution continues after resolution
3. **Follow-Up Iterations**: Additional iterations handle remaining work
4. **Gap Analysis**: If execution reveals gaps:
   - Gap audit is performed
   - Gap closure plan is generated
   - Gap plan is executed
   - Process repeats until no gaps remain

### Output Structure

All outputs are stored in `.tenacious-c/<timestamp>/` where `<timestamp>` is an ISO-formatted timestamp (e.g., `2024-01-15_14-30-45`).

**Plan outputs:**
- `.tenacious-c/<timestamp>/plan/plan.md` - The planning document
- `.tenacious-c/<timestamp>/plan/plan-metadata.json` - Metadata including confidence and open questions

**Execution outputs:**
- `.tenacious-c/<timestamp>/execute/` or `.tenacious-c/<timestamp>/execute-<iteration>/` - Execution outputs for each iteration
  - `execution-summary-<iteration>.md` - Execution summary markdown
  - `execution-summary-<iteration>-followup-<n>.md` - Follow-up iteration summaries
  - `execute-metadata.json` - Execution metadata with blockers and follow-up status
- `.tenacious-c/<timestamp>/gap-audit/` or `.tenacious-c/<timestamp>/gap-audit-<iteration>/` - Gap audit outputs
  - `gap-audit-summary-<iteration>.md` - Gap audit summary markdown
  - `gap-audit-metadata.json` - Gap audit metadata with gaps identified
- `.tenacious-c/<timestamp>/gap-plan/` or `.tenacious-c/<timestamp>/gap-plan-<iteration>/` - Gap closure plan outputs
  - `gap-plan-<iteration>.md` - Gap closure plan markdown
  - `plan-metadata.json` - Plan metadata for gap closure plan

**State and metadata:**
- `.tenacious-c/<timestamp>/execution-state.json` - Execution state for resume functionality
- `.tenacious-c/<timestamp>/requirements.txt` - Original requirements
- `.tenacious-c/<timestamp>/qa-history.txt` - Question-answer history

**Preferences:**
- `.tenacious-c/cli-tool-preference.json` - Saved CLI tool preference

## CLI Tool Selection

Tenacious C supports Codex CLI, GitHub Copilot CLI, Cursor CLI, Claude Code CLI, and Mock mode (for testing). The tool automatically detects which tools are available and manages your preference.

### Auto-Detection

On first run (or when no preference is saved):
- If only Codex is available → uses Codex automatically
- If only Copilot is available → uses Copilot automatically
- If only Cursor is available → uses Cursor automatically
- If only Claude is available → uses Claude automatically
- If multiple are available → prompts you to select one

**Note:** Mock mode is not auto-detected. You must explicitly enable it with `--mock` or `--cli-tool mock`.

Your selection is saved in `.tenacious-c/cli-tool-preference.json` for future runs.

### Manual Selection

You can explicitly specify a tool using `--cli-tool`:
```bash
tenacious-c "Add feature" --cli-tool copilot
tenacious-c "Add feature" --cli-tool cursor
tenacious-c "Add feature" --cli-tool claude
tenacious-c "Add feature" --cli-tool mock
```

**Note:** Using `--cli-tool mock` is equivalent to using `--mock`. Mock mode simulates the full workflow without calling real AI tools.

This will also save your preference for future runs.

### Phase-Specific Tool Selection

You can use different CLI tools for different phases of the workflow:

- `--plan-cli-tool` - Use a specific tool for plan generation and revisions
- `--execute-cli-tool` - Use a specific tool for plan execution and follow-ups
- `--audit-cli-tool` - Use a specific tool for gap audits

These phase-specific flags override `--cli-tool` for their respective phases and are **not saved** as preferences. This allows you to use different tools for different operations without changing your default preference.

**Example:**
```bash
# Use Codex for planning, Claude for execution, Codex for audits
tenacious-c "Add feature" \
  --plan-cli-tool codex \
  --execute-cli-tool claude \
  --audit-cli-tool codex
```

### Model Selection

Some CLI tools support specifying which model to use. You can specify models for each phase:

- `--plan-model` - Model for plan generation and revisions
- `--execute-model` - Model for plan execution and follow-ups
- `--audit-model` - Model for gap audits

**Example:**
```bash
tenacious-c "Add feature" \
  --plan-model sonnet-4.5 \
  --execute-model opus-4.5-thinking \
  --audit-model gpt-5.2-codex
```

### Fallback and Retry Behavior

Tenacious C includes built-in resilience for handling CLI tool failures:

**Retry Logic:** Each CLI tool automatically retries twice (3 total attempts) with a 10-second delay between retries. This handles transient issues like rate limiting and connectivity problems.

**Fallback Support:** If retries are exhausted and a fallback list is configured with `--fallback-cli-tools`, the tool will:
1. Switch to the next available fallback tool for that phase
2. Clear any model configuration for that phase (fallback tools may not support the same models)
3. Continue execution

Fallback is phase-specific - if execution fails, only the execution phase switches to fallback while planning and auditing continue using their original tools.

**Example:**
```bash
# Primary: claude with opus-4.5 for execution
# Fallback: codex, then cursor
tenacious-c "Add feature" \
  --cli-tool claude \
  --execute-model opus-4.5 \
  --fallback-cli-tools codex,cursor
```

If Claude fails and exhausts retries, execution switches to Codex (without the opus-4.5 model). If Codex also fails, it switches to Cursor.

### Tool Behavior

All tools run in "YOLO" mode:
- **Codex**: Uses `codex exec --dangerously-bypass-approvals-and-sandbox`
- **Copilot**: Uses `copilot -p <prompt> --yolo` (enables all permissions for non-interactive execution)
- **Cursor**: Uses `cursor-agent -p <prompt> --force` (force allows commands without approval)
- **Claude**: Uses `claude -p <prompt> --dangerously-skip-permissions` (bypasses all permission checks)
- **Mock**: Generates realistic file outputs without calling real AI tools (for testing)

All tools execute prompts in the background with loading indicators.

## Development

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

This builds and runs the tool in one command.

### Project Structure

```
src/
  cli/                         # CLI argument parsing and help
    arg-parser.ts              # Command-line argument parser
    help.ts                    # Help text generation
    types.ts                   # CLI type definitions
  commands/                    # Command implementations
    orchestrator-plan.ts       # Orchestrator-based plan execution (default)
  config/                      # Configuration management
    cli-tool-preference.ts     # CLI tool preference persistence
    resolve-config.ts           # Configuration resolution
    write-effective-config.ts  # Effective config artifact writing
  core/                        # Core orchestration logic
    orchestrator.ts            # Main orchestrator class
    state-machine.ts            # State machine implementation
    iteration-policy.ts         # Iteration stop conditions
    create-execution-state.ts  # Execution state creation
    sync-state-with-artifacts.ts # State synchronization
  engines/                     # AI engine adapters
    engine-adapter.ts           # Base engine adapter interface
    cursor-adapter.ts           # Cursor CLI adapter
    copilot-adapter.ts          # Copilot CLI adapter
    claude-adapter.ts           # Claude Code CLI adapter
    codex-adapter.ts            # Codex CLI adapter
    mock-adapter.ts             # Mock adapter for testing
    get-cli-tool.ts             # CLI tool selection logic
    detect-cli-tools.ts         # Tool availability detection
    execute-with-fallback.ts    # Fallback execution logic
  io/                          # File I/O and artifact management
    file-naming.ts              # Artifact file naming utilities
    find-latest-run.ts          # Find latest execution run
    load-execution-state.ts     # Load execution state for resume
    save-execution-state.ts     # Save execution state
    read-metadata.ts            # Metadata reading utilities
    read-execute-metadata.ts    # Execution metadata reading
    read-gap-audit-metadata.ts  # Gap audit metadata reading
    scan-execution-artifacts.ts # Scan execution artifacts
    track-qa-history.ts         # Question-answer history tracking
    write-requirements.ts        # Requirements file writing
    real-file-system.ts         # Real filesystem implementation
    memory-file-system.ts       # In-memory filesystem for testing
  logging/                     # Logging and summaries
    buffer-logger.ts            # Buffered logger
    console-logger.ts           # Console logger
    generate-final-summary.ts   # Final summary generation
    run-summary.ts              # Run summary generation
  orchestration/               # Orchestrator factory and setup
    orchestrator-factory.ts     # Factory for creating orchestrators
  schemas/                     # JSON schemas and validators
    plan-metadata.schema.ts    # Plan metadata JSON schema
    execute-metadata.schema.ts  # Execution metadata schema
    gap-audit-metadata.schema.ts # Gap audit metadata schema
    execution-state.schema.ts  # Execution state schema
    validators.ts               # Schema validation utilities
  templates/                   # Prompt templates
    plan.template.ts            # Plan generation template
    answer-questions.template.ts # Question answering template
    improve-plan.template.ts    # Plan improvement template
    execute-plan.template.ts    # Plan execution template
    execute-follow-ups.template.ts # Follow-up execution template
    gap-audit.template.ts       # Gap audit template
    gap-plan.template.ts        # Gap closure plan template
    generate-summary.template.ts # Summary generation template
    prompt-template.ts          # Template system utilities
  types/                       # Type definitions
    ai-cli-tool.ts              # AI CLI tool interface
    execution-context.ts         # Execution context types
    effective-config.ts         # Effective configuration type
    engine-result.ts             # Engine execution result types
    exit-codes.ts                # Exit code definitions
    file-system.ts               # File system interface
    logger.ts                    # Logger interface
    process-runner.ts            # Process runner interface
    prompter.ts                  # Prompter interface
    clock.ts                     # Clock interface
  ui/                          # User interface components
    inquirer-prompter.ts        # Inquirer-based prompter
    prompt-cli-tool.ts           # CLI tool selection prompt
    prompt-questions.ts          # Question answering prompts
    prompt-hard-blockers.ts      # Hard blocker resolution prompts
    preview-plan.ts              # Plan preview functionality
    spinner-service.ts           # Loading spinner service
  index.ts                     # Main entry point
```

## Exit Codes

Tenacious C uses standardized exit codes to indicate execution results:

- `0` - **SUCCESS**: Successful execution
- `1` - **UNEXPECTED_ERROR**: Unexpected or unhandled error
- `2` - **USAGE_ERROR**: Invalid CLI usage or missing requirements
- `3` - **VALIDATION_ERROR**: Artifact schema or contract validation failed
- `4` - **LIMIT_EXCEEDED**: Iteration limit exceeded without convergence
- `5` - **ENGINE_ERROR**: Engine invocation failed

These exit codes can be used in scripts to determine the outcome of execution:

```bash
if tenacious-c "Add feature" --no-interactive; then
  echo "Success!"
else
  exit_code=$?
  case $exit_code in
    2) echo "Usage error - check your command" ;;
    3) echo "Validation error - check artifacts" ;;
    4) echo "Iteration limit reached" ;;
    5) echo "Engine error - check AI tool configuration" ;;
    *) echo "Unexpected error" ;;
  esac
fi
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
