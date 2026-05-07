import { Injectable } from '@nestjs/common';
import { JudgeRepository } from '@/repositories/judge.repository';
import { mapJudgePrompt } from '@/services/mappers';
import { buildEtag } from '@/util/etag';
import { errors } from '@/util/errors';
import type { JudgePrompt } from '@/dto/judge.dto';

@Injectable()
export class JudgeService {
  constructor(private readonly repo: JudgeRepository) {}

  /**
   * Verbatim judge prompt by version (M10).
   *
   * Append-only versioning — each `vN` is a separate row.
   *
   * ETag is `sha256:<sha256(body.text)>` per the spec; we use the persisted
   * `sha256` column (computed at row insertion) as the source of truth.
   */
  async getByVersion(
    version: string,
  ): Promise<{
    prompt: JudgePrompt;
    markdown: string;
    etag: string;
    cacheControl: string;
  }> {
    if (!/^v[0-9]+$/.test(version)) {
      throw errors.invalidParam(`version must match /^v[0-9]+$/, got '${version}'.`);
    }
    const row = await this.repo.findByVersion(version);
    if (!row) throw errors.judgePromptNotFound(version);

    const prompt = mapJudgePrompt(row);
    const etag = buildEtag({ kind: 'content-hash', hash: row.sha256 });
    const cacheControl = 'public, max-age=31536000, immutable';

    return { prompt, markdown: row.bodyMarkdown, etag, cacheControl };
  }
}
