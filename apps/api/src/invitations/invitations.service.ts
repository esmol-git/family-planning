import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus, MemberType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptByCodeDto, CreateInvitationDto, ReinviteMemberDto } from './dto/invitation.dto';
import { RealtimeService } from '../realtime/realtime.service';

function generateCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(userId: string, familyId: string, dto: CreateInvitationDto) {
    await this.assertCanManageInvites(userId, familyId);

    let targetMemberId: string | undefined;
    let invitedName = dto.invitedName?.trim();
    let color = dto.color ?? '#0D9488';
    let memberType = dto.memberType as MemberType;

    if (dto.targetMemberId) {
      const target = await this.prisma.familyMember.findFirst({
        where: { id: dto.targetMemberId, familyId, active: true },
      });
      if (!target) {
        throw new NotFoundException('Участник не найден');
      }
      if (target.userId) {
        throw new BadRequestException(
          'У участника уже есть вход. Нажмите «Выдать ссылку снова» — старый вход сбросится.',
        );
      }
      if (target.type === MemberType.owner) {
        throw new BadRequestException('Нельзя привязать приглашение к организатору');
      }
      if (target.type === MemberType.child) {
        throw new BadRequestException('Детский профиль нельзя привязать к аккаунту');
      }
      targetMemberId = target.id;
      invitedName = target.name;
      color = target.color;
      memberType = target.type === MemberType.helper ? MemberType.helper : MemberType.adult;

      // Старые неиспользованные ссылки на этого участника — отозвать
      await this.prisma.invitation.updateMany({
        where: {
          familyId,
          targetMemberId,
          status: InvitationStatus.pending,
        },
        data: { status: InvitationStatus.revoked },
      });
    }

    return this.createInvitationRecord({
      familyId,
      createdById: userId,
      memberType,
      invitedName,
      invitedEmail: dto.invitedEmail?.toLowerCase(),
      color,
      targetMemberId,
      expiresInDays: dto.expiresInDays ?? 7,
    });
  }

  /**
   * Новая ссылка для участника: отвязывает старый аккаунт (если был)
   * и создаёт свежее приглашение. Нужно, когда человек не дошёл до логина
   * или забыл пароль / нужна повторная регистрация.
   */
  async reinvite(
    userId: string,
    familyId: string,
    memberId: string,
    dto: ReinviteMemberDto,
  ) {
    await this.assertCanManageInvites(userId, familyId);

    const member = await this.prisma.familyMember.findFirst({
      where: { id: memberId, familyId, active: true },
    });
    if (!member) {
      throw new NotFoundException('Участник не найден');
    }
    if (member.type === MemberType.owner) {
      throw new BadRequestException('Организатор уже с входом');
    }
    if (member.type === MemberType.child) {
      throw new BadRequestException('Детский профиль нельзя привязать к аккаунту');
    }

    const previousUserId = member.userId;

    await this.prisma.$transaction(async (tx) => {
      if (previousUserId) {
        await tx.familyMember.update({
          where: { id: member.id },
          data: { userId: null },
        });
        await tx.refreshToken.updateMany({
          where: { userId: previousUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.invitation.updateMany({
        where: {
          familyId,
          targetMemberId: member.id,
          status: InvitationStatus.pending,
        },
        data: { status: InvitationStatus.revoked },
      });
    });

    const invitation = await this.createInvitationRecord({
      familyId,
      createdById: userId,
      memberType:
        member.type === MemberType.helper ? MemberType.helper : MemberType.adult,
      invitedName: member.name,
      color: member.color,
      targetMemberId: member.id,
      expiresInDays: dto.expiresInDays ?? 7,
    });

    this.realtime.membersChanged(familyId, 'unlinked_for_reinvite');
    return invitation;
  }

  private async createInvitationRecord(data: {
    familyId: string;
    createdById: string;
    memberType: MemberType;
    invitedName?: string | null;
    invitedEmail?: string;
    color: string;
    targetMemberId?: string;
    expiresInDays: number;
  }) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

    let invitation = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        invitation = await this.prisma.invitation.create({
          data: {
            familyId: data.familyId,
            createdById: data.createdById,
            token: randomBytes(24).toString('hex'),
            code: generateCode(6),
            memberType: data.memberType,
            invitedName: data.invitedName,
            invitedEmail: data.invitedEmail,
            color: data.color,
            targetMemberId: data.targetMemberId,
            expiresAt,
          },
          include: {
            family: { select: { id: true, name: true } },
          },
        });
        break;
      } catch {
        // unique collision on code — retry
      }
    }

    if (!invitation) {
      throw new BadRequestException('Не удалось создать приглашение, попробуйте ещё раз');
    }

    return this.serialize(invitation);
  }

  async list(userId: string, familyId: string) {
    await this.assertCanManageInvites(userId, familyId);
    await this.expireOverdue(familyId);

    const items = await this.prisma.invitation.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
      include: { family: { select: { id: true, name: true } } },
    });
    return items.map((i) => this.serialize(i));
  }

  async revoke(userId: string, familyId: string, invitationId: string) {
    await this.assertCanManageInvites(userId, familyId);
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, familyId },
    });
    if (!invitation) {
      throw new NotFoundException('Приглашение не найдено');
    }
    if (invitation.status !== InvitationStatus.pending) {
      throw new BadRequestException('Можно отозвать только активное приглашение');
    }
    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.revoked },
      include: { family: { select: { id: true, name: true } } },
    });
    return this.serialize(updated);
  }

  async previewByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { family: { select: { id: true, name: true } } },
    });
    if (!invitation) {
      throw new NotFoundException('Приглашение не найдено');
    }

    let status = invitation.status;
    if (
      status === InvitationStatus.pending &&
      invitation.expiresAt.getTime() < Date.now()
    ) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.expired },
      });
      status = InvitationStatus.expired;
    }

    return {
      ...this.publicPreview(invitation),
      status,
      usable: status === InvitationStatus.pending,
    };
  }

  async previewByCode(code: string) {
    const invitation = await this.findUsableByCode(code);
    return this.publicPreview(invitation);
  }

  async acceptByToken(userId: string, token: string) {
    const invitation = await this.findUsableByToken(token);
    return this.accept(userId, invitation.id);
  }

  async acceptByCode(userId: string, dto: AcceptByCodeDto) {
    const invitation = await this.findUsableByCode(dto.code);
    return this.accept(userId, invitation.id);
  }

  private async accept(userId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { family: true },
    });
    if (!invitation) {
      throw new NotFoundException('Приглашение не найдено');
    }
    await this.ensurePending(invitation);

    const existing = await this.prisma.familyMember.findFirst({
      where: { familyId: invitation.familyId, userId, active: true },
    });
    if (existing) {
      throw new ConflictException('Вы уже состоите в этой семье');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const result = await this.prisma.$transaction(async (tx) => {
      let member;
      if (invitation.targetMemberId) {
        const target = await tx.familyMember.findFirst({
          where: {
            id: invitation.targetMemberId,
            familyId: invitation.familyId,
            active: true,
          },
        });
        if (!target) {
          throw new NotFoundException('Участник для привязки не найден');
        }
        if (target.userId) {
          throw new ConflictException('К этому участнику уже привязан аккаунт');
        }
        member = await tx.familyMember.update({
          where: { id: target.id },
          data: {
            userId,
            type:
              target.type === MemberType.helper
                ? MemberType.helper
                : invitation.memberType,
          },
        });
      } else {
        member = await tx.familyMember.create({
          data: {
            familyId: invitation.familyId,
            userId,
            name: invitation.invitedName?.trim() || user.name,
            color: invitation.color,
            type: invitation.memberType,
          },
        });
      }

      const updated = await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.accepted,
          acceptedByUserId: userId,
          acceptedAt: new Date(),
        },
        include: { family: { select: { id: true, name: true } } },
      });

      return { member, invitation: updated };
    });

    this.realtime.membersChanged(invitation.familyId, 'joined');
    return {
      family: result.invitation.family,
      member: result.member,
      invitation: this.serialize(result.invitation),
    };
  }

  private async findUsableByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { family: { select: { id: true, name: true } } },
    });
    if (!invitation) {
      throw new NotFoundException('Приглашение не найдено');
    }
    await this.ensurePending(invitation);
    return invitation;
  }

  private async findUsableByCode(code: string) {
    const normalized = code.trim().toUpperCase();
    const invitation = await this.prisma.invitation.findUnique({
      where: { code: normalized },
      include: { family: { select: { id: true, name: true } } },
    });
    if (!invitation) {
      throw new NotFoundException('Приглашение с таким кодом не найдено');
    }
    await this.ensurePending(invitation);
    return invitation;
  }

  private async ensurePending(invitation: {
    id: string;
    status: InvitationStatus;
    expiresAt: Date;
  }) {
    if (invitation.status === InvitationStatus.accepted) {
      throw new BadRequestException('Приглашение уже использовано');
    }
    if (invitation.status === InvitationStatus.revoked) {
      throw new BadRequestException('Приглашение отозвано');
    }
    if (
      invitation.status === InvitationStatus.expired ||
      invitation.expiresAt.getTime() < Date.now()
    ) {
      if (invitation.status === InvitationStatus.pending) {
        await this.prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.expired },
        });
      }
      throw new BadRequestException('Срок приглашения истёк');
    }
  }

  private async expireOverdue(familyId: string) {
    await this.prisma.invitation.updateMany({
      where: {
        familyId,
        status: InvitationStatus.pending,
        expiresAt: { lt: new Date() },
      },
      data: { status: InvitationStatus.expired },
    });
  }

  private async assertCanManageInvites(userId: string, familyId: string) {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: { members: { where: { userId, active: true } } },
    });
    if (!family) {
      throw new NotFoundException('Семейная группа не найдена');
    }
    if (family.ownerId === userId) {
      return;
    }
    const member = family.members[0];
    if (
      member &&
      member.type !== MemberType.helper &&
      member.type !== MemberType.child
    ) {
      return;
    }
    throw new ForbiddenException('Недостаточно прав для приглашений');
  }

  private publicPreview(invitation: {
    token: string;
    code: string;
    memberType: MemberType;
    invitedName: string | null;
    expiresAt: Date;
    family: { id: string; name: string };
  }) {
    return {
      family: invitation.family,
      memberType: invitation.memberType,
      invitedName: invitation.invitedName,
      expiresAt: invitation.expiresAt.toISOString(),
      token: invitation.token,
      code: invitation.code,
    };
  }

  private serialize(invitation: {
    id: string;
    familyId: string;
    token: string;
    code: string;
    memberType: MemberType;
    invitedName: string | null;
    invitedEmail: string | null;
    color: string;
    targetMemberId?: string | null;
    status: InvitationStatus;
    expiresAt: Date;
    acceptedAt: Date | null;
    createdAt: Date;
    family?: { id: string; name: string };
  }) {
    return {
      id: invitation.id,
      familyId: invitation.familyId,
      family: invitation.family,
      token: invitation.token,
      code: invitation.code,
      memberType: invitation.memberType,
      invitedName: invitation.invitedName,
      invitedEmail: invitation.invitedEmail,
      targetMemberId: invitation.targetMemberId ?? null,
      color: invitation.color,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      createdAt: invitation.createdAt.toISOString(),
      invitePath: `/invite/${invitation.token}`,
    };
  }
}

