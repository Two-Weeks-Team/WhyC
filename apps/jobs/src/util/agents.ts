// Typed loader for agents/v4-index.json — the sub-agent registry the v4
// pipeline dispatches by tag (see hooks/README.md and the registry file).
//
// Loaded at runtime (not `import … with { type: 'json' }`) so there's no
// dependency on import-attributes support in the toolchain. Cached after first
// read.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { _internals } from './memory.js';
import type { AdvocatePersona } from '../pipeline/types.js';

export interface AgentEntry {
  id: string;
  name: string;
  role: 'advocate' | 'synthesizer' | 'chooser' | 'critic' | 'introspector';
  persona?: AdvocatePersona;
  critic_axis?: 'pitch_alignment' | 'flows_present' | 'design_quality' | 'implementation' | 'security';
  model_tier: 'flash' | 'pro';
  tags: string[];
  bias: string;
  system_prompt_ref: string;
}

export interface AgentsIndex {
  version: string;
  stage_config: {
    analyze: { advocate_count: number; advocate_pool_tag: string; synth_tier: 'flash' | 'pro' };
    develop: { advocate_count: number; advocate_pool_tag: string; chooser_tier: 'flash' | 'pro' };
    judge: { critic_tag: string; panel_size: number };
  };
  agents: AgentEntry[];
}

let _cache: AgentsIndex | null = null;

export function agentsIndex(): AgentsIndex {
  if (_cache) return _cache;
  const path = join(_internals.ROOT, 'agents', 'v4-index.json');
  _cache = JSON.parse(readFileSync(path, 'utf8')) as AgentsIndex;
  return _cache;
}

/** All agents carrying every tag in `tags` (AND semantics). */
export function agentsByTags(...tags: string[]): AgentEntry[] {
  return agentsIndex().agents.filter((a) => tags.every((t) => a.tags.includes(t)));
}

/** The advocate roster for a stage, capped at `count` (deterministic order = registry order). */
export function advocatesForStage(stage: 'analyze' | 'develop', count?: number): AgentEntry[] {
  const cfg = agentsIndex().stage_config[stage];
  const pool = agentsByTags(cfg.advocate_pool_tag, 'role:advocate');
  return pool.slice(0, count ?? cfg.advocate_count);
}

/** The 5 critics for the judge panel, in registry order. */
export function judgeCritics(): AgentEntry[] {
  return agentsByTags(agentsIndex().stage_config.judge.critic_tag, 'role:critic');
}

/** The single agent with the given role + a tag, or throw. */
export function agentByRole(role: AgentEntry['role'], tag: string): AgentEntry {
  const hit = agentsByTags(tag, `role:${role}`)[0];
  if (!hit) throw new Error(`no agent with role=${role} tag=${tag} in agents/v4-index.json`);
  return hit;
}
