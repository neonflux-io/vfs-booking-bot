process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

// Mock dependencies before importing the module under test
jest.mock('@utils/crypto', () => ({
  randomInt: jest.fn(),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));

jest.mock('@utils/retry', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
  withRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

import { moveMouse, typeText, clickWithHover, randomScroll, humanDelay } from './humanBehavior';
import { randomInt } from '@utils/crypto';
import { sleep } from '@utils/retry';

const mockRandomInt = randomInt as jest.Mock;
const mockSleep = sleep as jest.Mock;

function makeMockPage() {
  const element = {
    boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
    click: jest.fn().mockResolvedValue(undefined),
  };

  return {
    mouse: {
      move: jest.fn().mockResolvedValue(undefined),
      wheel: jest.fn().mockResolvedValue(undefined),
    },
    click: jest.fn().mockResolvedValue(undefined),
    keyboard: {
      type: jest.fn().mockResolvedValue(undefined),
    },
    waitForSelector: jest.fn().mockResolvedValue(element),
    selectOption: jest.fn().mockResolvedValue(undefined),
    _element: element,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: randomInt returns lower bound
  mockRandomInt.mockImplementation((min: number) => min);
});

describe('humanBehavior', () => {
  describe('moveMouse()', () => {
    it('calls page.mouse.move at least once', async () => {
      mockRandomInt
        .mockReturnValueOnce(15)  // steps = 15
        .mockImplementation((min: number) => min); // subsequent calls return min

      const page = makeMockPage();
      await moveMouse(page, 400, 300);

      expect(page.mouse.move).toHaveBeenCalled();
    });

    it('calls page.mouse.move (steps+1) times', async () => {
      const steps = 15;
      mockRandomInt
        .mockReturnValueOnce(steps)   // steps
        .mockImplementation((min: number) => min);

      const page = makeMockPage();
      await moveMouse(page, 400, 300);

      expect(page.mouse.move).toHaveBeenCalledTimes(steps + 1);
    });

    it('calls sleep between each move step', async () => {
      const steps = 15;
      mockRandomInt
        .mockReturnValueOnce(steps)
        .mockImplementation((min: number) => min);

      const page = makeMockPage();
      await moveMouse(page, 400, 300);

      // sleep called once per step
      expect(mockSleep).toHaveBeenCalledTimes(steps + 1);
    });
  });

  describe('typeText()', () => {
    it('calls page.click on the selector first', async () => {
      const page = makeMockPage();
      await typeText(page, '#input', 'hi');

      expect(page.click).toHaveBeenCalledWith('#input');
    });

    it('calls page.keyboard.type once per character', async () => {
      const page = makeMockPage();
      const text = 'hello';
      await typeText(page, '#input', text);

      expect(page.keyboard.type).toHaveBeenCalledTimes(text.length);
    });

    it('total characters typed equals text.length', async () => {
      const page = makeMockPage();
      const text = 'AB123456';
      await typeText(page, '#input', text);

      expect(page.keyboard.type).toHaveBeenCalledTimes(text.length);
    });

    it('calls sleep after each character', async () => {
      const page = makeMockPage();
      const text = 'ab';
      await typeText(page, '#input', text);

      // sleep called: initial click delay + once per char + possible pauses
      expect(mockSleep).toHaveBeenCalled();
    });
  });

  describe('clickWithHover()', () => {
    it('calls page.waitForSelector with 10s timeout', async () => {
      const page = makeMockPage();
      await clickWithHover(page, '.button');

      expect(page.waitForSelector).toHaveBeenCalledWith(
        '.button',
        { timeout: 10_000 }
      );
    });

    it('calls element.click after hover', async () => {
      const page = makeMockPage();
      await clickWithHover(page, '.button');

      expect(page._element.click).toHaveBeenCalled();
    });
  });

  describe('randomScroll()', () => {
    it('calls page.mouse.wheel twice (down then up)', async () => {
      const page = makeMockPage();
      await randomScroll(page);

      expect(page.mouse.wheel).toHaveBeenCalledTimes(2);
    });

    it('first wheel call scrolls down (positive Y delta)', async () => {
      mockRandomInt.mockReturnValue(200); // scrollAmount = 200

      const page = makeMockPage();
      await randomScroll(page);

      const firstCall = (page.mouse.wheel as jest.Mock).mock.calls[0];
      expect(firstCall[1]).toBeGreaterThan(0);
    });

    it('second wheel call scrolls up (negative Y delta)', async () => {
      mockRandomInt.mockReturnValue(50);

      const page = makeMockPage();
      await randomScroll(page);

      const secondCall = (page.mouse.wheel as jest.Mock).mock.calls[1];
      expect(secondCall[1]).toBeLessThan(0);
    });
  });

  describe('humanDelay()', () => {
    it('calls sleep with value between min and max', async () => {
      mockRandomInt.mockReturnValue(750);

      await humanDelay(500, 1500);

      expect(mockSleep).toHaveBeenCalledWith(750);
    });

    it('uses default range 500-1500ms when no args passed', async () => {
      mockRandomInt.mockReturnValue(500);

      await humanDelay();

      expect(mockSleep).toHaveBeenCalledWith(500);
    });
  });
});
