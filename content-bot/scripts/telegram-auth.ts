/**
 * Script tạo Telegram session string
 * Chạy: npm run telegram-auth
 * Sau đó copy session string vào .env → TELEGRAM_SESSION_STRING
 */
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';

const apiId = parseInt(process.env.TELEGRAM_API_ID ?? '0', 10);
const apiHash = process.env.TELEGRAM_API_HASH ?? '';

if (!apiId || !apiHash) {
  console.error('❌ Thiếu TELEGRAM_API_ID hoặc TELEGRAM_API_HASH trong .env');
  process.exit(1);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  console.log('🔐 Tạo Telegram Session String');
  console.log('─────────────────────────────────');

  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => prompt('📱 Số điện thoại (có mã quốc gia, vd +84912345678): '),
    password: async () => prompt('🔒 Mật khẩu 2FA (Enter nếu không có): '),
    phoneCode: async () => prompt('📨 Mã OTP từ Telegram: '),
    onError: (err) => console.error('Lỗi:', err),
  });

  const sessionString = client.session.save() as unknown as string;

  console.log('\n✅ Tạo session thành công!');
  console.log('─────────────────────────────────');
  console.log('Copy dòng sau vào file .env:\n');
  console.log(`TELEGRAM_SESSION_STRING=${sessionString}`);
  console.log('\n─────────────────────────────────');
  console.log('⚠  Giữ bí mật session string này!');

  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
