/**
 * Stress test — 100 Socket.io clients receive broadcast events
 *
 * Pass criteria:
 * - All 100 clients connect successfully
 * - Each client receives every LOG_ENTRY broadcast (zero missed)
 * - p99 per-client latency < 200ms
 */
import path from 'path';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

import http from 'http';
import { Server as IOServer } from 'socket.io';
import { io as ioClient, Socket } from 'socket.io-client';

const CLIENT_COUNT = 100;
const BROADCAST_COUNT = 20;        // emit 20 events over 10s (every 500ms)
const BROADCAST_INTERVAL_MS = 500;
const EVENT_NAME = 'LOG_ENTRY';

function createTestServer(): { server: http.Server; io: IOServer; port: number } {
  const server = http.createServer();
  const io = new IOServer(server, { cors: { origin: '*' } });
  server.listen(0); // random port
  const port = (server.address() as any).port as number;
  return { server, io, port };
}

describe('WebSocket broadcast stress — 100 clients × 20 events', () => {
  jest.setTimeout(60_000);

  let server: http.Server;
  let io: IOServer;
  let port: number;
  let clients: Socket[] = [];

  beforeAll((done) => {
    const result = createTestServer();
    server = result.server;
    io = result.io;
    port = result.port;
    done();
  });

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('100 clients connect and receive all broadcast events', async () => {
    // Track received events per client: clientIndex → count
    const received = new Array(CLIENT_COUNT).fill(0);
    const latencies: number[] = [];

    // Connect all clients
    const connectPromises = Array.from({ length: CLIENT_COUNT }, (_, i) =>
      new Promise<Socket>((resolve) => {
        const c = ioClient(`http://localhost:${port}`, { transports: ['websocket'] });
        c.on('connect', () => {
          c.on(EVENT_NAME, (payload: { sentAt: number }) => {
            received[i]++;
            if (payload?.sentAt) {
              latencies.push(Date.now() - payload.sentAt);
            }
          });
          resolve(c);
        });
      })
    );

    clients = await Promise.all(connectPromises);
    expect(clients.length).toBe(CLIENT_COUNT);

    // Wait for all clients to connect to the server
    await new Promise((r) => setTimeout(r, 1_000));

    // Broadcast events at regular intervals
    for (let e = 0; e < BROADCAST_COUNT; e++) {
      io.emit(EVENT_NAME, { sentAt: Date.now(), seq: e, message: `Stress event ${e}` });
      await new Promise((r) => setTimeout(r, BROADCAST_INTERVAL_MS));
    }

    // Allow propagation
    await new Promise((r) => setTimeout(r, 2_000));

    // Every client should have received every event
    const allReceived = received.every((count) => count === BROADCAST_COUNT);
    expect(allReceived).toBe(true);

    // p99 latency < 200ms
    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      const p99 = latencies[p99Index] ?? latencies[latencies.length - 1];
      expect(p99).toBeLessThan(200);
    }
  });
});
