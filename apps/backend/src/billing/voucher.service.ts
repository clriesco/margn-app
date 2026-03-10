import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Validate a voucher code without redeeming it.
   * Returns the voucher details if valid.
   */
  async validate(code: string, subscriptionId: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!voucher) {
      throw new NotFoundException("Voucher not found");
    }

    if (!voucher.isActive) {
      throw new BadRequestException("This voucher is no longer active");
    }

    if (voucher.expiresAt && voucher.expiresAt < new Date()) {
      throw new BadRequestException("This voucher has expired");
    }

    if (
      voucher.maxRedemptions !== null &&
      voucher.currentRedemptions >= voucher.maxRedemptions
    ) {
      throw new BadRequestException(
        "This voucher has reached its maximum redemptions"
      );
    }

    // Check if already redeemed by this subscription
    const existingRedemption =
      await this.prisma.voucherRedemption.findUnique({
        where: {
          voucherId_subscriptionId: {
            voucherId: voucher.id,
            subscriptionId,
          },
        },
      });

    if (existingRedemption) {
      throw new BadRequestException("You have already used this voucher");
    }

    return {
      id: voucher.id,
      code: voucher.code,
      type: voucher.type,
      tier: voucher.tier,
      discountPercent: voucher.discountPercent,
      discountAmountCents: voucher.discountAmountCents,
      trialDays: voucher.trialDays,
      durationMonths: voucher.durationMonths,
      stripeCouponId: voucher.stripeCouponId,
    };
  }

  /**
   * Redeem a voucher for a subscription.
   * Increments the redemption counter and creates a redemption record.
   */
  async redeem(
    code: string,
    subscriptionId: string,
    userId: string
  ): Promise<void> {
    const voucher = await this.prisma.voucher.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!voucher) {
      throw new NotFoundException("Voucher not found");
    }

    await this.prisma.$transaction([
      this.prisma.voucher.update({
        where: { id: voucher.id },
        data: { currentRedemptions: { increment: 1 } },
      }),
      this.prisma.voucherRedemption.create({
        data: {
          voucherId: voucher.id,
          subscriptionId,
          userId,
        },
      }),
    ]);

    this.logger.log(
      `Voucher ${code} redeemed by user ${userId} for subscription ${subscriptionId}`
    );
  }
}
