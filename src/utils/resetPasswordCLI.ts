/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reset password CLI utility for packaged applications
 * 打包应用的密码重置命令行工具
 */

import crypto from 'crypto';
import Database from 'better-sqlite3';
import { getDataPath, ensureDirectory } from '@process/utils';
import path from 'path';

// 颜色输出 / Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  highlight: (msg: string) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

// Bcrypt adapter type
type BcryptAdapter = {
  hash(password: string, rounds: number): Promise<string>;
};

// Helper function for pbkdf2 hashing
const pbkdf2Hash = (password: string, salt: Buffer, iterations: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, derived) => {
      if (err) {
        reject(err);
      } else {
        resolve(derived);
      }
    });
  });

// Dynamic bcrypt loading with fallback (same pattern as AuthService)
// 动态加载bcrypt并降级到pbkdf2 (与AuthService相同的模式)
const bcryptAdapter: BcryptAdapter = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
    const native: typeof import('bcrypt') = require('bcrypt');
    return {
      hash: (password: string, rounds: number) => native.hash(password, rounds),
    };
  } catch (nativeError) {
    log.warning('bcrypt not available, using pbkdf2 fallback');
    return {
      hash: async (password: string) => {
        const iterations = 120_000;
        const salt = crypto.randomBytes(16);
        const derived = await pbkdf2Hash(password, salt, iterations);
        return `pbkdf2$${iterations}$${salt.toString('base64')}$${derived.toString('base64')}`;
      },
    };
  }
})();

// Hash password using bcrypt adapter
// 使用bcrypt适配器哈希密码
function hashPassword(password: string): Promise<string> {
  return bcryptAdapter.hash(password, 10);
}

// 生成随机密码 / Generate random password
function generatePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Reset password for a user (CLI mode, works in packaged apps)
 * 重置用户密码（CLI模式,在打包应用中可用）
 *
 * @param username - Username to reset password for
 */
export async function resetPasswordCLI(username: string): Promise<void> {
  let db: Database.Database | null = null;

  try {
    log.info('Starting password reset...');
    log.info(`Target user: ${username}`);

    // Get database path using the same logic as the main app
    const dbPath = path.join(getDataPath(), 'aionui.db');
    log.info(`Database path: ${dbPath}`);

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    ensureDirectory(dir);

    // Connect to database
    db = new Database(dbPath);

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as { id: string; username: string; password_hash: string; jwt_secret: string | null } | undefined;

    if (!user) {
      log.error(`User '${username}' not found in database`);
      log.info('');
      log.info('Available users:');
      const allUsers = db.prepare('SELECT username FROM users').all() as { username: string }[];
      if (allUsers.length === 0) {
        log.info('  (no users found)');
      } else {
        allUsers.forEach((u) => log.info(`  - ${u.username}`));
      }
      process.exit(1);
    }

    log.info(`Found user: ${user.username} (ID: ${user.id})`);

    // Generate new password
    const newPassword = generatePassword();
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    const now = Date.now();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashedPassword, now, user.id);

    // Generate and update JWT Secret
    const newJwtSecret = crypto.randomBytes(64).toString('hex');
    db.prepare('UPDATE users SET jwt_secret = ?, updated_at = ? WHERE id = ?').run(newJwtSecret, now, user.id);

    // Display result
    console.log('');
    log.success('Password reset successfully!');
    console.log('');
    log.highlight('═══════════════════════════════════════');
    log.highlight(`  Username: ${user.username}`);
    log.highlight(`  New Password: ${newPassword}`);
    log.highlight('═══════════════════════════════════════');
    console.log('');
    log.warning('⚠ JWT secret has been rotated');
    log.warning('⚠ All previous tokens are now invalid');
    console.log('');
    log.info('💡 Next steps:');
    log.info('   1. Refresh your browser (Cmd+R or Ctrl+R)');
    log.info('   2. You will be redirected to login page');
    log.info('   3. Login with the new password above');
    console.log('');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error: ${errorMessage}`);
    console.error(error);
    process.exit(1);
  } finally {
    // Close database connection
    if (db) {
      db.close();
    }
  }
}
