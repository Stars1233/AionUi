/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { shell } from 'electron';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import os from 'os';
import fs from 'fs';
import { initWebAdapter } from './adapter';
import directoryApi from './directoryApi';

const activeTokens = new Set<string>();

export async function startWebServer(port: number, allowRemote = false): Promise<void> {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // 生成会话令牌 (固定用于调试)
  const sessionToken = '3e54493d-cbbb-4756-b09c-070eb8ef3d2f';
  activeTokens.add(sessionToken);

  // 基础中间件
  app.use(
    cors({
      origin: allowRemote ? true : `http://localhost:${port}`,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  // 安全头
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Token 验证中间件
  const validateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = (req.query.token as string) || (req.headers['x-session-token'] as string);
    if (!token || !activeTokens.has(token)) {
      return res.status(403).json({ error: 'Invalid or expired session token' });
    }
    next();
  };

  // Cookie 验证中间件 - 用于静态资源保护
  const validateCookie = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const sessionCookie = req.cookies['aionui-session'];
    if (!sessionCookie || !activeTokens.has(sessionCookie)) {
      return res.status(403).send('Access Denied');
    }
    next();
  };

  // 静态文件服务 (Webpack 构建的 React 应用)
  const rendererPath = path.join(__dirname, '../../.webpack/renderer');
  const indexHtmlPath = path.join(rendererPath, 'main_window/index.html');

  // 处理登录请求
  app.post('/login', (req, res) => {
    try {
      const { token } = req.body;

      if (!token || !activeTokens.has(token)) {
        return res.status(401).json({ success: false, message: 'Invalid access token' });
      }

      // 设置安全cookie
      res.cookie('aionui-session', token, {
        httpOnly: true,
        secure: false, // 在开发环境下设为false，生产环境可设为true
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24小时
      });

      res.json({ success: true, message: 'Login successful' });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // 特殊处理主页HTML - 检查cookie或显示登录页面
  app.get('/', (req, res) => {
    try {
      const sessionCookie = req.cookies['aionui-session'];

      // 如果已有有效cookie，直接进入应用
      if (sessionCookie && activeTokens.has(sessionCookie)) {
        const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

        // 注入token到HTML中，只在WebUI环境下设置
        const modifiedHtml = htmlContent.replace(
          '</head>',
          `<script>
            // 只在WebUI模式下设置token
            if (!window.electronAPI) {
              window.__SESSION_TOKEN__ = '${sessionCookie}';
            }
          </script></head>`
        );

        res.setHeader('Content-Type', 'text/html');
        res.send(modifiedHtml);
        return;
      }

      // 显示登录页面
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>AionUi - Login</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              margin: 0;
              padding: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .login-container {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
              width: 100%;
              max-width: 400px;
              text-align: center;
            }
            .logo {
              font-size: 48px;
              margin-bottom: 20px;
            }
            h1 {
              color: #333;
              margin-bottom: 10px;
              font-size: 24px;
            }
            .subtitle {
              color: #666;
              margin-bottom: 30px;
              font-size: 14px;
            }
            .input-group {
              margin-bottom: 20px;
              text-align: left;
            }
            label {
              display: block;
              margin-bottom: 8px;
              color: #555;
              font-weight: 500;
            }
            input[type="password"] {
              width: 100%;
              padding: 12px;
              border: 1px solid #ddd;
              border-radius: 6px;
              font-size: 16px;
              box-sizing: border-box;
              transition: border-color 0.3s;
            }
            input[type="password"]:focus {
              outline: none;
              border-color: #667eea;
              box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
            }
            .login-btn {
              width: 100%;
              padding: 12px;
              background: #667eea;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.3s;
            }
            .login-btn:hover {
              background: #5a6fd8;
            }
            .login-btn:disabled {
              background: #ccc;
              cursor: not-allowed;
            }
            .error {
              color: #e74c3c;
              margin-top: 10px;
              font-size: 14px;
            }
            .success {
              color: #27ae60;
              margin-top: 10px;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="login-container">
            <div class="logo">🤖</div>
            <h1>AionUi WebUI</h1>
            <p class="subtitle">Please enter your access token to continue</p>

            <form id="loginForm">
              <div class="input-group">
                <label for="token">Access Token</label>
                <input type="password" id="token" name="token" placeholder="Enter access token" required>
              </div>
              <button type="submit" class="login-btn" id="loginBtn">Login</button>
              <div id="message"></div>
            </form>
          </div>

          <script>
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
              e.preventDefault();

              const token = document.getElementById('token').value;
              const loginBtn = document.getElementById('loginBtn');
              const message = document.getElementById('message');

              if (!token) {
                message.innerHTML = '<div class="error">Please enter access token</div>';
                return;
              }

              loginBtn.disabled = true;
              loginBtn.textContent = 'Logging in...';
              message.innerHTML = '';

              try {
                const response = await fetch('/login', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ token }),
                });

                const result = await response.json();

                if (result.success) {
                  message.innerHTML = '<div class="success">Login successful! Redirecting...</div>';
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                } else {
                  message.innerHTML = '<div class="error">' + result.message + '</div>';
                }
              } catch (error) {
                message.innerHTML = '<div class="error">Connection error. Please try again.</div>';
              }

              loginBtn.disabled = false;
              loginBtn.textContent = 'Login';
            });

            // 自动聚焦到token输入框
            document.getElementById('token').focus();
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // 处理子路径路由 (React Router)
  app.get(/^\/(?!api|static|main_window).*/, validateCookie, (req, res) => {
    try {
      const token = req.cookies['aionui-session'];
      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

      const modifiedHtml = htmlContent.replace(
        '</head>',
        `<script>
          if (!window.electronAPI) {
            window.__SESSION_TOKEN__ = '${token}';
          }
        </script></head>`
      );

      res.setHeader('Content-Type', 'text/html');
      res.send(modifiedHtml);
    } catch (error) {
      console.error('Error serving SPA route:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // 静态资源 - 需要cookie验证
  app.use('/main_window.css', validateCookie, express.static(path.join(rendererPath, 'main_window.css')));
  app.use('/main_window', validateCookie, express.static(path.join(rendererPath, 'main_window')));
  app.use('/static', validateCookie, express.static(path.join(rendererPath, 'static')));

  // React Syntax Highlighter 语言包
  app.use(
    '/react-syntax-highlighter_languages_highlight_',
    validateCookie,
    express.static(rendererPath, {
      setHeaders: (res, path) => {
        if (path.includes('react-syntax-highlighter_languages_highlight_')) {
          res.setHeader('Content-Type', 'application/javascript');
        }
      },
    })
  );

  // API 路由 - 已被全局验证保护
  app.use('/api/directory', directoryApi);

  app.use('/api', validateToken, (_req, res) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });

  // WebSocket connection will be handled by initWebAdapter

  // 启动服务器
  // 添加登出路由
  app.post('/logout', (_req, res) => {
    res.clearCookie('aionui-session');
    res.json({ success: true, message: 'Logged out successfully' });
  });

  return new Promise((resolve, reject) => {
    const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
    server.listen(port, host, () => {
      const localUrl = `http://localhost:${port}`;

      console.log(`🚀 AionUi WebUI started on ${localUrl}`);
      console.log(`🔑 Access Token: ${sessionToken}`);

      if (allowRemote) {
        // 显示所有可用的网络地址
        const interfaces = os.networkInterfaces();
        const addresses: string[] = [];
        Object.keys(interfaces).forEach((name) => {
          interfaces[name]?.forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
              addresses.push(`http://${iface.address}:${port}`);
            }
          });
        });

        if (addresses.length > 0) {
          console.log('🌍 Remote access URLs:');
          addresses.forEach((url) => console.log(`   ${url}`));
        }
      }

      console.log(`🎯 Opening browser automatically...`);

      // 自动打开浏览器
      shell.openExternal(localUrl);

      // 初始化 Web 适配器
      initWebAdapter(wss, activeTokens);

      resolve();
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use`);
        process.exit(1);
      }
      reject(err);
    });
  });
}
