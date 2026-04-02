process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

jest.mock('@config/database', () => ({
  prisma: {
    profile: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock crypto to track encrypt/decrypt calls
jest.mock('@utils/crypto', () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
  randomInt: jest.fn((min: number, max: number) => min),
}));

import {
  createProfile,
  getProfiles,
  getProfileById,
  updateProfile,
  deleteProfile,
  getProfileForBooking,
} from './profiles.service';
import { prisma } from '@config/database';
import { encrypt, decrypt } from '@utils/crypto';

const mockProfile = prisma.profile as jest.Mocked<typeof prisma.profile>;

const fakeProfileRow = {
  id: 'profile-1',
  fullName: 'Test Applicant',
  passportNumberEnc: 'enc:AB123456',
  dobEnc: 'enc:1990-01-15',
  vfsPasswordEnc: 'enc:VfsPass123!',
  passportExpiry: new Date('2030-12-31'),
  passportIssueDate: null,
  nationality: 'AGO',
  email: 'applicant@example.com',
  phone: '+244912345678',
  gender: 'MALE',
  priority: 'NORMAL',
  isActive: true,
  createdAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('profiles.service', () => {
  describe('createProfile()', () => {
    it('stores passportNumberEnc not raw passportNumber', async () => {
      (mockProfile.create as jest.Mock).mockResolvedValue(fakeProfileRow);

      await createProfile({
        fullName: 'Test',
        passportNumber: 'AB123456',
        dob: '1990-01-15',
        passportExpiry: '2030-12-31',
        nationality: 'AGO',
        email: 'test@example.com',
        phone: '+244912345678',
        gender: 'MALE',
        priority: 'NORMAL',
        vfsPassword: 'pass',
      } as never);

      const createCall = (mockProfile.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.passportNumberEnc).toBe('enc:AB123456');
      expect(createCall.data.passportNumber).toBeUndefined();
    });

    it('stores dobEnc not raw dob', async () => {
      (mockProfile.create as jest.Mock).mockResolvedValue(fakeProfileRow);

      await createProfile({
        fullName: 'Test',
        passportNumber: 'AB123456',
        dob: '1990-01-15',
        passportExpiry: '2030-12-31',
        nationality: 'AGO',
        email: 'test@example.com',
        phone: '+244912345678',
        gender: 'MALE',
        priority: 'NORMAL',
      } as never);

      const createCall = (mockProfile.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.dobEnc).toBe('enc:1990-01-15');
      expect(createCall.data.dob).toBeUndefined();
    });

    it('encrypts vfsPassword when provided', async () => {
      (mockProfile.create as jest.Mock).mockResolvedValue(fakeProfileRow);

      await createProfile({
        fullName: 'Test',
        passportNumber: 'AB123456',
        dob: '1990-01-15',
        passportExpiry: '2030-12-31',
        nationality: 'AGO',
        email: 'test@example.com',
        phone: '+244912345678',
        gender: 'MALE',
        priority: 'NORMAL',
        vfsPassword: 'VfsPass123!',
      } as never);

      const createCall = (mockProfile.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.vfsPasswordEnc).toBe('enc:VfsPass123!');
    });

    it('omits vfsPasswordEnc when vfsPassword not provided', async () => {
      (mockProfile.create as jest.Mock).mockResolvedValue(fakeProfileRow);

      await createProfile({
        fullName: 'Test',
        passportNumber: 'AB123456',
        dob: '1990-01-15',
        passportExpiry: '2030-12-31',
        nationality: 'AGO',
        email: 'test@example.com',
        phone: '+244912345678',
        gender: 'MALE',
        priority: 'NORMAL',
      } as never);

      const createCall = (mockProfile.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.vfsPasswordEnc).toBeUndefined();
    });

    it('converts passportExpiry string to Date object', async () => {
      (mockProfile.create as jest.Mock).mockResolvedValue(fakeProfileRow);

      await createProfile({
        fullName: 'Test',
        passportNumber: 'AB123456',
        dob: '1990-01-15',
        passportExpiry: '2030-12-31',
        nationality: 'AGO',
        email: 'test@example.com',
        phone: '+244912345678',
        gender: 'MALE',
        priority: 'NORMAL',
      } as never);

      const createCall = (mockProfile.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.passportExpiry).toBeInstanceOf(Date);
    });
  });

  describe('getProfiles()', () => {
    it('decrypts passportNumber and dob on each returned item', async () => {
      (mockProfile.findMany as jest.Mock).mockResolvedValue([fakeProfileRow]);

      const result = await getProfiles({ limit: 10 });

      expect(result.items[0].passportNumber).toBe('AB123456');
      expect(result.items[0].dob).toBe('1990-01-15');
    });

    it('masks passport number to show only last 4 chars', async () => {
      (mockProfile.findMany as jest.Mock).mockResolvedValue([fakeProfileRow]);

      const result = await getProfiles({ limit: 10 });

      expect(result.items[0].passportNumberMasked).toBe('****3456');
    });

    it('returns nextCursor when there are more items than limit', async () => {
      const twoProfiles = [
        { ...fakeProfileRow, id: 'p1' },
        { ...fakeProfileRow, id: 'p2' },
      ];
      (mockProfile.findMany as jest.Mock).mockResolvedValue(twoProfiles);

      const result = await getProfiles({ limit: 1 });

      expect(result.nextCursor).toBe('p1');
      expect(result.items).toHaveLength(1);
    });

    it('returns nextCursor=null when all items fit within limit', async () => {
      (mockProfile.findMany as jest.Mock).mockResolvedValue([fakeProfileRow]);

      const result = await getProfiles({ limit: 10 });

      expect(result.nextCursor).toBeNull();
    });

    it('applies search filter when provided', async () => {
      (mockProfile.findMany as jest.Mock).mockResolvedValue([]);

      await getProfiles({ limit: 10, search: 'Test' });

      const whereArg = (mockProfile.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.fullName).toBeDefined();
      expect(whereArg.fullName.contains).toBe('Test');
    });

    it('applies priority filter when provided', async () => {
      (mockProfile.findMany as jest.Mock).mockResolvedValue([]);

      await getProfiles({ limit: 10, priority: 'HIGH' as never });

      const whereArg = (mockProfile.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.priority).toBe('HIGH');
    });
  });

  describe('getProfileById()', () => {
    it('returns decrypted profile fields', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(fakeProfileRow);

      const result = await getProfileById('profile-1');

      expect(result.passportNumber).toBe('AB123456');
      expect(result.dob).toBe('1990-01-15');
    });

    it('throws AppError(404, NOT_FOUND) when profile does not exist', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(getProfileById('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('updateProfile()', () => {
    it('re-encrypts passportNumber when field is provided', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(fakeProfileRow);
      (mockProfile.update as jest.Mock).mockResolvedValue(fakeProfileRow);

      await updateProfile('profile-1', { passportNumber: 'ZZ999999' } as never);

      const updateCall = (mockProfile.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.passportNumberEnc).toBe('enc:ZZ999999');
      expect(updateCall.data.passportNumber).toBeUndefined();
    });

    it('re-encrypts dob when field is provided', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(fakeProfileRow);
      (mockProfile.update as jest.Mock).mockResolvedValue(fakeProfileRow);

      await updateProfile('profile-1', { dob: '1995-05-05' } as never);

      const updateCall = (mockProfile.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.dobEnc).toBe('enc:1995-05-05');
      expect(updateCall.data.dob).toBeUndefined();
    });

    it('re-encrypts vfsPassword when provided', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(fakeProfileRow);
      (mockProfile.update as jest.Mock).mockResolvedValue(fakeProfileRow);

      await updateProfile('profile-1', { vfsPassword: 'NewPass123!' } as never);

      const updateCall = (mockProfile.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.vfsPasswordEnc).toBe('enc:NewPass123!');
    });

    it('sets passportIssueDate to null when empty string passed', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(fakeProfileRow);
      (mockProfile.update as jest.Mock).mockResolvedValue(fakeProfileRow);

      await updateProfile('profile-1', { passportIssueDate: '' } as never);

      const updateCall = (mockProfile.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.passportIssueDate).toBeNull();
    });

    it('throws AppError(404, NOT_FOUND) when profile does not exist', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(updateProfile('nonexistent', {} as never)).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('deleteProfile()', () => {
    it('soft-deletes by setting isActive=false', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(fakeProfileRow);
      (mockProfile.update as jest.Mock).mockResolvedValue(fakeProfileRow);

      await deleteProfile('profile-1');

      const updateCall = (mockProfile.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.isActive).toBe(false);
    });

    it('throws AppError(404, NOT_FOUND) when profile does not exist', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(deleteProfile('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getProfileForBooking()', () => {
    it('returns fully decrypted passportNumber, dob, vfsPassword', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(fakeProfileRow);

      const result = await getProfileForBooking('profile-1');

      expect(result.passportNumber).toBe('AB123456');
      expect(result.dob).toBe('1990-01-15');
      expect(result.vfsPassword).toBe('VfsPass123!');
    });

    it('returns empty string for vfsPassword when vfsPasswordEnc is null', async () => {
      const rowNoVfsPw = { ...fakeProfileRow, vfsPasswordEnc: null };
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(rowNoVfsPw);

      const result = await getProfileForBooking('profile-1');

      expect(result.vfsPassword).toBe('');
    });

    it('throws AppError(404, NOT_FOUND) when profile not found or inactive', async () => {
      (mockProfile.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(getProfileForBooking('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });
});
