/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge, logger } from '@office-ai/platform';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win: any = window;

/**
 * 从 cookie 中读取 token（更安全，避免 XSS）
 * Read token from cookie (more secure, avoid XSS)
 */
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

/**
 * Web目录选择处理函数 / Web directory selection handler
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleWebDirectorySelection(options: any): Promise<string[] | undefined> {
  return new Promise((resolve) => {
    // 创建目录选择模态框 / Create directory selection modal
    const modal = createDirectorySelectionModal(options, (result) => {
      resolve(result);
    });
    document.body.appendChild(modal);
  });
}

/**
 * 创建文件/目录选择模态框 / Create file/directory selection modal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDirectorySelectionModal(options: any, onSelect: (paths: string[] | undefined) => void) {
  // 检查是否为文件选择模式 - 使用自定义字段判断或从properties自动推断
  // Check if it's file selection mode - determine from custom field or infer from properties
  let isFileSelection = options.isFileMode === true;

  // 如果没有 isFileMode，从 properties 推断 (properties可能在options.data中)
  // If no isFileMode, infer from properties (properties may be in options.data)
  const properties = options.properties || (options.data && options.data.properties);
  if (!isFileSelection && properties) {
    isFileSelection = properties.includes('openFile') && !properties.includes('openDirectory');
  }
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    border-radius: 8px;
    width: 600px;
    height: 500px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  dialog.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3 style="margin: 0; color: #333;">${isFileSelection ? '📄 选择文件' : '📁 选择目录'}</h3>
      <button id="closeBtn" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
    </div>
    <div style="flex: 1; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
      <div id="directoryBrowser" style="height: 100%; overflow-y: auto;"></div>
    </div>
    <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center;">
      <div style="color: #666; font-size: 14px;">
        <span id="selectedPath">${isFileSelection ? '请选择一个文件' : '请选择一个目录'}</span>
      </div>
      <div>
        <button id="cancelBtn" style="margin-right: 10px; padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">取消</button>
        <button id="confirmBtn" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;" disabled>确认</button>
      </div>
    </div>
  `;

  modal.appendChild(dialog);

  // 初始化目录浏览器 / Initialize directory browser
  initDirectoryBrowser(dialog.querySelector('#directoryBrowser')!, dialog.querySelector('#selectedPath')!, dialog.querySelector('#confirmBtn')!, isFileSelection);

  // 事件处理 / Event handling
  dialog.querySelector('#closeBtn')!.addEventListener('click', () => {
    document.body.removeChild(modal);
    onSelect(undefined);
  });

  dialog.querySelector('#cancelBtn')!.addEventListener('click', () => {
    document.body.removeChild(modal);
    onSelect(undefined);
  });

  dialog.querySelector('#confirmBtn')!.addEventListener('click', () => {
    const selectedPath = dialog.querySelector('#selectedPath')!.textContent;
    const expectedText = isFileSelection ? '请选择一个文件' : '请选择一个目录';

    if (selectedPath && selectedPath !== expectedText) {
      document.body.removeChild(modal);
      onSelect([selectedPath]);
    }
  });

  return modal;
}

/**
 * 初始化目录浏览器 / Initialize directory browser
 */
async function initDirectoryBrowser(container: Element, pathDisplay: Element, confirmBtn: Element, isFileSelection: boolean) {
  let _selectedPath: string;

  async function loadDirectory(path = '') {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const showFiles = isFileSelection ? 'true' : 'false';
      const response = await fetch(`/api/directory/browse?path=${encodeURIComponent(path)}&showFiles=${showFiles}&token=${token}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json();

      renderDirectory(data);
    } catch (_error) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">加载目录失败</div>';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderDirectory(data: any) {
    let html = '';

    // 返回上级目录按钮 / Back to parent directory button
    if (data.canGoUp) {
      html += `
        <div class="dir-item" data-path="${data.parentPath}" data-type="parent" style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center;">
          <span style="margin-right: 10px;">📁</span>
          <span>..</span>
        </div>
      `;
    }

    // 目录和文件列表 / Directory and file list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.items.forEach((item: any) => {
      const icon = item.isDirectory ? '📁' : '📄';
      const canSelect = isFileSelection ? item.isFile : item.isDirectory;

      html += `
        <div class="dir-item" data-path="${item.path}" data-type="${item.isDirectory ? 'directory' : 'file'}" style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center;">
            <span style="margin-right: 10px;">${icon}</span>
            <span>${item.name}</span>
          </div>
          ${canSelect ? '<button class="select-btn" style="padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 3px; font-size: 12px;">选择</button>' : ''}
        </div>
      `;
    });

    container.innerHTML = html;

    // 添加事件监听 / Add event listeners
    container.querySelectorAll('.dir-item').forEach((item) => {
      const path = item.getAttribute('data-path');
      const type = item.getAttribute('data-type');

      item.addEventListener('click', (e) => {
        e.preventDefault();
        // 只有目录（包括父目录）可以导航 / Only directories (including parent) can be navigated
        if (type === 'parent' || (type === 'directory' && !isFileSelection)) {
          loadDirectory(path!);
        } else if (type === 'directory' && isFileSelection) {
          // 在文件选择模式下，双击目录进入 / In file selection mode, double-click to enter directory
        }
      });

      // 在文件选择模式下，双击目录进入 / In file selection mode, double-click to enter directory
      if (isFileSelection && type === 'directory') {
        item.addEventListener('dblclick', (e) => {
          e.preventDefault();
          loadDirectory(path!);
        });
      }

      const selectBtn = item.querySelector('.select-btn');
      if (selectBtn) {
        selectBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          _selectedPath = path!;
          pathDisplay.textContent = path;
          confirmBtn.removeAttribute('disabled');

          // 高亮选中的项目 / Highlight selected item
          container.querySelectorAll('.dir-item').forEach((i) => ((i as HTMLElement).style.background = ''));
          (item as HTMLElement).style.background = '#e3f2fd';
        });
      }
    });
  }

  // 加载初始目录 / Load initial directory
  loadDirectory();
}

/**
 * 适配electron的API到浏览器中,建立renderer和main的通信桥梁, 与preload.ts中的注入对应
 * Adapt Electron API to browser, establish communication bridge between renderer and main
 */
if (win.electronAPI) {
  // Electron 环境 - 使用 IPC 通信 / Electron environment - use IPC communication
  bridge.adapter({
    emit(name, data) {
      win.electronAPI.emit(name, data);
    },
    on(emitter) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      win.electronAPI.on((event: any) => {
        try {
          const { value } = event;
          const { name, data } = JSON.parse(value);
          emitter.emit(name, data);
        } catch (e) {
          console.warn('JSON parsing error:', e);
        }
      });
    },
  });
} else {
  // Web 环境 - 使用 WebSocket 通信 / Web environment - use WebSocket communication

  const token = getCookie('aionui-session');

  if (token) {
    const wsUrl = `ws://${window.location.hostname}:25808`;
    const ws = new WebSocket(wsUrl, [token]);

    bridge.adapter({
      emit(name, data) {
        // 在WebUI模式下，文件选择请求也通过WebSocket发送到服务器统一处理
        // 保持与其他消息一致的回调机制

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ name, data }));
        } else {
          ws.addEventListener(
            'open',
            () => {
              ws.send(JSON.stringify({ name, data }));
            },
            { once: true }
          );
        }
      },
      on(emitter) {
        // 存储emitter以便在文件选择完成时使用 / Store emitter for file selection
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__bridgeEmitter = emitter;

        // 在WebUI环境下，让bridge系统自己处理callback事件，不需要手动干预
        // 所有的callback事件都由bridge的Promise resolver自动处理

        ws.onmessage = (event) => {
          try {
            const { name, data } = JSON.parse(event.data);

            // 处理心跳 ping - 立即响应 pong
            if (name === 'ping') {
              ws.send(JSON.stringify({ name: 'pong', data: { timestamp: Date.now() } }));
              return;
            }

            // 处理认证过期 - 强制退出登录
            if (name === 'auth-expired') {
              console.warn('[WebSocket] Authentication expired:', data.message);
              // 清除本地凭证
              document.cookie = 'aionui-session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
              // 重定向到登录页
              window.location.href = '/';
              return;
            }

            // 处理服务器端发来的文件选择请求
            if (name === 'show-open-request') {
              handleWebDirectorySelection(data)
                .then((result) => {
                  // 直接通过 emitter 返回结果，让 bridge 系统处理回调
                  const requestId = data.id;
                  const callbackEventName = `subscribe.callback-show-open${requestId}`;
                  emitter.emit(callbackEventName, result);
                })
                .catch((error) => {
                  console.error('File selection error:', error);
                  const requestId = data.id;
                  const callbackEventName = `subscribe.callback-show-open${requestId}`;
                  emitter.emit(callbackEventName, undefined);
                });
              return;
            }

            emitter.emit(name, data);
          } catch (e) {
            // Handle JSON parsing errors silently
          }
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] Connection error:', error);
        };

        ws.onclose = (event) => {
          console.log('[WebSocket] Connection closed:', event.code, event.reason);
          // 如果是 token 过期或心跳超时导致的关闭，重定向到登录页
          if (event.code === 1008) {
            document.cookie = 'aionui-session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            window.location.href = '/';
          }
        };
      },
    });
  }
}

logger.provider({
  log(log) {
    console.log('process.log', log.type, ...log.logs);
  },
  path() {
    return Promise.resolve('');
  },
});
