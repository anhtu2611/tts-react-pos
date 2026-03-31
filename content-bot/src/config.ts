import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Thiếu biến môi trường: ${key}`);
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

export const config = {
  // Telegram Bot
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  adminUserIds: required('ADMIN_USER_IDS')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter(Boolean),
  telegramPublishChannel: required('TELEGRAM_PUBLISH_CHANNEL'),

  // Telegram Crawler
  telegramApiId: parseInt(optional('TELEGRAM_API_ID', '0'), 10),
  telegramApiHash: optional('TELEGRAM_API_HASH'),
  telegramSessionString: optional('TELEGRAM_SESSION_STRING'),
  telegramSourceChannels: optional('TELEGRAM_SOURCE_CHANNELS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  telegramBufferSeconds: optionalInt('TELEGRAM_BUFFER_SECONDS', 180),

  // Twitter Crawler
  twitterBearerToken: optional('TWITTER_BEARER_TOKEN'),
  twitterSourceAccounts: optional('TWITTER_SOURCE_ACCOUNTS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Twitter Publisher VI
  twitterVI: {
    apiKey: optional('TWITTER_VI_API_KEY'),
    apiSecret: optional('TWITTER_VI_API_SECRET'),
    accessToken: optional('TWITTER_VI_ACCESS_TOKEN'),
    accessSecret: optional('TWITTER_VI_ACCESS_SECRET'),
  },

  // Twitter Publisher EN
  twitterEN: {
    apiKey: optional('TWITTER_EN_API_KEY'),
    apiSecret: optional('TWITTER_EN_API_SECRET'),
    accessToken: optional('TWITTER_EN_ACCESS_TOKEN'),
    accessSecret: optional('TWITTER_EN_ACCESS_SECRET'),
  },

  // DeepSeek
  deepseekApiKey: required('DEEPSEEK_API_KEY'),
  deepseekModel: optional('DEEPSEEK_MODEL', 'deepseek-chat'),

  // Scheduler (giây)
  crawlInterval: optionalInt('CRAWL_INTERVAL_SECONDS', 60),
  processInterval: optionalInt('PROCESS_INTERVAL_SECONDS', 15),
  publishTelegramInterval: optionalInt('PUBLISH_TELEGRAM_INTERVAL_SECONDS', 5),
  publishTwitterInterval: optionalInt('PUBLISH_TWITTER_INTERVAL_SECONDS', 20),
};
