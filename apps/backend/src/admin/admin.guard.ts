import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Guard that restricts access to admin users.
 * Must be used AFTER AuthGuard (needs request.user).
 *
 * Checks two paths:
 * 1. User.role === 'admin' in DB (primary)
 * 2. User email in ADMIN_EMAILS env var (bootstrap path for first admin)
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      throw new ForbiddenException("Authentication required");
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, email: true },
    });

    if (!dbUser) {
      throw new ForbiddenException("User not found");
    }

    // Primary: DB role
    if (dbUser.role === "admin" || dbUser.role === "super_admin") return true;

    // Fallback: env allowlist (bootstrap first admin)
    const allowlist = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowlist.includes(dbUser.email.toLowerCase())) return true;

    throw new ForbiddenException("Admin access required");
  }
}
