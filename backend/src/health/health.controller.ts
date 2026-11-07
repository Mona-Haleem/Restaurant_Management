import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/app-exception';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

/** A health query that hangs is a failure too: keep-alive monitors need a fast answer. */
const DB_CHECK_TIMEOUT_MS = 3_000;

export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({
    type: String,
    nullable: true,
    example: '0e0195c4f2b1a3d4e5f60718293a4b5c6d7e8f90',
    description:
      'The git commit this instance runs (Render deploys); null elsewhere. The deploy workflows wait for it (B1201).',
  })
  commit!: string | null;
}

export class DatabaseHealthDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['up'] })
  database!: 'up';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * B503 health checks, used by Render and the keep-alive workflows (ROADMAP §2). Never rate
 * limited, and outside the tenant routes.
 */
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectPinoLogger(HealthController.name) private readonly logger: PinoLogger,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Is the API up? Never touches the database.' })
  @ApiOkResponse({ type: HealthDto })
  getHealth(): HealthDto {
    return { status: 'ok', commit: this.config.gitCommit };
  }

  @Get('db')
  @ApiOperation({
    summary: 'Is the database reachable? Runs a trivial query; 503 DATABASE_UNAVAILABLE if not.',
  })
  @ApiOkResponse({ type: DatabaseHealthDto })
  async getDatabaseHealth(): Promise<DatabaseHealthDto> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, DB_CHECK_TIMEOUT_MS);
    } catch (error) {
      this.logger.warn({ err: error }, 'Database health check failed');
      throw new AppException(503, 'DATABASE_UNAVAILABLE', 'The database is not reachable.');
    }
    return { status: 'ok', database: 'up' };
  }
}
