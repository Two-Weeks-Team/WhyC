import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class JudgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByVersion(version: string) {
    return this.prisma.judgePrompt.findUnique({ where: { version } });
  }
}
