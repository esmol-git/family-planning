import { Prisma, PrismaClient } from '@prisma/client';

export const DEFAULT_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: 'Школа', color: '#2563EB' },
  { name: 'Детский сад', color: '#7C3AED' },
  { name: 'Футбол', color: '#16A34A' },
  { name: 'Спорт', color: '#0D9488' },
  { name: 'Кружок', color: '#CA8A04' },
  { name: 'Врач', color: '#DC2626' },
  { name: 'Работа', color: '#475569' },
  { name: 'Поездка', color: '#EA580C' },
  { name: 'Праздник', color: '#DB2777' },
  { name: 'Домашние дела', color: '#65A30D' },
  { name: 'Другое', color: '#5B6F64' },
];

export async function seedDefaultCategories(
  prisma: PrismaClient | Prisma.TransactionClient,
  familyId: string,
) {
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c, index) => ({
      familyId,
      name: c.name,
      color: c.color,
      sortOrder: index,
    })),
  });
}
