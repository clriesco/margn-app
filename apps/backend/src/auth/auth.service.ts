import { createClerkClient, verifyToken } from "@clerk/backend";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Authentication service using Clerk
 */
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  /**
   * Verify Clerk session token and return local user
   *
   * 1. Verifies token cryptographically via Clerk SDK
   * 2. Looks up user by clerkId (sub claim)
   * 3. Falls back to email lookup + link for migration period
   * 4. Creates user if not found
   *
   * @param token - Clerk session token (Bearer token from frontend)
   * @returns User data { id, email } or null
   */
  async verifySession(token: string) {
    try {
      // E2E test mode: accept test tokens when CLERK_TEST_MODE=true
      if (
        process.env.CLERK_TEST_MODE === "true" &&
        token.startsWith("e2e-test-token:")
      ) {
        const clerkId = token.substring("e2e-test-token:".length);
        const user = await this.prisma.user.findUnique({
          where: { clerkId },
        });
        return user ? { id: user.id, email: user.email } : null;
      }

      const authorizedParties = (
        process.env.FRONTEND_URL || "http://localhost:3002"
      )
        .split(",")
        .map((u) => u.trim());

      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
        authorizedParties,
      });

      const clerkId = payload.sub;

      // 1. Look up by clerkId (primary path)
      let user = await this.prisma.user.findUnique({ where: { clerkId } });

      // 2. Fallback: fetch email from Clerk API, look up by email and link
      if (!user) {
        const clerk = createClerkClient({
          secretKey: process.env.CLERK_SECRET_KEY!,
        });
        const clerkUser = await clerk.users.getUser(clerkId);
        const email =
          clerkUser.emailAddresses.find(
            (e) => e.id === clerkUser.primaryEmailAddressId
          )?.emailAddress;

        if (email) {
          user = await this.prisma.user.findUnique({ where: { email } });
          if (user) {
            // Link new clerkId to existing user
            user = await this.prisma.user.update({
              where: { id: user.id },
              data: { clerkId },
            });
          } else {
            // Create new user
            user = await this.prisma.user.create({
              data: { email, clerkId },
            });
          }
        }
      }

      if (!user) {
        console.warn(
          `[AuthService] Could not resolve user for clerkId=${clerkId}`
        );
        return null;
      }

      return {
        id: user.id,
        email: user.email,
      } as any;
    } catch (err) {
      console.error("[AuthService] Failed to verify session:", err);
      return null;
    }
  }
}
