# Tenacious‑C Engineering Guide (v2)
*Comprehensive best practices for building and maintaining a high‑quality, long‑lived CLI orchestrator*

This document is the **permanent engineering and contribution standard** for Tenacious‑C. It is intended for **human and AI contributors** and should remain valid even as the codebase evolves.

It is **not** a refactor plan. It is a **quality contract**: if changes follow this guide, Tenacious‑C should remain reliable, testable, secure, and maintainable.

---

## 1. What Tenacious‑C is (and is not)

### What it is
Tenacious‑C is a CLI orchestrator that runs AI coding engines (e.g., cursor, copilot, claude, codex) through a repeatable loop driven by **artifacts** (plans, followups, audits) until completion and quality gates pass.

### What it is not
- Not a monolithic “AI does everything” script.
- Not a collection of one-off subprocess calls glued together by ad‑hoc logic.
- Not an interactive REPL for arbitrary prompts (interactivity is allowed only where designed).

---

## 2. Quality principles

### 2.1 Functional core, imperative shell
- Keep orchestration logic **pure** where possible (inputs → outputs).
- Isolate IO (filesystem, subprocess, network, prompts, TTY) behind interfaces.
- Unit tests should focus on the functional core with minimal mocking.

### 2.2 One source of truth: artifacts as state
- Decisions should be driven by structured JSON artifacts, not by parsing markdown.
- Markdown reports exist for humans and AI agents; JSON artifacts exist for program logic.

### 2.3 Deterministic-by-default
- Same inputs should produce the same outputs whenever practical.
- Randomness must be injectable and test-controlled.
- Order of file writes, iteration counters, and artifact versioning should be predictable.

### 2.4 Make illegal states unrepresentable
Use TypeScript types and schema validation to prevent invalid combinations:
- discriminated unions for step/mode types
- literal unions/enums for statuses and outcomes
- explicit config types with validated defaults

### 2.5 Small modules, low complexity
- Avoid long functions and high cyclomatic complexity.
- Prefer small, composable functions with single responsibility.

---

## 3. Repository architecture standards

### 3.1 Recommended structure (adapt as needed, keep boundaries)
- `src/cli/` — command definitions, arg parsing, help/version
- `src/config/` — config resolution, defaults, precedence, persistence
- `src/core/` — state machine, iteration policies, orchestration logic
- `src/engines/` — engine adapters, normalized execution results
- `src/io/` — filesystem abstraction, artifact read/write, path utilities
- `src/ui/` — interactive prompting and TTY-only UX
- `src/validation/` — schema validation, invariants, contract checks
- `src/logging/` — structured logs, transcripts, run summaries
- `src/types/` — shared types and interfaces
- `tests/` — unit + integration tests

### 3.2 Layering rules (hard rules)
- `core/` must not import from `ui/`.
- `core/` must not spawn processes directly; it calls an injected `ProcessRunner`.
- `engines/` must not prompt the user.
- `validation/` must not do IO other than reading provided inputs.

### 3.3 Dependency hygiene
- Prefer explicit imports and avoid circular dependencies.
- Avoid “god modules” and “utils dumping grounds.” Put helpers in domain folders.

---

## 4. CLI UX and interface contract

A high-quality CLI feels predictable and scriptable.

### 4.1 Output channels
- **stdout**: primary user output and machine-readable output (if any).
- **stderr**: errors, warnings, diagnostics.
- Never print secrets or tokens (see Security).

### 4.2 TTY vs non-TTY
- Spinners, interactive prompts, and dynamic rendering are **TTY-only**.
- In non-TTY mode:
  - do not use ora spinners
  - print concise progress events (or support `--quiet`)
- Provide `--no-interactive` (or `--no-input`) to disable prompting.

### 4.3 Verbosity levels
Support predictable verbosity:
- default: concise, human-friendly
- `--verbose`: more progress + context
- `--debug`: full diagnostics (and possibly more logs)
- `--json`: machine-readable summary output (optional but recommended)

### 4.4 Exit codes
Define stable exit codes and document them. Example:
- `0` success
- `2` invalid CLI usage / missing requirements
- `3` artifact schema/contract validation failed
- `4` iteration limit exceeded / did not converge
- `5` engine invocation failed
- `1` unexpected/unhandled error

### 4.5 Human interactivity rule
- Interactivity is allowed in **planning** (open questions, blockers).
- Execution/audit/gap workflows should avoid human input unless truly blocked.
- Always support skipping prompts and continuing with assumptions where safe.

---

## 5. Configuration standards

### 5.1 Single config resolution pass
Resolve config once at startup into an `EffectiveConfig` object and pass it down.

### 5.2 Precedence order (must be explicit)
Recommended precedence:
1) CLI flags
2) per-run config (if supported)
3) repo config (checked into repo)
4) user config (home directory)
5) built-in defaults

### 5.3 Persisted defaults vs per-run settings
Be clear about what Tenacious‑C persists:
- Persisting the chosen engine/tool is acceptable.
- Persisting expensive model choices should be explicit and opt-in.
- Always allow per-stage overrides (plan/execute/audit).

### 5.4 “Effective config” artifact
Write a run artifact that records the resolved config used for that run:
- enables reproducibility and debugging
- should redact secrets

---

## 6. Orchestration and state machine standards

### 6.1 Explicit state machine
Model orchestration as state transitions:
- PLAN_LOOP → EXECUTE_LOOP → AUDIT → (GAP_PLAN → EXECUTE_LOOP)* → DONE
Transitions should be in one place (core), not spread across adapters.

### 6.2 Iteration policies
- Centralize stop conditions and iteration limits in `core/iterationPolicy`.
- Always produce a clear outcome when limits are reached:
  - emit a summary artifact and non-zero exit code
  - explain next steps to the user

### 6.3 Resume semantics
Long runs must be resumable without corruption:
- run directory structure must be stable
- artifacts must be versioned and immutable once written
- track the “latest” artifact pointers via a small index (optional but recommended)

---

## 7. Artifacts, schemas, and contracts

### 7.1 JSON is for decisions; Markdown is for humans
- Never parse markdown reports for control flow.
- JSON artifacts must contain all needed machine-readable signals:
  - open questions
  - confidence
  - blockers/followups
  - pass/fail + coverage of requirements
  - implementation evidence

### 7.2 Schema validation (non-negotiable)
- Validate JSON artifacts on read and write.
- Consider embedding `schemaVersion` for forward compatibility.

### 7.3 Atomic writes
- Write JSON/markdown to a temp file, then rename.
- Never leave partially-written artifacts.
- Prefer deterministic file naming with version increments (`-v2`, `iter-003`, etc.).

### 7.4 Evidence fields
To prevent “analysis-only” regressions, artifacts should include evidence such as:
- touched files list/count
- validation commands run and status
- critical blockers (rare) and why

---

## 8. Engine adapter standards

### 8.1 Common engine interface
All engines implement a shared interface, e.g.:
- `Engine.run({ mode, systemPromptPath, userMessage, cwd, env, model? }) → EngineResult`

### 8.2 Normalized EngineResult
Return a standardized shape:
- `exitCode`
- `stdoutTranscriptPath` / `stderrTranscriptPath` (or one combined transcript)
- `stderrTail` / `stdoutTail` (or combined tail lines)
- `durationMs`
- `invocation` metadata (command, args, sanitized env)
- `modelUsed` (if discoverable)

### 8.3 Subprocess safety
- Prefer `spawn(command, args, { shell: false })` to avoid shell injection.
- Never interpolate untrusted strings into shell commands.
- Timeouts should be configurable.
- Handle SIGINT/SIGTERM: terminate child processes and flush artifacts.

### 8.4 Output UX policy
- Do not flood the terminal with raw engine output by default.
- Prefer a spinner with a small tail display (e.g., last N lines) in TTY.
- In debug mode, optionally stream full output.

---

## 9. Security and privacy

Tenacious‑C operates on source repositories and may see secrets.

### 9.1 Secret handling
- Never log environment variables wholesale.
- Never print API keys or tokens.
- Redact common secret patterns in logs (best-effort).

### 9.2 Prompt injection resilience
Treat repository content as **untrusted input**:
- do not execute arbitrary commands suggested by model output without policy checks
- avoid “run this curl | bash” patterns
- keep allowed commands limited and explicit where possible

### 9.3 Filesystem safety
- Prevent path traversal when writing artifacts (sanitize filenames/paths).
- Avoid writing outside the run directory unless explicitly requested.

### 9.4 Dependency safety
- Pin dependency versions where feasible.
- Keep dependencies minimal; avoid unnecessary runtime deps.
- Periodically audit dependencies.

---

## 10. Testing standards

### 10.1 Testing pyramid
1) **Unit tests** (highest priority)
2) **Integration tests** (CLI + state machine in temp repo)
3) **E2E tests** (optional, gated; real engines)

### 10.2 Unit testing priorities (must-have)
- config resolution and precedence
- artifact path generation/versioning
- schema validation behavior
- iteration policies and stop conditions
- transition logic of the state machine
- wrapper message generation (ensures correct mode semantics)

### 10.3 Integration testing priorities
- run CLI against a temp directory with a **fake engine**
- verify artifacts and loop behavior end-to-end

### 10.4 Testability requirements
To be testable, code must:
- depend on injected interfaces (`FileSystem`, `ProcessRunner`, `Prompter`, `Clock`, `Logger`)
- keep pure transformation functions separate from IO

---

## 11. Logging, observability, and diagnostics

### 11.1 Structured event logging
Emit structured events for major lifecycle points:
- run started
- iteration started/ended
- engine invocation started/ended
- artifact written/validated
- stop condition met / exceeded

Always include:
- runId
- phase/iteration
- mode (plan/execute/audit/gap)

### 11.2 Run summary artifact
Every run should end with a summary artifact (JSON recommended) that includes:
- selected engines/models (effective config)
- iteration counts per loop
- success/failure and reason
- pointers to key artifacts

### 11.3 Debug bundles
Provide a way to package relevant artifacts and logs for troubleshooting:
- redact secrets
- include run summary and transcripts

---

## 12. Performance and long-running stability

### 12.1 Avoid unbounded growth
- cap transcript sizes or rotate logs (configurable)
- avoid holding huge strings in memory; stream to file

### 12.2 Timeouts and retry policy
- allow per-engine timeouts
- retry only on well-defined transient failures
- record retries in logs/artifacts

---

## 13. Code style and review standards

### 13.1 TypeScript and formatting
- use strict TS
- avoid `any`
- keep formatting automated and enforced in CI

### 13.2 Error handling
- expected errors should be typed or represented as `Result` objects in core logic
- convert to user-friendly messages at the CLI boundary
- always include actionable remediation hints

### 13.3 Review checklist (required)
Before merging:
- [ ] Layering rules respected
- [ ] Core logic has unit tests (or justified exception)
- [ ] Artifacts schema-valid and written atomically
- [ ] No new duplication
- [ ] Secrets not logged
- [ ] Run summary updated if behavior changes

---

## 14. AI contributor guidelines

AI contributors are welcome, but must follow the same rules:
- preserve schemas/contracts
- prefer small, reviewable diffs
- no analysis-only regressions
- determinism over cleverness

---

## 15. Definition of “Done” for changes
A change is done when:
- behavior is correct and documented
- artifacts are valid and atomic
- tests cover core logic changes
- CLI UX remains consistent
- security/privacy rules upheld

---

## 16. North-star checklist
Tenacious‑C should always be able to:
- run deterministically on a clean repo
- resume safely after interruption
- validate its own artifacts
- provide a concise run summary and clear failure reason
- operate without leaking secrets
- remain testable with fake engines and in-memory IO
- support new engines via adapters without touching core logic
