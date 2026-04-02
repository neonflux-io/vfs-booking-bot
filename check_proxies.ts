
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProxies() {
  try {
    console.log('--- Proxy Status Report ---');
    const proxies = await prisma.proxy.findMany();
    if (proxies.length === 0) {
      console.log('No proxies found in the database.');
    } else {
      console.table(proxies.map(p => ({
        host: p.host,
        port: p.port,
        status: p.status,
        blockCount: p.blockCount,
        lastUsed: p.lastUsedAt,
        lastBlocked: p.lastBlockedAt
      })));
    }

    console.log('\n--- Recent Proxy Logs (Last 20) ---');
    const logs = await prisma.log.findMany({
      where: {
        OR: [
          { eventType: 'IP_BLOCKED' },
          { message: { contains: 'proxy', mode: 'insensitive' } },
          { message: { contains: 'warm', mode: 'insensitive' } }
        ]
      },
      orderBy: { timestamp: 'desc' },
      take: 20
    });

    if (logs.length === 0) {
      console.log('No relevant logs found.');
    } else {
      logs.forEach(log => {
        console.log(`[${log.timestamp.toISOString()}] ${log.level} [${log.eventType}]: ${log.message}`);
      });
    }

  } catch (error) {
    console.error('Error checking proxies:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProxies();
