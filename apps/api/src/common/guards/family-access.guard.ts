import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FamilyAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId: string } | undefined;
    if (!user?.userId) {
      throw new ForbiddenException('Требуется авторизация');
    }

    const familyId =
      request.params.familyId || request.body?.familyId || request.query?.familyId;

    if (!familyId) {
      return true;
    }

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: { members: { where: { userId: user.userId, active: true } } },
    });

    if (!family) {
      throw new NotFoundException('Семейная группа не найдена');
    }

    const isOwner = family.ownerId === user.userId;
    const isMember = family.members.length > 0;

    if (!isOwner && !isMember) {
      throw new ForbiddenException('Нет доступа к этой семейной группе');
    }

    request.family = family;
    request.familyMember = family.members[0] ?? null;
    return true;
  }
}
