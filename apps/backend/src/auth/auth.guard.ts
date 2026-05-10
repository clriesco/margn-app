import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";

import { AuthService } from "./auth.service";

/**
 * Authentication guard that verifies Clerk session tokens
 * Extracts token from Authorization header and verifies it
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[AuthGuard] No authorization header found");
      throw new UnauthorizedException("No token provided");
    }

    const token = authHeader.substring(7);
    
    if (!token || token.length === 0) {
      console.error("[AuthGuard] Token is empty");
      throw new UnauthorizedException("No token provided");
    }

    const user = await this.authService.verifySession(token);

    if (!user) {
      console.error("[AuthGuard] Token verification failed - invalid or expired token");
      throw new UnauthorizedException("Invalid or expired token");
    }
    // Attach user to request for use in controllers
    request.user = user;

    return true;
  }
}


