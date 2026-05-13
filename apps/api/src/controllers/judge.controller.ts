import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JudgeService } from '@/services/judge.service';
import { errors } from '@/util/errors';
import type { JudgePrompt } from '@/dto/judge.dto';

@Controller('judge/prompts')
export class JudgeController {
  constructor(private readonly judge: JudgeService) {}

  /**
   * GET /api/v1/judge/prompts/{version}.
   *
   * Content negotiation:
   *  - `Accept: application/json` (default) → JudgePrompt JSON
   *  - `Accept: text/markdown` → verbatim markdown body
   *  - Anything else → 406 with code=request.not_acceptable
   *
   * Vary: Accept set so the markdown and JSON representations cache
   * independently per the openapi.yaml description.
   */
  @Get(':version')
  async getOne(
    @Param('version') version: string,
    @Headers('accept') accept: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JudgePrompt | string | undefined> {
    const { prompt, markdown, etag, cacheControl } = await this.judge.getByVersion(version);

    res.setHeader('Vary', 'Accept');

    const wantsMarkdown = (accept ?? '').toLowerCase().includes('text/markdown');
    const wantsJson = !accept || (accept ?? '').toLowerCase().includes('application/json');

    if (!wantsMarkdown && !wantsJson) {
      throw errors.notAcceptable(
        `Accept must include text/markdown or application/json; got '${accept}'.`,
      );
    }

    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;

    if (wantsMarkdown && !wantsJson) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(markdown);
      return undefined;
    }
    return prompt;
  }
}
