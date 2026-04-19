import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    super({ adapter });
  }

  onModuleInit() {
    void this.$connect()
      .then(() => {
        this.logger.log('Prisma connection established');
      })
      .catch((error: unknown) => {
        this.logger.error('Prisma connection failed during startup', error);
      });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
