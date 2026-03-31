import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';
import prisma from '../db';
import { createLogger } from '../utils/logger';

const log = createLogger('TwitterCrawler');

// Lưu since_id cho mỗi account để chỉ lấy tweet mới
const sinceIds = new Map<string, string>();

async function getAccountList(): Promise<string[]> {
  const dbSources = await prisma.contentSource.findMany({
    where: { type: 'twitter', active: true },
  });
  const dbHandles = dbSources.map((s) => s.handle.replace(/^@/, ''));
  const envHandles = config.twitterSourceAccounts.map((s) => s.replace(/^@/, ''));
  return [...new Set([...dbHandles, ...envHandles])].filter(Boolean);
}

async function isProcessed(tweetId: string): Promise<boolean> {
  const existing = await prisma.processedMessage.findUnique({
    where: { source_externalId: { source: 'twitter', externalId: tweetId } },
  });
  return !!existing;
}

async function markProcessed(tweetId: string): Promise<void> {
  await prisma.processedMessage.upsert({
    where: { source_externalId: { source: 'twitter', externalId: tweetId } },
    create: { source: 'twitter', externalId: tweetId },
    update: {},
  });
}

export async function startTwitterCrawler(): Promise<void> {
  if (!config.twitterBearerToken) {
    log.warn('Chưa cấu hình TWITTER_BEARER_TOKEN — bỏ qua Twitter Crawler');
    return;
  }

  const client = new TwitterApi(config.twitterBearerToken);
  log.info('Twitter Crawler khởi động');

  // Khởi tạo since_id để bỏ qua tweet cũ (chỉ lấy tweet mới từ giờ)
  await initSinceIds(client);

  // Polling mỗi crawlInterval giây
  setInterval(() => crawlAll(client), config.crawlInterval * 1000);
  log.info(`Đang theo dõi Twitter, poll mỗi ${config.crawlInterval}s`);
}

async function initSinceIds(client: TwitterApi): Promise<void> {
  const accounts = await getAccountList();
  for (const username of accounts) {
    try {
      const user = await client.v2.userByUsername(username);
      if (!user.data) continue;

      const timeline = await client.v2.userTimeline(user.data.id, {
        max_results: 5,
        'tweet.fields': ['id'],
      });
      const tweets = timeline.data?.data ?? [];
      if (tweets.length > 0) {
        sinceIds.set(username, tweets[0].id);
        log.info(`Khởi tạo since_id cho @${username}: ${tweets[0].id} (bỏ qua tweet cũ)`);
      }
    } catch (err) {
      log.warn(`Không thể khởi tạo since_id cho @${username}:`, (err as Error).message);
    }
    await sleep(1000);
  }
}

async function crawlAll(client: TwitterApi): Promise<void> {
  const accounts = await getAccountList();
  for (const username of accounts) {
    try {
      await crawlAccount(client, username);
    } catch (err) {
      log.error(`Lỗi crawl @${username}:`, err);
    }
    await sleep(2000);
  }
}

async function crawlAccount(client: TwitterApi, username: string): Promise<void> {
  const user = await client.v2.userByUsername(username);
  if (!user.data) {
    log.warn(`Không tìm thấy tài khoản Twitter: @${username}`);
    return;
  }

  const params: Parameters<typeof client.v2.userTimeline>[1] = {
    max_results: 10,
    'tweet.fields': ['id', 'text', 'created_at', 'referenced_tweets'],
    expansions: ['referenced_tweets.id'],
  };

  const sinceId = sinceIds.get(username);
  if (sinceId) {
    params.since_id = sinceId;
  }

  const timeline = await client.v2.userTimeline(user.data.id, params);
  const tweets = timeline.data?.data ?? [];

  if (tweets.length === 0) return;

  // Cập nhật since_id để lần sau chỉ lấy mới hơn
  sinceIds.set(username, tweets[0].id);

  let newCount = 0;
  for (const tweet of tweets.reverse()) {
    // Bỏ qua retweet
    if (tweet.referenced_tweets?.some((r) => r.type === 'retweeted')) continue;
    // Bỏ qua nếu text quá ngắn
    if (tweet.text.trim().length < 20) continue;

    if (await isProcessed(tweet.id)) continue;
    await markProcessed(tweet.id);

    await prisma.contentItem.create({
      data: {
        source: 'twitter',
        sourceChannel: username,
        originalText: tweet.text,
        status: 'pending',
      },
    });
    newCount++;
  }

  if (newCount > 0) {
    log.info(`Lưu ${newCount} tweet mới từ @${username}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
