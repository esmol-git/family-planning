import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  list(familyId: string, includeInactive = false) {
    return this.prisma.category.findMany({
      where: {
        familyId,
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(userId: string, familyId: string, dto: CreateCategoryDto) {
    await this.assertOwner(userId, familyId);
    try {
      const maxSort = await this.prisma.category.aggregate({
        where: { familyId },
        _max: { sortOrder: true },
      });
      const category = await this.prisma.category.create({
        data: {
          familyId,
          name: dto.name.trim(),
          color: dto.color,
          sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1,
        },
      });
      this.realtime.categoriesChanged(familyId, 'created');
      return category;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Категория с таким названием уже есть');
      }
      throw e;
    }
  }

  async update(userId: string, familyId: string, categoryId: string, dto: UpdateCategoryDto) {
    await this.assertOwner(userId, familyId);
    await this.findInFamily(familyId, categoryId);
    try {
      const updated = await this.prisma.category.update({
        where: { id: categoryId },
        data: {
          name: dto.name?.trim(),
          color: dto.color,
          sortOrder: dto.sortOrder,
          active: dto.active,
        },
      });
      this.realtime.categoriesChanged(familyId, 'updated');
      return updated;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Категория с таким названием уже есть');
      }
      throw e;
    }
  }

  async remove(userId: string, familyId: string, categoryId: string) {
    await this.assertOwner(userId, familyId);
    await this.findInFamily(familyId, categoryId);
    // Любой статус: categoryId обязателен, иначе FK Restrict
    const used = await this.prisma.event.count({
      where: { categoryId, familyId },
    });
    if (used > 0) {
      throw new BadRequestException(
        `Нельзя удалить категорию: она в ${used} событиях. Смените категорию у событий или скройте её.`,
      );
    }
    await this.prisma.category.delete({ where: { id: categoryId } });
    this.realtime.categoriesChanged(familyId, 'deleted');
    return { ok: true };
  }

  private async assertOwner(userId: string, familyId: string) {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { ownerId: true },
    });
    if (!family) throw new NotFoundException('Семейная группа не найдена');
    if (family.ownerId !== userId) {
      throw new ForbiddenException('Только организатор может управлять категориями');
    }
  }

  private async findInFamily(familyId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, familyId },
    });
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }
    return category;
  }
}
