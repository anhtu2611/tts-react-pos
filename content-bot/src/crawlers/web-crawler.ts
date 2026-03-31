import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import prisma from '../db';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('WebCrawler');
const rssParser = new Parser({
  timeout: 10000,
  customFields: { item: [['media:content', 'mediaContent'], ['media:thumbnail', 'mediaThumbnail']] },
});

const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const HTTP_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

// ── Duplicate detection ────────────────────────────────────────
async function isProcessed(externalId: string): Promise<boolean> {
  const existing = await prisma.processedMessage.findUnique({
    where: { source_externalId: { source: 'web', externalId } },
  });
  return !!existing;
}

async function markProcessed(externalId: string): Promise<void> {
  await prisma.processedMessage.upsert({
    where: { source_externalId: { source: 'web', externalId } },
    create: { source: 'web', externalId },
    update: {},
  });
}

// ── Download ảnh từ URL ────────────────────────────────────────
async function downloadImageFromUrl(imageUrl: string, filename: string): Promise<string | null> {
  try {
    const res = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: HTTP_HEADERS,
    });

    const buffer = Buffer.from(res.data as ArrayBuffer);
    if (buffer.length < 1000) return null; // Quá nhỏ, không phải ảnh thật

    // Kiểm tra magic bytes: JPEG (FF D8), PNG (89 50), GIF (47 49), WEBP (52 49)
    const isImage = (buffer[0] === 0xFF && buffer[1] === 0xD8) || // JPEG
                    (buffer[0] === 0x89 && buffer[1] === 0x50) || // PNG
                    (buffer[0] === 0x47 && buffer[1] === 0x49) || // GIF
                    (buffer[0] === 0x52 && buffer[1] === 0x49);   // WEBP
    if (!isImage) return null;

    // Xác định đuôi file
    let ext = 'jpg';
    if (buffer[0] === 0x89) ext = 'png';
    else if (buffer[0] === 0x47) ext = 'gif';
    else if (buffer[0] === 0x52) ext = 'webp';

    const filePath = path.join(IMAGES_DIR, `${filename}.${ext}`);
    fs.writeFileSync(filePath, buffer);
    log.info(`Đã tải ảnh web: ${filename}.${ext} (${buffer.length} bytes)`);
    return filePath;
  } catch {
    return null;
  }
}

// ── Lấy URL ảnh từ RSS item ────────────────────────────────────
function getImageUrlFromRSSItem(item: Record<string, unknown>): string | null {
  // enclosure (phổ biến nhất)
  const enc = item.enclosure as { url?: string; type?: string } | undefined;
  if (enc?.url && enc.type?.startsWith('image/')) return enc.url;

  // media:content
  const mc = item.mediaContent as { $?: { url?: string } } | undefined;
  if (mc?.$?.url) return mc.$.url;

  // media:thumbnail
  const mt = item.mediaThumbnail as { $?: { url?: string } } | undefined;
  if (mt?.$?.url) return mt.$.url;

  // itunes:image
  const ii = (item as Record<string, unknown>)['itunes:image'] as { href?: string } | undefined;
  if (ii?.href) return ii.href;

  // Tìm <img> trong content HTML
  const content = (item.content ?? item['content:encoded'] ?? '') as string;
  if (content) {
    const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

// ── Lấy URL ảnh từ trang HTML ─────────────────────────────────
function getImageUrlFromHTML($: cheerio.CheerioAPI, baseUrl: string): string | null {
  // og:image (ưu tiên nhất)
  const ogImage = $('meta[property="og:image"]').attr('content') ||
                  $('meta[name="twitter:image"]').attr('content');
  if (ogImage) return resolveUrl(ogImage, baseUrl);

  // Ảnh đầu tiên trong article
  const articleImg = $('article img, .article img, .post img, .content img').first().attr('src');
  if (articleImg) return resolveUrl(articleImg, baseUrl);

  // Ảnh đầu tiên trên trang (bỏ qua ảnh logo/icon nhỏ)
  let found: string | null = null;
  $('img').each((_, el) => {
    if (found) return;
    const src = $(el).attr('src') ?? '';
    const w = parseInt($(el).attr('width') ?? '0');
    const h = parseInt($(el).attr('height') ?? '0');
    if (src && !src.includes('logo') && !src.includes('icon') && (w === 0 || w >= 200)) {
      found = resolveUrl(src, baseUrl);
    }
  });
  return found;
}

function resolveUrl(url: string, base: string): string {
  if (url.startsWith('http')) return url;
  try { return new URL(url, base).href; } catch { return url; }
}

// ── Crawl RSS feed ─────────────────────────────────────────────
async function crawlRSS(url: string, sourceHandle: string): Promise<number> {
  const feed = await rssParser.parseURL(url);
  let newCount = 0;

  for (const item of (feed.items ?? []).slice(0, 10)) {
    const externalId = item.guid ?? item.link ?? item.title ?? '';
    if (!externalId || await isProcessed(externalId)) continue;
    await markProcessed(externalId);

    const title = item.title ?? '';
    const desc = item.contentSnippet ?? item.content ?? item.summary ?? '';
    const text = desc ? `${title}\n\n${desc}` : title;
    if (text.trim().length < 20) continue;

    // Tải ảnh
    const imageUrl = getImageUrlFromRSSItem(item as Record<string, unknown>);
    let imagePath: string | null = null;
    if (imageUrl) {
      const filename = `web_${Date.now()}_${newCount}`;
      imagePath = await downloadImageFromUrl(imageUrl, filename);
    }

    await prisma.contentItem.create({
      data: {
        source: 'web',
        sourceChannel: sourceHandle,
        originalText: text.slice(0, 3000),
        status: 'pending',
        imagePath,
        sourceUrl: item.link ?? null,
      },
    });
    newCount++;
  }
  return newCount;
}

// ── Fetch HTML với encoding tự động ──────────────────────────
async function fetchHTML(url: string): Promise<string> {
  const res = await axios.get(url, {
    timeout: 10000,
    headers: HTTP_HEADERS,
    responseType: 'arraybuffer',
  });
  const buf = Buffer.from(res.data as ArrayBuffer);
  const ct: string = res.headers['content-type'] ?? '';

  // Detect encoding từ Content-Type header hoặc meta charset
  let encoding = 'utf-8';
  const ctMatch = ct.match(/charset=([^\s;]+)/i);
  if (ctMatch) encoding = ctMatch[1];
  else {
    const peek = buf.toString('ascii', 0, 2000);
    const metaMatch = peek.match(/charset=[\"']?([^\"';\s>]+)/i);
    if (metaMatch) encoding = metaMatch[1];
  }

  if (iconv.encodingExists(encoding)) {
    return iconv.decode(buf, encoding);
  }
  return buf.toString('utf-8');
}

// ── Crawl HTML ─────────────────────────────────────────────────
async function crawlHTML(url: string, sourceHandle: string): Promise<number> {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);
  let newCount = 0;

  const processItem = async (title: string, body: string, imgEl?: cheerio.Element, articleUrl?: string) => {
    const text = body ? `${title}\n\n${body}` : title;
    if (text.length < 5) return; // Tiếng Nhật/Trung ngắn hơn

    const externalId = `${sourceHandle}_${Buffer.from(text.slice(0, 50)).toString('base64')}`;
    if (await isProcessed(externalId)) return;
    await markProcessed(externalId);

    // Lấy ảnh: từ element img hoặc og:image của trang
    let imagePath: string | null = null;
    const imgSrc = imgEl ? $(imgEl).attr('src') : getImageUrlFromHTML($, url);
    if (imgSrc) {
      const imageUrl = resolveUrl(imgSrc, url);
      const filename = `web_${Date.now()}_${newCount}`;
      imagePath = await downloadImageFromUrl(imageUrl, filename);
    }

    await prisma.contentItem.create({
      data: { source: 'web', sourceChannel: sourceHandle, originalText: text.slice(0, 3000), status: 'pending', imagePath, sourceUrl: articleUrl ?? url },
    });
    newCount++;
  };

  const articles = $(
    'article, .article, .post, .news-item, ' +
    '[class*="article"], [class*="post-item"], ' +
    '.topTopicsCatItem, .topicsList li, .topTopicsList li, ' + // Livedoor
    '.newsFeed_item, .pickupCard, .contentListItem'            // các site Nhật khác
  );

  if (articles.length > 0) {
    for (const el of articles.slice(0, 10).toArray()) {
      // Lấy title: thử h1/h2/h3 trước, fallback sang thẻ <a>
      const title = $(el).find('h1, h2, h3, .title, .headline').first().text().trim()
        || $(el).find('a').first().text().trim();
      const body = $(el).find('p, .excerpt, .summary, .description').first().text().trim();
      const imgEl = $(el).find('img').first().get(0);
      const articleUrl = resolveUrl($(el).find('a').first().attr('href') ?? '', url);
      await processItem(title, body, imgEl, articleUrl);
    }
  } else {
    // Lấy og:image một lần cho toàn trang
    const pageImageUrl = getImageUrlFromHTML($, url);
    let sharedImagePath: string | null = null;
    if (pageImageUrl) {
      sharedImagePath = await downloadImageFromUrl(pageImageUrl, `web_${Date.now()}_main`);
    }

    for (const el of $('h2, h3').slice(0, 5).toArray()) {
      const title = $(el).text().trim();
      const body = $(el).next('p').text().trim();
      const text = body ? `${title}\n\n${body}` : title;
      if (text.length < 20) continue;

      const externalId = `${sourceHandle}_${Buffer.from(text.slice(0, 50)).toString('base64')}`;
      if (await isProcessed(externalId)) continue;
      await markProcessed(externalId);

      await prisma.contentItem.create({
        data: { source: 'web', sourceChannel: sourceHandle, originalText: text.slice(0, 3000), status: 'pending', imagePath: sharedImagePath, sourceUrl: url },
      });
      sharedImagePath = null; // Chỉ dùng ảnh cho tin đầu tiên
      newCount++;
    }
  }

  return newCount;
}

// ── Detect kiểu URL ───────────────────────────────────────────
async function detectType(url: string): Promise<'rss' | 'html'> {
  try {
    const res = await axios.get(url, { timeout: 8000, headers: HTTP_HEADERS, responseType: 'arraybuffer' });
    const ct: string = res.headers['content-type'] ?? '';
    if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom')) return 'rss';
    const body = Buffer.from(res.data as ArrayBuffer).toString('ascii', 0, 500);
    if (body.includes('<rss') || body.includes('<feed') || body.includes('<?xml')) return 'rss';
  } catch {}
  return 'html';
}

async function crawlSource(url: string, sourceHandle: string): Promise<void> {
  try {
    const type = await detectType(url);
    log.info(`Crawl [${type}] ${sourceHandle}`);
    const count = type === 'rss' ? await crawlRSS(url, sourceHandle) : await crawlHTML(url, sourceHandle);
    if (count > 0) log.info(`Lưu ${count} tin mới từ ${sourceHandle}`);
  } catch (err) {
    log.warn(`Lỗi crawl ${sourceHandle}:`, (err as Error).message);
  }
}

async function getWebSources(): Promise<Array<{ handle: string }>> {
  return prisma.contentSource.findMany({ where: { type: 'web', active: true } });
}

export async function startWebCrawler(): Promise<void> {
  const sources = await getWebSources();
  if (sources.length === 0) {
    log.info('Chưa có nguồn web. Thêm bằng: /addsource web <url>');
    return;
  }
  log.info(`Web Crawler khởi động với ${sources.length} nguồn`);
  await crawlAllWebSources();
  setInterval(crawlAllWebSources, config.crawlInterval * 1000);
}

export async function crawlAllWebSources(): Promise<void> {
  const sources = await getWebSources();
  for (const s of sources) {
    await crawlSource(s.handle, s.handle);
    await sleep(3000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
