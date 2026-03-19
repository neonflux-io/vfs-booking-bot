/**
 * Seed script — populates the DB with test data for local development.
 * Run with: npm run db:seed
 *
 * Creates:
 *  - 1 ADMIN user   (admin@vfsbot.local / admin1234)
 *  - 1 OPERATOR user (operator@vfsbot.local / operator1234)
 *  - 5 applicant profiles (mix of HIGH/NORMAL priority)
 *  - 3 sample bookings (SUCCESS, FAILED, QUEUED)
 *  - Default settings (notifications off, manual captcha, 10s poll interval)
 *  - 2 sample log entries
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient, Role, Priority, BookingStatus, LogLevel, EventType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

// ── Encryption helper (mirrors crypto.ts) ─────────────────────────────────────

function encrypt(plaintext: string): string {
  const key = Buffer.from(process.env.PROFILE_ENCRYPTION_KEY!, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database…\n');

  // ── Users ──────────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vfsbot.local' },
    update: {},
    create: {
      email: 'admin@vfsbot.local',
      passwordHash: await bcrypt.hash('admin1234', 12),
      role: Role.ADMIN,
    },
  });
  console.log(`  ✅ Admin user: ${admin.email}`);

  const operator = await prisma.user.upsert({
    where: { email: 'operator@vfsbot.local' },
    update: {},
    create: {
      email: 'operator@vfsbot.local',
      passwordHash: await bcrypt.hash('operator1234', 12),
      role: Role.OPERATOR,
    },
  });
  console.log(`  ✅ Operator user: ${operator.email}`);

  // ── Applicant profiles ─────────────────────────────────────────────────────
  const profileData = [
    {
      id: 'seed-profile-1',
      fullName: 'João Silva',
      passportNumber: 'P1234567',
      dob: '1990-05-15',
      passportExpiry: new Date('2028-05-14'),
      nationality: 'Angolan',
      email: 'joao.silva@example.com',
      phone: '+244923000001',
      priority: Priority.HIGH,
    },
    {
      id: 'seed-profile-2',
      fullName: 'Maria Santos',
      passportNumber: 'P7654321',
      dob: '1985-11-22',
      passportExpiry: new Date('2027-11-21'),
      nationality: 'Angolan',
      email: 'maria.santos@example.com',
      phone: '+244923000002',
      priority: Priority.HIGH,
    },
    {
      id: 'seed-profile-3',
      fullName: 'Carlos Mendes',
      passportNumber: 'P9876543',
      dob: '1993-03-08',
      passportExpiry: new Date('2029-03-07'),
      nationality: 'Angolan',
      email: 'carlos.mendes@example.com',
      phone: '+244923000003',
      priority: Priority.NORMAL,
    },
    {
      id: 'seed-profile-4',
      fullName: 'Ana Ferreira',
      passportNumber: 'P1122334',
      dob: '1988-07-30',
      passportExpiry: new Date('2026-07-29'),
      nationality: 'Angolan',
      email: 'ana.ferreira@example.com',
      phone: '+244923000004',
      priority: Priority.NORMAL,
    },
    {
      id: 'seed-profile-5',
      fullName: 'Pedro Costa',
      passportNumber: 'P5566778',
      dob: '1995-12-01',
      passportExpiry: new Date('2030-12-01'),
      nationality: 'Angolan',
      email: 'pedro.costa@example.com',
      phone: '+244923000005',
      priority: Priority.NORMAL,
    },
  ];

  for (const p of profileData) {
    await prisma.profile.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        fullName: p.fullName,
        passportNumberEnc: encrypt(p.passportNumber),
        dobEnc: encrypt(p.dob),
        passportExpiry: p.passportExpiry,
        nationality: p.nationality,
        email: p.email,
        phone: p.phone,
        priority: p.priority,
        isActive: true,
      },
    });
    console.log(`  ✅ Profile: ${p.fullName} (${p.priority})`);
  }

  // ── Sample bookings ────────────────────────────────────────────────────────
  await prisma.booking.upsert({
    where: { id: 'seed-booking-1' },
    update: {},
    create: {
      id: 'seed-booking-1',
      profileId: 'seed-profile-1',
      destination: 'portugal',
      visaType: 'tourist',
      slotDate: new Date('2026-04-10'),
      slotTime: '09:30',
      status: BookingStatus.SUCCESS,
      confirmationNo: 'VFS-PTG-2026-001',
      attempt: 1,
      completedAt: new Date('2026-03-18T09:31:42Z'),
    },
  });
  console.log('  ✅ Booking: João → Portugal (SUCCESS)');

  await prisma.booking.upsert({
    where: { id: 'seed-booking-2' },
    update: {},
    create: {
      id: 'seed-booking-2',
      profileId: 'seed-profile-2',
      destination: 'brazil',
      visaType: 'business',
      slotDate: new Date('2026-04-15'),
      slotTime: '10:00',
      status: BookingStatus.FAILED,
      errorMessage: 'Slot was taken before submission could complete',
      attempt: 3,
      completedAt: new Date('2026-03-19T14:05:10Z'),
    },
  });
  console.log('  ✅ Booking: Maria → Brazil (FAILED)');

  await prisma.booking.upsert({
    where: { id: 'seed-booking-3' },
    update: {},
    create: {
      id: 'seed-booking-3',
      profileId: 'seed-profile-3',
      destination: 'portugal',
      visaType: 'student',
      status: BookingStatus.QUEUED,
      attempt: 1,
    },
  });
  console.log('  ✅ Booking: Carlos → Portugal (QUEUED)');

  // ── Default settings ───────────────────────────────────────────────────────
  const defaultSettings: Array<{ key: string; value: unknown }> = [
    { key: 'notifications.telegram.enabled', value: false },
    { key: 'notifications.email.enabled', value: false },
    { key: 'notifications.push.enabled', value: false },
    { key: 'notifications.sms.enabled', value: false },
    { key: 'captcha.solver', value: 'manual' },
    { key: 'monitor.defaultIntervalMs', value: 10000 },
    { key: 'booking.concurrency', value: 3 },
    { key: 'booking.maxRetries', value: 3 },
    { key: 'booking.parallelTabs', value: 2 },
    { key: 'vfs.selectors', value: {} },
  ];

  for (const s of defaultSettings) {
    await prisma.settings.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value as never },
    });
  }
  console.log(`  ✅ ${defaultSettings.length} default settings seeded`);

  // ── Sample logs ────────────────────────────────────────────────────────────
  await prisma.log.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-log-1',
        level: LogLevel.INFO,
        eventType: EventType.BOOKING_SUCCESS,
        message: 'Booking confirmed for João Silva — VFS-PTG-2026-001',
        profileId: 'seed-profile-1',
        destination: 'portugal',
        result: 'SUCCESS',
      },
      {
        id: 'seed-log-2',
        level: LogLevel.ERROR,
        eventType: EventType.BOOKING_FAILED,
        message: 'Booking failed after 3 attempts — slot taken before submission',
        profileId: 'seed-profile-2',
        destination: 'brazil',
        result: 'FAILED',
      },
    ],
  });
  console.log('  ✅ 2 sample log entries');

  console.log('\n✅ Seed complete!\n');
  console.log('  Login credentials:');
  console.log('  Admin    → admin@vfsbot.local    / admin1234');
  console.log('  Operator → operator@vfsbot.local / operator1234');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
