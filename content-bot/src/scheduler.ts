import { config } from './config';
import { createLogger } from './utils/logger';
import { processNextItem } from './processor/deepseek';
import { publishNextToTelegram } from './publisher/telegram-publisher';
import { publishNextToTwitter } from './publisher/twitter-publisher';
import { cleanOldVideos } from './utils/video-downloader';

const log = createLogger('Scheduler');

function safeInterval(name: string, fn: () => Promise<void>, intervalMs: number): void {
  let running = false;

  setInterval(async () => {
    if (running) {
      log.debug(`${name} còn đang chạy, bỏ qua vòng này`);
      return;
    }
    running = true;
    try {
      await fn();
    } catch (err) {
      log.error(`Lỗi ${name}:`, err);
    } finally {
      running = false;
    }
  }, intervalMs);

  log.info(`${name} đã lên lịch mỗi ${intervalMs / 1000}s`);
}

export function startScheduler(): void {
  log.info('Khởi động Scheduler...');

  // DeepSeek processor — mỗi 15s
  safeInterval('Processor', processNextItem, config.processInterval * 1000);

  // Telegram publisher — mỗi 5s
  safeInterval('TelegramPublisher', publishNextToTelegram, config.publishTelegramInterval * 1000);

  // Twitter publisher — tắt (chưa cấu hình credits)
  // safeInterval('TwitterPublisher', publishNextToTwitter, config.publishTwitterInterval * 1000);

  // Dọn video cũ hơn 24h — chạy mỗi giờ
  setInterval(() => {
    try { cleanOldVideos(); } catch {}
  }, 60 * 60 * 1000);

  log.info('Tất cả schedulers đã khởi động');
}
