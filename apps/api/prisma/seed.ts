import { PrismaClient, MemberType, MemberRelation } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedDefaultCategories } from '../src/categories/default-categories';

const prisma = new PrismaClient();

function weekDay(offsetFromMonday: number, hour: number, minute = 0): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + mondayOffset + offsetFromMonday,
      hour,
      minute,
      0,
      0,
    ),
  );
}

async function main() {
  await prisma.refreshToken.deleteMany().catch(() => undefined);
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.category.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('demo1234', 10);

  const owner = await prisma.user.create({
    data: {
      login: 'demo',
      email: 'demo@family.local',
      name: 'Дмитрий',
      passwordHash,
    },
  });

  const spouse = await prisma.user.create({
    data: {
      login: 'anna',
      email: 'anna@family.local',
      name: 'Анна',
      passwordHash,
    },
  });

  const family = await prisma.family.create({
    data: {
      name: 'Семья Смирновых',
      ownerId: owner.id,
      travelBufferDefault: 15,
      timezone: 'Europe/Moscow',
    },
  });

  await seedDefaultCategories(prisma, family.id);

  const categories = await prisma.category.findMany({ where: { familyId: family.id } });
  const cat = (name: string) => {
    const found = categories.find((c) => c.name === name);
    if (!found) throw new Error(`Category ${name} missing`);
    return found.id;
  };

  const dmitry = await prisma.familyMember.create({
    data: {
      familyId: family.id,
      userId: owner.id,
      name: 'Дмитрий',
      color: '#2563EB',
      type: MemberType.owner,
      relation: MemberRelation.father,
    },
  });

  const anna = await prisma.familyMember.create({
    data: {
      familyId: family.id,
      userId: spouse.id,
      name: 'Анна',
      color: '#DB2777',
      type: MemberType.adult,
      relation: MemberRelation.mother,
    },
  });

  const misha = await prisma.familyMember.create({
    data: {
      familyId: family.id,
      name: 'Миша',
      color: '#16A34A',
      type: MemberType.child,
      relation: MemberRelation.son,
    },
  });

  const lisa = await prisma.familyMember.create({
    data: {
      familyId: family.id,
      name: 'Лиза',
      color: '#CA8A04',
      type: MemberType.child,
      relation: MemberRelation.daughter,
    },
  });

  const nanny = await prisma.familyMember.create({
    data: {
      familyId: family.id,
      name: 'Ольга',
      color: '#7C3AED',
      type: MemberType.helper,
      relation: MemberRelation.nanny,
    },
  });

  const events = [
    {
      title: 'Школа',
      categoryId: cat('Школа'),
      startsAtUtc: weekDay(0, 5, 0),
      endsAtUtc: weekDay(0, 11, 0),
      location: 'Школа №12',
      participantIds: [misha.id],
      responsibleMemberId: anna.id,
    },
    {
      title: 'Детский сад',
      categoryId: cat('Детский сад'),
      startsAtUtc: weekDay(0, 5, 30),
      endsAtUtc: weekDay(0, 12, 0),
      location: 'ДС «Солнышко»',
      participantIds: [lisa.id],
      responsibleMemberId: anna.id,
    },
    {
      title: 'Футбол',
      categoryId: cat('Футбол'),
      startsAtUtc: weekDay(1, 14, 0),
      endsAtUtc: weekDay(1, 15, 0),
      location: 'Стадион Юность',
      participantIds: [misha.id],
      responsibleMemberId: dmitry.id,
    },
    {
      title: 'Кружок рисования',
      categoryId: cat('Кружок'),
      startsAtUtc: weekDay(1, 14, 30),
      endsAtUtc: weekDay(1, 15, 30),
      location: 'ДК Центральный',
      participantIds: [misha.id],
      responsibleMemberId: anna.id,
    },
    {
      title: 'Работа',
      categoryId: cat('Работа'),
      startsAtUtc: weekDay(2, 6, 0),
      endsAtUtc: weekDay(2, 15, 0),
      location: 'Офис',
      participantIds: [dmitry.id],
      responsibleMemberId: dmitry.id,
    },
    {
      title: 'Врач',
      categoryId: cat('Врач'),
      startsAtUtc: weekDay(3, 7, 0),
      endsAtUtc: weekDay(3, 8, 0),
      location: 'Поликлиника',
      participantIds: [lisa.id],
      responsibleMemberId: nanny.id,
      travelBufferMinutes: 20,
    },
    {
      title: 'Спортзал',
      categoryId: cat('Спорт'),
      startsAtUtc: weekDay(3, 8, 5),
      endsAtUtc: weekDay(3, 9, 5),
      location: 'Фитнес-клуб',
      participantIds: [anna.id],
      responsibleMemberId: anna.id,
    },
    {
      title: 'Футбол (серия)',
      categoryId: cat('Футбол'),
      startsAtUtc: weekDay(1, 16, 0),
      endsAtUtc: weekDay(1, 17, 0),
      location: 'Стадион Юность',
      participantIds: [misha.id],
      responsibleMemberId: dmitry.id,
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=8',
    },
  ];

  for (const e of events) {
    const { participantIds, ...data } = e;
    await prisma.event.create({
      data: {
        ...data,
        familyId: family.id,
        timezone: 'Europe/Moscow',
        status: 'active',
        participants: {
          create: participantIds.map((memberId) => ({ memberId })),
        },
      },
    });
  }

  console.log('Seed complete.');
  console.log('Demo login: demo@family.local / demo1234');
  console.log(`Family id: ${family.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
