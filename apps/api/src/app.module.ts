import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';

import { HealthController } from '@/controllers/health.controller';
import { StatsController } from '@/controllers/stats.controller';
import { BatchesController } from '@/controllers/batches.controller';
import { CompaniesController } from '@/controllers/companies.controller';
import { RunsController } from '@/controllers/runs.controller';
import { IterationsController } from '@/controllers/iterations.controller';
import { JudgeController } from '@/controllers/judge.controller';
import { CommentsController } from '@/controllers/comments.controller';

import { HealthService } from '@/services/health.service';
import { StatsService } from '@/services/stats.service';
import { BatchesService } from '@/services/batches.service';
import { CompaniesService } from '@/services/companies.service';
import { RunsService } from '@/services/runs.service';
import { IterationsService } from '@/services/iterations.service';
import { JudgeService } from '@/services/judge.service';
import { CommentsService } from '@/services/comments.service';

import { BatchesRepository } from '@/repositories/batches.repository';
import { CompaniesRepository } from '@/repositories/companies.repository';
import { RunsRepository } from '@/repositories/runs.repository';
import { IterationsRepository } from '@/repositories/iterations.repository';
import { JudgeRepository } from '@/repositories/judge.repository';
import { CommentsRepository } from '@/repositories/comments.repository';
import { StatsRepository } from '@/repositories/stats.repository';

@Module({
  imports: [PrismaModule],
  controllers: [
    HealthController,
    StatsController,
    BatchesController,
    CompaniesController,
    RunsController,
    IterationsController,
    JudgeController,
    CommentsController,
  ],
  providers: [
    HealthService,
    StatsService,
    BatchesService,
    CompaniesService,
    RunsService,
    IterationsService,
    JudgeService,
    CommentsService,
    BatchesRepository,
    CompaniesRepository,
    RunsRepository,
    IterationsRepository,
    JudgeRepository,
    CommentsRepository,
    StatsRepository,
  ],
})
export class AppModule {}
