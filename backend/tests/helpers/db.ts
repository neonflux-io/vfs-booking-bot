import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

export async function seedAdminUser() {
  const hash = await bcrypt.hash('AdminPass123!', 10);
  return testPrisma.user.upsert({
    where: { email: 'admin@test.com' },
    create: { email: 'admin@test.com', passwordHash: hash, role: 'ADMIN' },
    update: {},
  });
}

export async function seedOperatorUser() {
  const hash = await bcrypt.hash('OperatorPass123!', 10);
  return testPrisma.user.upsert({
    where: { email: 'operator@test.com' },
    create: { email: 'operator@test.com', passwordHash: hash, role: 'OPERATOR' },
    update: {},
  });
}

export async function cleanDb() {
  // Order respects FK constraints
  await testPrisma.log.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.profile.deleteMany();
  await testPrisma.proxy.deleteMany();
  await testPrisma.settings.deleteMany();
  await testPrisma.pushSubscription.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.globalSettings.deleteMany();
}

export async function disconnectDb() {
  await testPrisma.$disconnect();
}
