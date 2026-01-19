/**
 * Orchestration module - wires together core, engines, io, ui, and logging
 * This module provides the high-level entry points for running orchestration
 */

// Orchestrator factory
export {
  OrchestratorFactoryOptions,
  MockOrchestratorFactoryOptions,
  MockOrchestratorResult,
  LegacyConfigOptions,
  cliToolTypeToName,
  cliToolNameToType,
  legacyOptionsToEffectiveConfig,
  createRealDependencies,
  createMockDependencies,
  createProductionOrchestrator,
  createOrchestratorFromLegacyOptions,
  createMockOrchestrator,
  createTestConfig,
} from './orchestrator-factory';
