import 'dotenv/config';
import { createLogger } from './utils/logger';
import { startTelegramBot } from './bot/telegram-bot';
import { startTelegramCrawler } from './crawlers/telegram-crawler';
import { startTwitterCrawler } from './crawlers/twitter-crawler';
import { startWebCrawler } from './crawlers/web-crawler';
import { startScheduler } from './scheduler';
import { setPublisherBot } from './publisher/telegram-publisher';
import prisma from './db';

const log = createLogger('Main');

async function main(): Promise<void> {
  log.info('═══════════════════════════════════════');
  log.info('  Content Bot đang khởi động...');
  log.info('═══════════════════════════════════════');

  // Kiểm tra kết nối database
  try {
    await prisma.$connect();
    log.info('Kết nối database thành công');
  } catch (err) {
    log.error('Lỗi kết nối database:', err);
    process.exit(1);
  }

  // Khởi động Telegram Bot (admin interface)
  const bot = startTelegramBot();
  setPublisherBot(bot);

  // Khởi động crawlers
  await startTelegramCrawler();
  // await startTwitterCrawler(); // tắt — chưa cấu hình Twitter credits
  await startWebCrawler();

  // Khởi động scheduler (processor + publishers)
  startScheduler();

  log.info('═══════════════════════════════════════');
  log.info('  Content Bot đang chạy!');
  log.info('═══════════════════════════════════════');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  log.info('Nhận tín hiệu tắt, đóng kết nối...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log.info('Nhận tín hiệu terminate, đóng kết nối...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log.error('Lỗi không xử lý được:', err);
});

process.on('unhandledRejection', (reason) => {
  log.error('Promise rejection không xử lý:', reason);
});

main();
