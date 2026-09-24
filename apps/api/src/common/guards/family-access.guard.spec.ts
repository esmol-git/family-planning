import { FamilyAccessGuard } from './family-access.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('FamilyAccessGuard', () => {
  const prisma = {
    family: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;

  const guard = new FamilyAccessGuard(prisma);

  function ctx(userId: string | null, familyId?: string) {
    const request: Record<string, unknown> = {
      user: userId ? { userId } : undefined,
      params: { familyId },
      body: {},
      query: {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as never;
  }

  it('denies access to foreign family', async () => {
    (prisma.family.findUnique as jest.Mock).mockResolvedValue({
      id: 'f1',
      ownerId: 'other',
      members: [],
    });
    await expect(guard.canActivate(ctx('user1', 'f1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows owner', async () => {
    (prisma.family.findUnique as jest.Mock).mockResolvedValue({
      id: 'f1',
      ownerId: 'user1',
      members: [],
    });
    await expect(guard.canActivate(ctx('user1', 'f1'))).resolves.toBe(true);
  });

  it('throws when family missing', async () => {
    (prisma.family.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(guard.canActivate(ctx('user1', 'missing'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
