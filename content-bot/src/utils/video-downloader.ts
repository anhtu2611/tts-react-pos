import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from './logger';

const log = createLogger('VideoDownloader');

const VIDEOS_DIR = path.join(process.cwd(), 'data', 'videos');
const YTDLP = path.join(process.cwd(), 'bin', 'yt-dlp.exe');

if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

export interface VideoInfo {
  filePath: string;
  title: string;
  duration: number; // giây
}

function runCommand(cmd: string, timeout = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
    child.on('error', reject);
  });
}

export async function downloadVideo(url: string): Promise<VideoInfo | null> {
  if (!fs.existsSync(YTDLP)) {
    log.error('yt-dlp.exe không tìm thấy tại:', YTDLP);
    return null;
  }

  // Lấy thông tin video trước
  let title = 'video';
  let duration = 0;
  try {
    const infoJson = await runCommand(
      `"${YTDLP}" --print "%(title)s|||%(duration)s" --no-playlist "${url}"`
    );
    const parts = infoJson.split('|||');
    title = parts[0]?.trim() || 'video';
    duration = parseInt(parts[1]?.trim() || '0', 10);
  } catch {
    log.debug('Không lấy được metadata, tiếp tục tải...');
  }

  // Kiểm tra giới hạn (Telegram max 50MB, ~10 phút)
  if (duration > 600) {
    log.warn(`Video quá dài: ${duration}s (max 600s)`);
    return null;
  }

  const filename = `video_${Date.now()}`;
  const outputTemplate = path.join(VIDEOS_DIR, `${filename}.%(ext)s`);

  try {
    log.info(`Đang tải video: ${url}`);
    await runCommand(
      `"${YTDLP}" ` +
      `--format "bestvideo[ext=mp4][filesize<45M]+bestaudio[ext=m4a]/best[ext=mp4][filesize<45M]/best[filesize<45M]" ` +
      `--merge-output-format mp4 ` +
      `--no-playlist ` +
      `--output "${outputTemplate}" ` +
      `"${url}"`,
      180000
    );

    // Tìm file vừa tải
    const files = fs.readdirSync(VIDEOS_DIR).filter(f => f.startsWith(filename));
    if (files.length === 0) {
      log.warn('Không tìm thấy file sau khi tải');
      return null;
    }

    const filePath = path.join(VIDEOS_DIR, files[0]);
    const size = fs.statSync(filePath).size;
    log.info(`Tải xong: ${files[0]} (${(size / 1024 / 1024).toFixed(1)}MB)`);

    if (size > 50 * 1024 * 1024) {
      log.warn('File quá lớn (>50MB), bỏ qua');
      fs.unlinkSync(filePath);
      return null;
    }

    return { filePath, title, duration };
  } catch (err) {
    log.error('Lỗi tải video:', (err as Error).message);
    return null;
  }
}

// Xoá video cũ hơn 24h để tiết kiệm disk
export function cleanOldVideos(): void {
  try {
    const now = Date.now();
    const files = fs.readdirSync(VIDEOS_DIR);
    for (const f of files) {
      const fp = path.join(VIDEOS_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(fp);
        log.debug(`Xoá video cũ: ${f}`);
      }
    }
  } catch {}
}
