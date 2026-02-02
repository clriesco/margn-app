import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Guard that verifies the authenticated user owns the requested portfolio.
 * Must be used AFTER AuthGuard so that request.user is already set.
 *
 * Extracts portfolioId from:
 * 1. request.params.portfolioId
 * 2. request.params.id
 * 3. request.body.portfolioId
 */
@Injectable()
export class PortfolioOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const portfolioId =
      request.params?.portfolioId ||
      request.params?.id ||
      request.body?.portfolioId;

    if (!portfolioId) {
      throw new BadRequestException("Portfolio ID is required");
    }

    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { userId: true },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    if (portfolio.userId !== user.id) {
      throw new ForbiddenException(
        "You do not have access to this portfolio"
      );
    }

    return true;
  }
}
