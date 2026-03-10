import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding roles...');
  await prisma.role.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'admin' } });
  await prisma.role.upsert({ where: { id: 2 }, update: {}, create: { id: 2, name: 'student' } });
  await prisma.role.upsert({ where: { id: 3 }, update: {}, create: { id: 3, name: 'teacher' } });

  console.log('Seeding features...');
  const features = [
    { id: 1, name: 'students' },
    { id: 2, name: 'materials' },
    { id: 3, name: 'assessments' },
    { id: 4, name: 'payments' },
    { id: 5, name: 'ai_generation' },
  ];

  for (const feature of features) {
    await prisma.feature.upsert({
      where: { id: feature.id },
      update: {},
      create: feature,
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
