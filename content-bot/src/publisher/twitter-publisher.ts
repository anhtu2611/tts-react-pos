import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';
import prisma from '../db';
import { createLogger } from '../utils/logger';

const log = createLogger('TwitterPublisher');

function createClient(creds: {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}): TwitterApi | null {
  if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessSecret) {
    return null;
  }
  return new TwitterApi({
    appKey: creds.apiKey,
    appSecret: creds.apiSecret,
    accessToken: creds.accessToken,
    accessSecret: creds.accessSecret,
  });
}

const viClient = createClient(config.twitterVI);
const enClient = createClient(config.twitterEN);

if (!viClient) log.warn('Chưa cấu hình Twitter VI credentials');
if (!enClient) log.warn('Chưa cấu hình Twitter EN credentials');

export async function publishNextToTwitter(): Promise<void> {
  // Tìm item đã đăng Telegram nhưng chưa có tweet VI
  const item = await prisma.contentItem.findFirst({
    where: {
      status: 'published',
      twitterVIId: null,
      tweetVI: { not: null },
    },
    orderBy: { publishedAt: 'asc' },
  });

  if (!item) return;

  log.info(`Đăng Twitter cho ID=${item.id}`);

  let twitterVIId: string | undefined;
  let twitterENId: string | undefined;

  // Đăng tweet tiếng Việt
  if (viClient && item.tweetVI) {
    try {
      const tweet = await viClient.v2.tweet(item.tweetVI);
      twitterVIId = tweet.data.id;
      log.info(`ID=${item.id} tweet VI: ${tweet.data.id}`);
    } catch (err) {
      log.error(`ID=${item.id} lỗi tweet VI:`, (err as Error).message);
    }
  }

  // Chờ trước khi đăng EN (tránh rate limit)
  if (twitterVIId) await sleep(3000);

  // Đăng tweet tiếng Anh
  if (enClient && item.tweetEN) {
    try {
      const tweet = await enClient.v2.tweet(item.tweetEN);
      twitterENId = tweet.data.id;
      log.info(`ID=${item.id} tweet EN: ${tweet.data.id}`);
    } catch (err) {
      log.error(`ID=${item.id} lỗi tweet EN:`, (err as Error).message);
    }
  }

  // Cập nhật DB dù chỉ đăng được 1 tweet
  if (twitterVIId || twitterENId) {
    await prisma.contentItem.update({
      where: { id: item.id },
      data: {
        twitterVIId: twitterVIId ?? null,
        twitterENId: twitterENId ?? null,
      },
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
