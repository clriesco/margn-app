import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from "@nestjs/common";

import { AuthService } from "./auth.service";

/**
 * Authentication controller
 */
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Verify current session
   * GET /api/auth/me
   */
  @Get("me")
  async me(@Headers("authorization") authHeader: string) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("No token provided");
    }

    const token = authHeader.substring(7);
    const user = await this.authService.verifySession(token);

    if (!user) {
      throw new UnauthorizedException("Invalid token");
    }

    return {
      id: user.id,
      email: user.email,
    };
  }
}
