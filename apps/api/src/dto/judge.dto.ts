import { tags } from 'typia';
import type { LocalizedString } from '@/dto/common.dto';

/**
 * Verbatim LLM-as-judge prompt by version (M10).
 * Append-only — version bumps are new rows, never edits.
 */
export interface JudgePrompt {
  version: string & tags.Pattern<'^v[0-9]+$'>;
  body: LocalizedString;
  /**
   * Hex SHA-256 of `body.text` for tamper-evidence.
   */
  sha256: string & tags.Pattern<'^[0-9a-f]{64}$'>;
  frozen_at: string & tags.Format<'date-time'>;
}
