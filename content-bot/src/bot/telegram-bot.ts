import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import prisma from '../db';
import { createLogger } from '../utils/logger';
import { downloadVideo } from '../utils/video-downloader';

const log = createLogger('TelegramBot');

function isAdmin(userId: number): boolean {
  return config.adminUserIds.includes(userId);
}

function formatDate(d: Date): string {
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function startTelegramBot(): TelegramBot {
  const bot = new TelegramBot(config.telegramBotToken, { polling: true });
  log.info('Khởi động Telegram Bot...');

  // Middleware kiểm tra admin
  async function requireAdmin(
    msg: TelegramBot.Message,
    cb: () => Promise<void>
  ): Promise<void> {
    if (!msg.from || !isAdmin(msg.from.id)) {
      await bot.sendMessage(msg.chat.id, '⛔ Bạn không có quyền sử dụng bot này.');
      return;
    }
    await cb();
  }

  // /start
  bot.onText(/^\/start$/, (msg) => {
    requireAdmin(msg, async () => {
      await bot.sendMessage(
        msg.chat.id,
        `👋 *Content Bot đang hoạt động!*\n\n` +
          `Các lệnh có sẵn:\n` +
          `/add <nội dung> — Thêm vào Rổ Content\n` +
          `/video <url> — Tải & đăng lại video (Twitter/X, YouTube...)\n` +
          `/queue — Xem hàng chờ xử lý\n` +
          `/status — Thống kê tổng quan\n` +
          `/sources — Danh sách nguồn\n` +
          `/addsource <type> <handle> — Thêm nguồn\n` +
          `/removesource <handle> — Xoá nguồn\n\n` +
          `💡 Gửi tin nhắn thường (không có /) → tự động thêm vào Rổ Content\n` +
          `\nVí dụ thêm nguồn web/RSS:\n/addsource web https://vnexpress.net/rss/tin-moi-nhat.rss`,
        { parse_mode: 'Markdown' }
      );
    });
  });

  // /add <text>
  bot.onText(/^\/add (.+)/s, (msg, match) => {
    requireAdmin(msg, async () => {
      const text = match?.[1]?.trim();
      if (!text) {
        await bot.sendMessage(msg.chat.id, '⚠ Cú pháp: /add <nội dung>');
        return;
      }
      await addToQueue(bot, msg.chat.id, text, 'manual', 'admin');
    });
  });

  // /queue
  bot.onText(/^\/queue$/, (msg) => {
    requireAdmin(msg, async () => {
      const [pending, processing, approved] = await Promise.all([
        prisma.contentItem.count({ where: { status: 'pending' } }),
        prisma.contentItem.count({ where: { status: 'processing' } }),
        prisma.contentItem.count({ where: { status: 'approved' } }),
      ]);
      const items = await prisma.contentItem.findMany({
        where: { status: { in: ['pending', 'processing', 'approved'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, source: true, sourceChannel: true, status: true, createdAt: true, originalText: true },
      });

      let msg2 = `📋 *Hàng chờ xử lý*\n\n`;
      msg2 += `⏳ Chờ xử lý: ${pending}\n`;
      msg2 += `⚙ Đang xử lý: ${processing}\n`;
      msg2 += `✅ Đã duyệt: ${approved}\n\n`;
      msg2 += `*5 tin gần nhất:*\n`;
      for (const item of items) {
        const preview = item.originalText.slice(0, 60).replace(/\n/g, ' ');
        msg2 += `• [${item.id}] ${item.source}/${item.sourceChannel ?? '?'} [${item.status}]\n  ${preview}...\n`;
      }
      await bot.sendMessage(msg.chat.id, msg2, { parse_mode: 'Markdown' });
    });
  });

  // /status
  bot.onText(/^\/status$/, (msg) => {
    requireAdmin(msg, async () => {
      const [total, pending, approved, published, rejected] = await Promise.all([
        prisma.contentItem.count(),
        prisma.contentItem.count({ where: { status: 'pending' } }),
        prisma.contentItem.count({ where: { status: 'approved' } }),
        prisma.contentItem.count({ where: { status: 'published' } }),
        prisma.contentItem.count({ where: { status: 'rejected' } }),
      ]);
      const sources = await prisma.contentSource.count({ where: { active: true } });
      const last = await prisma.contentItem.findFirst({
        where: { status: 'published' },
        orderBy: { publishedAt: 'desc' },
      });

      let text = `📊 *Thống kê Content Bot*\n\n`;
      text += `📥 Tổng: ${total}\n`;
      text += `⏳ Chờ xử lý: ${pending}\n`;
      text += `✅ Đã duyệt: ${approved}\n`;
      text += `📢 Đã đăng: ${published}\n`;
      text += `❌ Từ chối: ${rejected}\n`;
      text += `📡 Nguồn đang theo dõi: ${sources}\n`;
      if (last?.publishedAt) {
        text += `\n🕐 Đăng cuối: ${formatDate(last.publishedAt)}`;
      }
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });
  });

  // /sources
  bot.onText(/^\/sources$/, (msg) => {
    requireAdmin(msg, async () => {
      const sources = await prisma.contentSource.findMany({ orderBy: { type: 'asc' } });
      if (!sources.length) {
        await bot.sendMessage(msg.chat.id, '📭 Chưa có nguồn nào được cấu hình.');
        return;
      }
      let text = `📡 *Danh sách nguồn*\n\n`;
      for (const s of sources) {
        const icon = s.type === 'telegram' ? '📨' : '🐦';
        const status = s.active ? '✅' : '⏸';
        text += `${icon} ${status} [${s.type}] \`${s.handle}\`\n`;
      }
      text += `\nDùng /addsource <type> <handle> để thêm\nDùng /removesource <handle> để xoá`;
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });
  });

  // /addsource <type> <handle>
  bot.onText(/^\/addsource (\S+) (\S+)$/, (msg, match) => {
    requireAdmin(msg, async () => {
      const type = match?.[1]?.toLowerCase() ?? '';
      const handle = match?.[2] ?? '';
      if (!['telegram', 'twitter', 'web'].includes(type)) {
        await bot.sendMessage(msg.chat.id, '⚠ type phải là `telegram`, `twitter` hoặc `web`', { parse_mode: 'Markdown' });
        return;
      }
      try {
        await prisma.contentSource.upsert({
          where: { handle },
          create: { type, handle, active: true },
          update: { type, active: true },
        });
        await bot.sendMessage(msg.chat.id, `✅ Đã thêm nguồn \`${handle}\` (${type})`, { parse_mode: 'Markdown' });
        log.info(`Admin thêm nguồn: [${type}] ${handle}`);
      } catch (err) {
        log.error('addsource error:', err);
        await bot.sendMessage(msg.chat.id, '❌ Lỗi khi thêm nguồn.');
      }
    });
  });

  // /removesource <handle>
  bot.onText(/^\/removesource (\S+)$/, (msg, match) => {
    requireAdmin(msg, async () => {
      const handle = match?.[1] ?? '';
      try {
        const existing = await prisma.contentSource.findUnique({ where: { handle } });
        if (!existing) {
          await bot.sendMessage(msg.chat.id, `⚠ Không tìm thấy nguồn \`${handle}\``, { parse_mode: 'Markdown' });
          return;
        }
        await prisma.contentSource.delete({ where: { handle } });
        await bot.sendMessage(msg.chat.id, `✅ Đã xoá nguồn \`${handle}\``, { parse_mode: 'Markdown' });
        log.info(`Admin xoá nguồn: ${handle}`);
      } catch (err) {
        log.error('removesource error:', err);
        await bot.sendMessage(msg.chat.id, '❌ Lỗi khi xoá nguồn.');
      }
    });
  });

  // /video <url>
  bot.onText(/^\/video (\S+)$/, (msg, match) => {
    requireAdmin(msg, async () => {
      const url = match?.[1]?.trim();
      if (!url) {
        await bot.sendMessage(msg.chat.id, '⚠ Cú pháp: /video <url>');
        return;
      }
      await bot.sendMessage(msg.chat.id, `⏳ Đang tải video...\n${url}`);
      const info = await downloadVideo(url);
      if (!info) {
        await bot.sendMessage(msg.chat.id, '❌ Không thể tải video. Kiểm tra URL hoặc video quá dài/lớn.');
        return;
      }
      const item = await prisma.contentItem.create({
        data: {
          source: 'manual',
          sourceChannel: 'admin',
          originalText: info.title || url,
          videoPath: info.filePath,
          sourceUrl: url,
          status: 'pending',
        },
      });
      await bot.sendMessage(
        msg.chat.id,
        `✅ Đã tải video (ID: ${item.id})\n📹 ${info.title}\n⏱ ${info.duration}s\n→ Đang đưa vào hàng xử lý DeepSeek...`
      );
      log.info(`Admin thêm video ID=${item.id} từ ${url}`);
    });
  });

  // Tin nhắn thường (không phải lệnh) → thêm vào Rổ Content
  bot.on('message', (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    requireAdmin(msg, async () => {
      const text = msg.text!.trim();
      if (text.length < 5) return;
      await addToQueue(bot, msg.chat.id, text, 'manual', 'admin');
    });
  });

  bot.on('polling_error', (err) => {
    log.error('Polling error:', err.message);
  });

  log.info('Bot đã khởi động, đang lắng nghe lệnh...');
  return bot;
}

async function addToQueue(
  bot: TelegramBot,
  chatId: number,
  text: string,
  source: string,
  channel: string
): Promise<void> {
  try {
    const item = await prisma.contentItem.create({
      data: { source, sourceChannel: channel, originalText: text, status: 'pending' },
    });
    await bot.sendMessage(
      chatId,
      `✅ Đã thêm vào Rổ Content (ID: ${item.id})\n📝 Preview: ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`
    );
    log.info(`Thêm nội dung thủ công ID=${item.id}`);
  } catch (err) {
    log.error('Lỗi thêm vào queue:', err);
    await bot.sendMessage(chatId, '❌ Lỗi khi thêm nội dung vào hàng chờ.');
  }
}
