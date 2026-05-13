import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from '@/services/health.service';
import type { Health } from '@/dto/health.dto';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * GET /api/v1/health — liveness.
   * Cache-Control: no-store. No ETag (no caching).
   */
  @Get()
  async getHealth(@Res({ passthrough: true }) res: Response): Promise<Health> {
    res.setHeader('Cache-Control', 'no-store');
    return this.health.getHealth();
  }
}
