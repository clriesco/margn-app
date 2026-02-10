import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { UpdateProfileDto, ProfileResponse } from "./dto/update-profile.dto";

/**
 * Service for managing user profiles
 */
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get user profile by ID
   * @param userId - User ID
   * @returns User profile data
   */
  async getProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      notifyOnNotifications: user.notifyOnNotifications ?? true,
      notifyOnContributions: user.notifyOnContributions ?? true,
      notifyOnLeverageAlerts: user.notifyOnLeverageAlerts ?? true,
      notifyOnRebalance: user.notifyOnRebalance ?? true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Get user profile by email
   * @param email - User email
   * @returns User profile data
   */
  async getProfileByEmail(email: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      notifyOnNotifications: user.notifyOnNotifications ?? true,
      notifyOnContributions: user.notifyOnContributions ?? true,
      notifyOnLeverageAlerts: user.notifyOnLeverageAlerts ?? true,
      notifyOnRebalance: user.notifyOnRebalance ?? true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Update user profile
   * @param userId - User ID
   * @param data - Profile update data
   * @returns Updated user profile
   */
  async updateProfile(
    userId: string,
    data: UpdateProfileDto
  ): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName !== undefined ? data.fullName : undefined,
        avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : undefined,
        notifyOnNotifications:
          data.notifyOnNotifications !== undefined
            ? data.notifyOnNotifications
            : undefined,
        notifyOnContributions:
          data.notifyOnContributions !== undefined
            ? data.notifyOnContributions
            : undefined,
        notifyOnLeverageAlerts:
          data.notifyOnLeverageAlerts !== undefined
            ? data.notifyOnLeverageAlerts
            : undefined,
        notifyOnRebalance:
          data.notifyOnRebalance !== undefined
            ? data.notifyOnRebalance
            : undefined,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      avatarUrl: updated.avatarUrl,
      notifyOnNotifications: updated.notifyOnNotifications ?? true,
      notifyOnContributions: updated.notifyOnContributions ?? true,
      notifyOnLeverageAlerts: updated.notifyOnLeverageAlerts ?? true,
      notifyOnRebalance: updated.notifyOnRebalance ?? true,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}



