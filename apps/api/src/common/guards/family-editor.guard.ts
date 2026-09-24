import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { MemberType } from '@prisma/client';

/**
 * После FamilyAccessGuard: владелец и взрослые могут менять данные,
 * helper / child — только чтение.
 */
@Injectable()
export class FamilyEditorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId: string } | undefined;
    const family = request.family as
      | { ownerId: string }
      | undefined;
    const member = request.familyMember as
      | { type: MemberType }
      | null
      | undefined;

    if (!user?.userId || !family) {
      throw new ForbiddenException('Нет доступа');
    }

    if (family.ownerId === user.userId) {
      return true;
    }

    if (member && (member.type === MemberType.adult || member.type === MemberType.owner)) {
      return true;
    }

    throw new ForbiddenException(
      'Помощник может только просматривать календарь. Изменения — у взрослых.',
    );
  }
}
