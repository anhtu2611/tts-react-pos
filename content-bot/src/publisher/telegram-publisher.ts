import * as fs from 'fs';
import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import prisma from '../db';
import { createLogger } from '../utils/logger';

const log = createLogger('TelegramPublisher');

let botInstance: TelegramBot | null = null;

export function setPublisherBot(bot: TelegramBot): void {
  botInstance = bot;
}

function escapeMarkdown(text: string): string {
  // Escape ký tự đặc biệt Markdown v1
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

export async function publishNextToTelegram(): Promise<void> {
  if (!botInstance) {
    log.warn('Bot chưa được khởi tạo');
    return;
  }

  const item = await prisma.contentItem.findFirst({
    where: {
      status: 'approved',
      telegramMsgId: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!item) return;

  // Thêm link nguồn cuối bài nếu là web
  const linkSuffix = (item.source === 'web' && item.sourceUrl)
    ? `\n\n🔗 ${item.sourceUrl}`
    : '';
  const text = (item.rewrittenText ?? '') + linkSuffix;
  if (!item.rewrittenText) {
    log.warn(`ID=${item.id} không có rewrittenText, bỏ qua`);
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { status: 'rejected', factCheckNote: 'Thiếu nội dung đã xử lý' },
    });
    return;
  }

  const hasVideo = !!(item.videoPath && fs.existsSync(item.videoPath));
  const hasImage = !hasVideo && !!(item.imagePath && fs.existsSync(item.imagePath));
  log.info(`Đăng lên Telegram: ID=${item.id}${hasVideo ? ' [có video]' : hasImage ? ' [có ảnh]' : ''}`);

  let msgId: string | undefined;

  if (hasVideo) {
    // Đăng video
    try {
      const videoStream = fs.createReadStream(item.videoPath!);
      const sent = await botInstance.sendVideo(config.telegramPublishChannel, videoStream, {
        caption: text.slice(0, 1024),
        supports_streaming: true,
      });
      msgId = String(sent.message_id);
    } catch (err) {
      log.error(`ID=${item.id} Lỗi đăng video, thử text:`, (err as Error).message);
    }
  } else if (hasImage) {
    // Đăng ảnh kèm caption — gửi bằng stream từ file
    try {
      const photoStream = fs.createReadStream(item.imagePath!);
      const sent = await botInstance.sendPhoto(config.telegramPublishChannel, photoStream, {
        caption: text.slice(0, 1024), // Telegram giới hạn caption 1024 ký tự
      });
      msgId = String(sent.message_id);
    } catch (err) {
      log.error(`ID=${item.id} Lỗi đăng ảnh, thử text:`, (err as Error).message);
    }
  }

  if (!msgId) {
    // Đăng text thuần (không có ảnh hoặc ảnh lỗi)
    try {
      const sent = await botInstance.sendMessage(config.telegramPublishChannel, text, {
        parse_mode: 'Markdown',
      });
      msgId = String(sent.message_id);
    } catch {
      try {
        const sent = await botInstance.sendMessage(config.telegramPublishChannel, text);
        msgId = String(sent.message_id);
      } catch (plainErr) {
        log.error(`ID=${item.id} Lỗi đăng Telegram:`, plainErr);
        return;
      }
    }
  }

  await prisma.contentItem.update({
    where: { id: item.id },
    data: {
      telegramMsgId: msgId,
      status: 'published',
      publishedAt: new Date(),
    },
  });

  log.info(`ID=${item.id} đã đăng Telegram (msg_id=${msgId})`);
}
