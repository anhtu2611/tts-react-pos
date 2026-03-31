import * as fs from 'fs';
import * as path from 'path';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { Api } from 'telegram';
import { config } from '../config';
import prisma from '../db';
import { createLogger } from '../utils/logger';

const IMAGES_DIR = path.resolve('data/images');
const VIDEOS_DIR = path.resolve('data/videos');
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

const log = createLogger('TelegramCrawler');

// Buffer gộp tin từ cùng nguồn trong khoảng thời gian ngắn
interface BufferEntry {
  texts: string[];
  imagePath?: string;
  videoPath?: string;
  timer: ReturnType<typeof setTimeout>;
}
const buffer = new Map<string, BufferEntry>();

async function isProcessed(externalId: string): Promise<boolean> {
  const existing = await prisma.processedMessage.findUnique({
    where: { source_externalId: { source: 'telegram', externalId } },
  });
  return !!existing;
}

async function markProcessed(externalId: string): Promise<void> {
  await prisma.processedMessage.upsert({
    where: { source_externalId: { source: 'telegram', externalId } },
    create: { source: 'telegram', externalId },
    update: {},
  });
}

async function flushBuffer(channelName: string): Promise<void> {
  const entry = buffer.get(channelName);
  if (!entry || entry.texts.length === 0) return;

  const combined = entry.texts.join('\n\n---\n\n');
  const imagePath = entry.imagePath;
  const videoPath = entry.videoPath;
  buffer.delete(channelName);

  try {
    await prisma.contentItem.create({
      data: {
        source: 'telegram',
        sourceChannel: channelName,
        originalText: combined,
        imagePath: imagePath ?? null,
        videoPath: videoPath ?? null,
        status: 'pending',
      },
    });
    const mediaTag = videoPath ? ' [có video]' : imagePath ? ' [có ảnh]' : '';
    log.info(`Lưu ${entry.texts.length} tin từ ${channelName} vào Rổ Content${mediaTag}`);
  } catch (err) {
    log.error(`Lỗi lưu tin từ ${channelName}:`, err);
  }
}

function bufferMessage(channelName: string, text: string, imagePath?: string, videoPath?: string): void {
  const mediaTag = videoPath ? ' [có video]' : imagePath ? ' [có ảnh]' : '';
  // Nếu buffer = 0, lưu thẳng không gộp
  if (config.telegramBufferSeconds === 0) {
    prisma.contentItem.create({
      data: {
        source: 'telegram',
        sourceChannel: channelName,
        originalText: text,
        imagePath: imagePath ?? null,
        videoPath: videoPath ?? null,
        status: 'pending',
      },
    }).then(() => log.info(`Lưu tin từ ${channelName} vào Rổ Content${mediaTag}`))
      .catch((err: Error) => log.error(`Lỗi lưu tin từ ${channelName}:`, err));
    return;
  }

  const existing = buffer.get(channelName);
  if (existing) {
    clearTimeout(existing.timer);
    existing.texts.push(text);
    if (imagePath && !existing.imagePath) existing.imagePath = imagePath;
    if (videoPath && !existing.videoPath) existing.videoPath = videoPath;
    existing.timer = setTimeout(() => flushBuffer(channelName), config.telegramBufferSeconds * 1000);
  } else {
    buffer.set(channelName, {
      texts: [text],
      imagePath,
      videoPath,
      timer: setTimeout(() => flushBuffer(channelName), config.telegramBufferSeconds * 1000),
    });
  }
}

async function downloadVideoFromMsg(
  client: TelegramClient,
  msg: Api.Message,
  externalId: string
): Promise<string | null> {
  try {
    if (!(msg.media instanceof Api.MessageMediaDocument)) return null;
    const doc = msg.media.document;
    if (!(doc instanceof Api.Document)) return null;
    const mimeType = doc.mimeType ?? '';
    if (!mimeType.startsWith('video/')) return null;

    // Giới hạn 50MB
    const size = typeof doc.size === 'bigint' ? Number(doc.size) : (doc.size as number) ?? 0;
    if (size > 50 * 1024 * 1024) {
      log.warn(`Video quá lớn (${(size / 1024 / 1024).toFixed(1)}MB), bỏ qua`);
      return null;
    }

    const ext = mimeType.includes('mp4') ? 'mp4' : 'mp4';
    const filename = `${externalId.replace(/[^a-z0-9_]/gi, '_')}.${ext}`;
    const filePath = path.join(VIDEOS_DIR, filename);

    const result = await client.downloadMedia(msg, {});
    if (!result) return null;

    let videoBuffer: Buffer;
    if (Buffer.isBuffer(result)) {
      videoBuffer = result;
    } else if (typeof result === 'string' && fs.existsSync(result)) {
      videoBuffer = fs.readFileSync(result);
    } else {
      return null;
    }

    if (videoBuffer.length === 0) return null;
    fs.writeFileSync(filePath, videoBuffer);
    log.info(`Đã tải video Telegram: ${filename} (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
    return filePath;
  } catch (err) {
    log.warn('Lỗi tải video Telegram:', (err as Error).message);
    return null;
  }
}

async function downloadPhoto(
  client: TelegramClient,
  msg: Api.Message,
  externalId: string
): Promise<string | null> {
  try {
    if (!msg.media) return null;

    const mediaType = msg.media.className;
    log.debug(`Media type: ${mediaType}`);

    const isPhoto = msg.media instanceof Api.MessageMediaPhoto;
    const isDoc = msg.media instanceof Api.MessageMediaDocument &&
      (msg.media.document instanceof Api.Document) &&
      msg.media.document.mimeType?.startsWith('image/');

    if (!isPhoto && !isDoc) {
      log.debug(`Bỏ qua media type không hỗ trợ: ${mediaType}`);
      return null;
    }

    const filename = `${externalId.replace(/[^a-z0-9_]/gi, '_')}.jpg`;
    const filePath = path.join(IMAGES_DIR, filename);

    // Lấy Buffer trực tiếp (không dùng outputFile để tránh nhận về path string)
    const result = await client.downloadMedia(msg, {});
    if (!result) return null;

    // result có thể là Buffer hoặc string path
    let imageBuffer: Buffer;
    if (Buffer.isBuffer(result)) {
      imageBuffer = result;
    } else if (typeof result === 'string' && result.length > 100) {
      // Là path string — đọc file đó
      if (fs.existsSync(result)) {
        imageBuffer = fs.readFileSync(result);
      } else {
        log.warn('downloadMedia trả về path nhưng file không tồn tại:', result);
        return null;
      }
    } else {
      log.warn('downloadMedia trả về kiểu không xác định:', typeof result);
      return null;
    }

    if (imageBuffer.length === 0) return null;

    // Kiểm tra magic bytes JPEG (FF D8 FF)
    if (imageBuffer[0] !== 0xFF || imageBuffer[1] !== 0xD8) {
      log.warn(`Ảnh không phải JPEG hợp lệ (bytes đầu: ${imageBuffer[0].toString(16)} ${imageBuffer[1].toString(16)})`);
      return null;
    }

    fs.writeFileSync(filePath, imageBuffer);
    log.info(`Đã tải ảnh: ${filename} (${imageBuffer.length} bytes)`);
    return filePath;
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // FILE_REFERENCE_EXPIRED: file tham chiếu cũ, bỏ qua
    if (!msg.includes('FILE_REFERENCE_EXPIRED')) {
      log.warn('Lỗi tải ảnh:', msg);
    }
    return null;
  }
}

async function getChannelList(client: TelegramClient): Promise<string[]> {
  // Lấy từ DB trước, fallback về .env
  const dbSources = await prisma.contentSource.findMany({
    where: { type: 'telegram', active: true },
  });
  const dbHandles = dbSources.map((s) => s.handle);
  const envHandles = config.telegramSourceChannels;
  const all = [...new Set([...dbHandles, ...envHandles])];
  return all.filter(Boolean);
}

export async function startTelegramCrawler(): Promise<void> {
  if (!config.telegramApiId || !config.telegramApiHash) {
    log.warn('Chưa cấu hình TELEGRAM_API_ID/HASH — bỏ qua Telegram Crawler');
    return;
  }
  if (!config.telegramSessionString) {
    log.warn('Chưa có TELEGRAM_SESSION_STRING — chạy "npm run telegram-auth" để tạo session');
    return;
  }

  const session = new StringSession(config.telegramSessionString);
  const client = new TelegramClient(session, config.telegramApiId, config.telegramApiHash, {
    connectionRetries: 5,
  });

  try {
    await client.start({ botAuthToken: undefined } as Parameters<typeof client.start>[0]);
    log.info('Kết nối Telegram thành công');
  } catch (err) {
    log.error('Lỗi kết nối Telegram:', err);
    return;
  }

  // Lắng nghe tin nhắn mới (realtime)
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const msg = event.message;
      const text = msg.text?.trim() || msg.message?.trim() || '';
      const hasPhoto = msg.media && (
        msg.media instanceof Api.MessageMediaPhoto ||
        (msg.media instanceof Api.MessageMediaDocument &&
          (msg.media.document instanceof Api.Document) &&
          msg.media.document.mimeType?.startsWith('image/'))
      );
      const hasVideo = msg.media instanceof Api.MessageMediaDocument &&
        (msg.media.document instanceof Api.Document) &&
        msg.media.document.mimeType?.startsWith('video/');

      // Bỏ qua nếu không có text VÀ không có media
      if (text.length < 5 && !hasPhoto && !hasVideo) return;

      const peer = msg.peerId;
      let channelName = 'unknown';

      if (peer instanceof Api.PeerChannel) {
        channelName = `channel_${peer.channelId}`;
      } else if (peer instanceof Api.PeerUser) {
        channelName = `user_${peer.userId}`;
      }

      const channels = await getChannelList(client);
      const isWatched = channels.some((ch) => {
        if (ch.startsWith('@')) return channelName.includes(ch.slice(1));
        return channelName.includes(ch);
      });
      if (!isWatched && channels.length > 0) return;

      const externalId = `${channelName}_${msg.id}`;
      if (await isProcessed(externalId)) return;
      await markProcessed(externalId);

      // Download media
      let imagePath: string | null = null;
      let videoPath: string | null = null;
      if (hasVideo) {
        videoPath = await downloadVideoFromMsg(client, msg, externalId);
      } else if (hasPhoto) {
        imagePath = await downloadPhoto(client, msg, externalId);
      }

      const mediaTag = videoPath ? ' [có video]' : imagePath ? ' [có ảnh]' : '';
      log.info(`Nhận tin từ ${channelName}${mediaTag}: ${text.slice(0, 60)}...`);
      bufferMessage(channelName, text, imagePath ?? undefined, videoPath ?? undefined);
    } catch (err) {
      log.error('Lỗi xử lý tin Telegram:', err);
    }
  }, new NewMessage({}));

  log.info('Telegram Crawler đang lắng nghe tin mới...');

  // Polling backup — đọc lại từng channel mỗi 60s
  setInterval(async () => {
    try {
      const channels = await getChannelList(client);
      for (const ch of channels) {
        await pollChannel(client, ch);
        await sleep(2000);
      }
    } catch (err) {
      log.error('Lỗi polling backup:', err);
    }
  }, config.crawlInterval * 1000);
}

async function pollChannel(client: TelegramClient, channelHandle: string): Promise<void> {
  try {
    const entity = await client.getEntity(channelHandle);
    const messages = await client.getMessages(entity, { limit: 10 });

    for (const msg of messages) {
      const text = msg.text?.trim() || msg.message?.trim() || '';
      const hasPhoto = msg.media && (
        msg.media instanceof Api.MessageMediaPhoto ||
        (msg.media instanceof Api.MessageMediaDocument &&
          (msg.media.document instanceof Api.Document) &&
          msg.media.document.mimeType?.startsWith('image/'))
      );
      const hasVideo = msg.media instanceof Api.MessageMediaDocument &&
        (msg.media.document instanceof Api.Document) &&
        msg.media.document.mimeType?.startsWith('video/');
      if (text.length < 5 && !hasPhoto && !hasVideo) continue;

      const externalId = `${channelHandle}_${msg.id}`;
      if (await isProcessed(externalId)) continue;
      await markProcessed(externalId);

      let imagePath: string | null = null;
      let videoPath: string | null = null;
      if (hasVideo) {
        videoPath = await downloadVideoFromMsg(client, msg, externalId);
      } else if (hasPhoto) {
        imagePath = await downloadPhoto(client, msg, externalId);
      }

      const mediaTag = videoPath ? ' [có video]' : imagePath ? ' [có ảnh]' : '';
      log.info(`[Polling] Tin mới từ ${channelHandle}${mediaTag}: ${text.slice(0, 60)}...`);
      bufferMessage(channelHandle, text, imagePath ?? undefined, videoPath ?? undefined);
    }
  } catch (err) {
    log.warn(`Lỗi poll channel ${channelHandle}:`, (err as Error).message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
