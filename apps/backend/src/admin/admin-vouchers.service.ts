import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { AuditLogService } from "./audit-log.service";

@Injectable()
export class AdminVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  async findMany(params: { active?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    const where: any = {};

    if (params.active === "true") where.isActive = true;
    if (params.active === "false") where.isActive = false;

    const [data, total] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.voucher.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async findOne(voucherId: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
      include: {
        redemptions: {
          include: {
            user: { select: { email: true, fullName: true } },
          },
          orderBy: { redeemedAt: "desc" },
        },
      },
    });
    if (!voucher) throw new NotFoundException("Voucher not found");
    return voucher;
  }

  async create(
    adminId: string,
    data: {
      code: string;
      type: string;
      tier?: string;
      discountPercent?: number;
      discountAmountCents?: number;
      trialDays?: number;
      durationMonths?: number;
      maxRedemptions?: number;
      expiresAt?: string;
      stripeCouponId?: string;
    },
    ip?: string
  ) {
    const code = data.code.toUpperCase().trim();

    const existing = await this.prisma.voucher.findUnique({
      where: { code },
    });
    if (existing) {
      throw new BadRequestException(`Voucher code "${code}" already exists`);
    }

    const voucher = await this.prisma.voucher.create({
      data: {
        code,
        type: data.type,
        tier: data.tier,
        discountPercent: data.discountPercent,
        discountAmountCents: data.discountAmountCents,
        trialDays: data.trialDays,
        durationMonths: data.durationMonths,
        maxRedemptions: data.maxRedemptions,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        stripeCouponId: data.stripeCouponId,
      },
    });

    await this.auditLog.log({
      adminId,
      action: "voucher.create",
      targetType: "voucher",
      targetId: voucher.id,
      details: { code, type: data.type },
      ipAddress: ip,
    });

    return voucher;
  }

  async update(
    adminId: string,
    voucherId: string,
    data: {
      maxRedemptions?: number;
      expiresAt?: string;
      isActive?: boolean;
    },
    ip?: string
  ) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
    });
    if (!voucher) throw new NotFoundException("Voucher not found");

    const updateData: any = {};
    if (data.maxRedemptions !== undefined)
      updateData.maxRedemptions = data.maxRedemptions;
    if (data.expiresAt !== undefined)
      updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await this.prisma.voucher.update({
      where: { id: voucherId },
      data: updateData,
    });

    await this.auditLog.log({
      adminId,
      action: "voucher.update",
      targetType: "voucher",
      targetId: voucherId,
      details: { before: { isActive: voucher.isActive }, after: updateData, code: voucher.code },
      ipAddress: ip,
    });

    return updated;
  }

  async deactivate(adminId: string, voucherId: string, ip?: string) {
    return this.update(adminId, voucherId, { isActive: false }, ip);
  }
}
