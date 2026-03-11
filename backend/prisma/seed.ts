import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient, Role, Priority } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vfsbot.local' },
    update: {},
    create: {
      email: 'admin@vfsbot.local',
      passwordHash,
      role: Role.ADMIN,
    },
  });
  console.log(`Seeded admin user: ${admin.email}`);

  // Operator user
  const opHash = await bcrypt.hash('operator123', 12);
  const operator = await prisma.user.upsert({
    where: { email: 'operator@vfsbot.local' },
    update: {},
    create: {
      email: 'operator@vfsbot.local',
      passwordHash: opHash,
      role: Role.OPERATOR,
    },
  });
  console.log(`Seeded operator user: ${operator.email}`);

  // Default settings
  const defaultSettings = [
    { key: 'notifications.telegram.enabled', value: false },
    { key: 'notifications.email.enabled', value: false },
    { key: 'notifications.push.enabled', value: false },
    { key: 'captcha.solver', value: 'manual' },
    { key: 'monitor.defaultIntervalMs', value: 10000 },
    { key: 'booking.concurrency', value: 3 },
    { key: 'booking.maxRetries', value: 3 },
    { key: 'vfs.selectors', value: {} },
  ];

  for (const s of defaultSettings) {
    await prisma.settings.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value },
    });
  }
  console.log('Seeded default settings');

  console.log('\n✅ Seed complete');
  console.log('   Admin:    admin@vfsbot.local / admin123');
  console.log('   Operator: operator@vfsbot.local / operator123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
