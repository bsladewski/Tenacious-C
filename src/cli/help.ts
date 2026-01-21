/**
 * CLI Help Text
 *
 * Help and usage text for the CLI
 */

/** Get the usage text */
export function getUsageText(): string {
  return `Usage: tenacious-c <prompt|file-path> [options]

Options:
  --max-plan-iterations <number>      Maximum number of plan revisions (default: 10)
  --plan-confidence <number>          Minimum confidence threshold (0-100) (default: 85)
  --max-follow-up-iterations <number> Maximum number of follow-up execution iterations (default: 10)
  --exec-iterations <number>          Maximum number of plan-based execution iterations (default: 5)
  --cli-tool <tool>                   CLI tool to use (codex|copilot|cursor|claude|mock)
  --plan-cli-tool <tool>              CLI tool for plan generation (overrides --cli-tool)
  --execute-cli-tool <tool>           CLI tool for execution (overrides --cli-tool)
  --audit-cli-tool <tool>             CLI tool for gap audits (overrides --cli-tool)
  --plan-model <model>                Model to use for plan generation (optional)
  --execute-model <model>             Model to use for execution (optional)
  --audit-model <model>               Model to use for gap audits (optional)
  --fallback-cli-tools <tools>        Comma-separated list of fallback CLI tools
  --preview-plan                      Preview the initial plan before execution
  --resume                            Resume the most recent interrupted run
  --the-prompt-of-destiny             Override all iteration limits - continue until truly done
  --nemesis                           Enable nemesis mode for more adversarial gap audits
  --mock                              Use mock CLI tool for testing (no AI costs)
  --mock-config <json|file>           Mock tool configuration (JSON string or file path)
  --no-interactive                    Disable interactive prompts; use defaults or fail
  --verbose                           Enable verbose output with more progress details
  --debug                             Enable debug mode with full diagnostics
  --json                              Output machine-readable JSON summary
  -h, --help                          Show this help message
  -v, --version                       Show version number

Examples:
  tenacious-c "Add user authentication"
  tenacious-c requirements.txt
  tenacious-c "Add user authentication" --max-plan-iterations 5
  tenacious-c "Add user authentication" --plan-confidence 90
  tenacious-c "Add user authentication" --cli-tool cursor
  tenacious-c "Add user authentication" --plan-cli-tool codex --execute-cli-tool claude
  tenacious-c "Add user authentication" --preview-plan
  tenacious-c --resume
  tenacious-c "Test task" --mock`;
}

/** Print usage to stderr and exit */
export function printUsage(): void {
  console.error(getUsageText());
}
