import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { TIER_RANK } from "../billing.constants";
import { TIER_KEY } from "../decorators/require-tier.decorator";
import { SubscriptionService } from "../subscription.service";

/**
 * Guard that checks if the authenticated user's subscription tier
 * meets the minimum required tier for the endpoint.
 *
 * Usage: @UseGuards(AuthGuard, SubscriptionTierGuard)
 *        @RequireTier('pro')
 *
 * No-op if no @RequireTier decorator is present on the route.
 */
@Injectable()
export class SubscriptionTierGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private subscriptionService: SubscriptionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredTier = this.reflector.getAllAndOverride<string>(TIER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No tier requirement on this route — allow
    if (!requiredTier) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException("Authentication required");
    }

    const effectiveTier =
      await this.subscriptionService.getEffectiveTier(userId);
    const userRank = TIER_RANK[effectiveTier] ?? 0;
    const requiredRank = TIER_RANK[requiredTier] ?? 0;

    if (userRank < requiredRank) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "TIER_REQUIRED",
        message: `This feature requires the ${requiredTier} plan`,
        requiredTier,
        currentTier: effectiveTier,
      });
    }

    // Attach tier info to request for downstream use
    request.subscription = { tier: effectiveTier };
    return true;
  }
}
