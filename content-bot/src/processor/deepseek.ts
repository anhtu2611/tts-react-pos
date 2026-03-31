import OpenAI from 'openai';
import { config } from '../config';
import prisma from '../db';
import { createLogger } from '../utils/logger';

const log = createLogger('DeepSeek');

const client = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: 'https://api.deepseek.com',
});

interface ProcessResult {
  rewrittenText: string;
  rewrittenTextEn: string;
  tweetVI: string;
  tweetEN: string;
  factCheckNote: string;
  shouldPublish: boolean;
  rejectReason?: string;
}

// ── Duplicate detection ──────────────────────────────────────
function getBigrams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

function bigramSimilarity(a: string, b: string): number {
  const setA = getBigrams(a);
  const setB = getBigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let common = 0;
  for (const bg of setA) {
    if (setB.has(bg)) common++;
  }
  return (2 * common) / (setA.size + setB.size);
}

async function isDuplicate(text: string): Promise<boolean> {
  // So sánh với các bài đã duyệt trong 48h gần nhất
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentItems = await prisma.contentItem.findMany({
    where: {
      status: { in: ['approved', 'published'] },
      createdAt: { gte: since },
    },
    select: { originalText: true, rewrittenText: true },
  });

  for (const item of recentItems) {
    if (bigramSimilarity(text, item.originalText) >= 0.7) return true;
    if (item.rewrittenText && bigramSimilarity(text, item.rewrittenText) >= 0.7) return true;
  }
  return false;
}

// ── Strip URLs, handles, source names ────────────────────────
function stripLinks(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@\w+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── DeepSeek API call ─────────────────────────────────────────
async function callDeepSeek(originalText: string): Promise<ProcessResult> {
  const prompt = `あなたはグローバル金融市場（暗号資産や特定資産に偏らない）を客観的な視点で報道する、プロのファイナンシャルニュース編集者です。

以下の入力内容を処理し、次の構造のJSONを返してください（マークダウン不要、純粋なJSONのみ）:

{
  "rewrittenText": "日本語で書き直した完全な記事（300語以内、報道スタイル、客観的）",
  "rewrittenTextEn": "English version of the article (100-300 words, journalistic style)",
  "tweetVI": "日本語ツイート版（最大4行、250文字、リンク・ハンドル不要）",
  "tweetEN": "English tweet version (max 4 lines, 250 chars, no links/handles)",
  "factCheckNote": "ファクトチェックメモ：情報源は信頼できるか？情報は検証可能か？",
  "shouldPublish": true,
  "rejectReason": ""
}

ルール：
- 広告・スパム・アフィリエイトリンク・明らかな虚偽情報 → shouldPublish=false、rejectReason=理由
- 記事からすべてのURL・情報源名・@ハンドルを削除すること
- 入力は複数言語の可能性があるが、出力のrewrittenTextとtweetVIは必ず日本語にすること
- 中立的な視点、誇張なし、悲観論なし

処理する内容：
${originalText}`;

  const response = await client.chat.completions.create({
    model: config.deepseekModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1500,
  });

  const raw = response.choices[0]?.message?.content ?? '{}';

  // Làm sạch JSON nếu có markdown code block
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  try {
    return JSON.parse(cleaned) as ProcessResult;
  } catch {
    log.error('Lỗi parse JSON từ DeepSeek:', cleaned.slice(0, 200));
    throw new Error('Không thể parse kết quả từ DeepSeek');
  }
}

// ── Main processor ────────────────────────────────────────────
export async function processNextItem(): Promise<void> {
  const item = await prisma.contentItem.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  if (!item) return;

  // Đánh dấu đang xử lý để tránh xử lý trùng
  await prisma.contentItem.update({
    where: { id: item.id },
    data: { status: 'processing' },
  });

  log.info(`Xử lý item ID=${item.id} từ ${item.source}/${item.sourceChannel}`);

  try {
    // Kiểm tra trùng lặp
    if (await isDuplicate(item.originalText)) {
      log.info(`ID=${item.id} bị loại: trùng nội dung đã đăng`);
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { status: 'rejected', factCheckNote: 'Trùng nội dung đã đăng' },
      });
      return;
    }

    const result = await callDeepSeek(item.originalText);

    if (!result.shouldPublish) {
      log.info(`ID=${item.id} bị từ chối: ${result.rejectReason}`);
      await prisma.contentItem.update({
        where: { id: item.id },
        data: {
          status: 'rejected',
          factCheckNote: result.rejectReason ?? result.factCheckNote,
        },
      });
      return;
    }

    // Strip links khỏi kết quả (phòng hờ AI không làm sạch hết)
    const cleanedVI = stripLinks(result.rewrittenText ?? '');
    const cleanedEN = stripLinks(result.rewrittenTextEn ?? '');
    const cleanedTweetVI = stripLinks(result.tweetVI ?? '').slice(0, 250);
    const cleanedTweetEN = stripLinks(result.tweetEN ?? '').slice(0, 250);

    await prisma.contentItem.update({
      where: { id: item.id },
      data: {
        status: 'approved',
        rewrittenText: cleanedVI,
        rewrittenTextEn: cleanedEN,
        tweetVI: cleanedTweetVI,
        tweetEN: cleanedTweetEN,
        factCheckNote: result.factCheckNote,
      },
    });

    log.info(`ID=${item.id} đã xử lý xong → approved`);
  } catch (err) {
    log.error(`Lỗi xử lý ID=${item.id}:`, err);
    // Trả về pending để thử lại sau
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { status: 'pending' },
    });
  }
}
