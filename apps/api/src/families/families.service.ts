import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFamilyDto, UpdateFamilyDto } from './dto/family.dto';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { MemberRelation, MemberType } from '@prisma/client';
import { seedDefaultCategories } from '../categories/default-categories';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class FamiliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(userId: string, dto: CreateFamilyDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const family = await this.prisma.family.create({
      data: {
        name: dto.name,
        ownerId: userId,
        travelBufferDefault: dto.travelBufferDefault ?? 15,
        timezone: dto.timezone ?? 'Europe/Moscow',
        members: {
          create: {
            userId,
            name: user.name,
            color: '#2563EB',
            type: MemberType.owner,
            relation: MemberRelation.father,
          },
        },
      },
      include: { members: true },
    });

    await seedDefaultCategories(this.prisma, family.id);
    return this.findOne(family.id);
  }

  async findOne(familyId: string) {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: {
        members: { orderBy: { createdAt: 'asc' } },
        categories: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
    if (!family) {
      throw new NotFoundException('Семейная группа не найдена');
    }
    return family;
  }

  async update(userId: string, familyId: string, dto: UpdateFamilyDto) {
    const family = await this.findOne(familyId);
    if (family.ownerId !== userId) {
      throw new ForbiddenException('Только организатор может изменять настройки семьи');
    }
    const updated = await this.prisma.family.update({
      where: { id: familyId },
      data: dto,
      include: { members: true },
    });
    this.realtime.familyChanged(familyId, 'updated');
    return updated;
  }

  async listMembers(familyId: string) {
    return this.prisma.familyMember.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMember(userId: string, familyId: string, dto: CreateMemberDto) {
    await this.assertCanManageMembers(userId, familyId);
    if (dto.type === MemberType.owner) {
      throw new BadRequestException('Нельзя создать второго владельца');
    }
    const member = await this.prisma.familyMember.create({
      data: {
        familyId,
        name: dto.name,
        color: dto.color,
        type: dto.type,
        relation: dto.relation,
      },
    });
    this.realtime.membersChanged(familyId, 'created');
    return member;
  }

  async updateMember(userId: string, familyId: string, memberId: string, dto: UpdateMemberDto) {
    await this.assertCanManageMembers(userId, familyId);
    const member = await this.prisma.familyMember.findFirst({
      where: { id: memberId, familyId },
    });
    if (!member) {
      throw new NotFoundException('Участник не найден');
    }
    if (dto.type === MemberType.owner && member.type !== MemberType.owner) {
      throw new BadRequestException('Нельзя назначить второго владельца');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.familyMember.update({
        where: { id: memberId },
        data: dto,
      });
      // Имя в шапке = User.name; держим в синхроне с карточкой участника, если аккаунт привязан
      if (dto.name && member.userId) {
        await tx.user.update({
          where: { id: member.userId },
          data: { name: dto.name },
        });
      }
      return next;
    });

    this.realtime.membersChanged(familyId, 'updated');
    return updated;
  }

  async deleteMember(userId: string, familyId: string, memberId: string) {
    await this.assertCanManageMembers(userId, familyId);
    const member = await this.prisma.familyMember.findFirst({
      where: { id: memberId, familyId },
    });
    if (!member) {
      throw new NotFoundException('Участник не найден');
    }
    if (member.type === MemberType.owner) {
      throw new BadRequestException('Нельзя удалить владельца семьи');
    }

    // События, где этот участник — единственный: после cascade останутся «пустые»
    const soleEvents = await this.prisma.event.findMany({
      where: {
        familyId,
        participants: { some: { memberId } },
      },
      select: {
        id: true,
        title: true,
        _count: { select: { participants: true } },
      },
    });
    const blocked = soleEvents.filter((e) => e._count.participants === 1);
    if (blocked.length > 0) {
      const titles = blocked
        .slice(0, 3)
        .map((e) => `«${e.title}»`)
        .join(', ');
      const more = blocked.length > 3 ? ` и ещё ${blocked.length - 3}` : '';
      throw new BadRequestException(
        `Нельзя удалить: участник единственный в ${blocked.length} событиях (${titles}${more}). Добавьте других или удалите эти события.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.event.updateMany({
        where: { familyId, responsibleMemberId: memberId },
        data: { responsibleMemberId: null },
      });
      await tx.familyMember.delete({ where: { id: memberId } });
    });

    this.realtime.membersChanged(familyId, 'deleted');
    this.realtime.eventsChanged(familyId, 'updated');
    return { ok: true };
  }

  private async assertCanManageMembers(userId: string, familyId: string) {
    const family = await this.findOne(familyId);
    if (family.ownerId !== userId) {
      throw new ForbiddenException('Только организатор может управлять участниками');
    }
  }
}
