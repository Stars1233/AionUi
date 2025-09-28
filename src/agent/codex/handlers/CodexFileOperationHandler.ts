/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import fs from 'fs/promises';
import path from 'path';

export interface FileOperation {
  method: string;
  path: string;
  filename?: string;
  content?: string;
  action?: 'create' | 'write' | 'delete' | 'read';
  metadata?: Record<string, unknown>;
}

/**
 * CodexFileOperationHandler - 参考 ACP 的文件操作能力
 * 提供统一的文件读写、权限管理和操作反馈
 */
export class CodexFileOperationHandler {
  private pendingOperations = new Map<string, { resolve: (result: unknown) => void; reject: (error: unknown) => void }>();
  private workingDirectory: string;

  constructor(
    workingDirectory: string,
    private conversation_id: string,
    private messageEmitter: ICodexMessageEmitter
  ) {
    this.workingDirectory = path.resolve(workingDirectory);
  }

  /**
   * 处理文件操作请求 - 参考 ACP 的 handleFileOperation
   */
  async handleFileOperation(operation: FileOperation): Promise<unknown> {
    // Validate inputs
    if (!operation.filename && !operation.path) {
      throw new Error('File operation requires either filename or path');
    }

    try {
      switch (operation.method) {
        case 'fs/write_text_file':
        case 'file_write':
          return await this.handleFileWrite(operation);
        case 'fs/read_text_file':
        case 'file_read':
          return await this.handleFileRead(operation);
        case 'fs/delete_file':
        case 'file_delete':
          return await this.handleFileDelete(operation);
        default:
          return this.handleGenericFileOperation(operation);
      }
    } catch (error) {
      this.emitErrorMessage(`File operation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 处理文件写入操作
   */
  private async handleFileWrite(operation: FileOperation): Promise<void> {
    const fullPath = this.resolveFilePath(operation.path);
    const content = operation.content || '';

    // 确保目录存在
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // 写入文件
    await fs.writeFile(fullPath, content, 'utf-8');

    // 发送操作反馈消息
    this.emitFileOperationMessage({
      method: 'fs/write_text_file',
      path: operation.path,
      content: content,
    });
  }

  /**
   * 处理文件读取操作
   */
  private async handleFileRead(operation: FileOperation): Promise<string> {
    const fullPath = this.resolveFilePath(operation.path);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      // 发送操作反馈消息
      this.emitFileOperationMessage({
        method: 'fs/read_text_file',
        path: operation.path,
      });

      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${operation.path}`);
      }
      throw error;
    }
  }

  /**
   * 处理文件删除操作
   */
  private async handleFileDelete(operation: FileOperation): Promise<void> {
    const fullPath = this.resolveFilePath(operation.path);

    try {
      await fs.unlink(fullPath);

      // 发送操作反馈消息
      this.emitFileOperationMessage({
        method: 'fs/delete_file',
        path: operation.path,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return; // 文件不存在，视为成功
      }
      throw error;
    }
  }

  /**
   * 处理通用文件操作
   */
  private async handleGenericFileOperation(operation: FileOperation): Promise<void> {
    // 发送通用操作反馈消息
    this.emitFileOperationMessage(operation);
  }

  /**
   * 解析文件路径 - 参考 ACP 的路径处理逻辑
   */
  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.workingDirectory, filePath);
  }

  /**
   * 处理智能文件引用 - 参考 ACP 的 @filename 处理
   */
  processFileReferences(content: string, files?: string[]): string {
    if (!files || files.length === 0 || !content.includes('@')) {
      return content;
    }

    let processedContent = content;

    // 获取实际文件名
    const actualFilenames = files.map((filePath) => {
      return filePath.split('/').pop() || filePath;
    });

    // 替换 @actualFilename 为 actualFilename
    actualFilenames.forEach((filename) => {
      const atFilename = `@${filename}`;
      if (processedContent.includes(atFilename)) {
        processedContent = processedContent.replace(new RegExp(atFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), filename);
      }
    });

    return processedContent;
  }

  /**
   * 发送文件操作消息到 UI - 参考 ACP 的 formatFileOperationMessage
   */
  private emitFileOperationMessage(operation: FileOperation): void {
    const formattedMessage = this.formatFileOperationMessage(operation);

    this.messageEmitter.emitAndPersistMessage({
      type: 'content',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: formattedMessage,
    });
  }

  /**
   * 格式化文件操作消息 - 参考 ACP 的实现
   */
  private formatFileOperationMessage(operation: FileOperation): string {
    switch (operation.method) {
      case 'fs/write_text_file':
      case 'file_write': {
        const content = operation.content || '';
        const previewContent = content.length > 500 ? content.substring(0, 500) + '\n... (truncated)' : content;
        return `📝 **File written:** \`${operation.path}\`\n\n\`\`\`\n${previewContent}\n\`\`\``;
      }
      case 'fs/read_text_file':
      case 'file_read':
        return `📖 **File read:** \`${operation.path}\``;
      case 'fs/delete_file':
      case 'file_delete':
        return `🗑️ **File deleted:** \`${operation.path}\``;
      default:
        return `🔧 **File operation:** \`${operation.path}\` (${operation.method})`;
    }
  }

  /**
   * 发送错误消息
   */
  private emitErrorMessage(error: string): void {
    this.messageEmitter.emitAndPersistMessage({
      type: 'error',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: error,
    });
  }

  /**
   * 批量应用文件更改 - 参考 ACP 和当前 CodexAgentManager 的 applyPatchChanges
   */
  async applyBatchChanges(changes: Record<string, import('@/common/codex/types').FileChange>): Promise<void> {
    const operations: Promise<void>[] = [];

    for (const [filePath, change] of Object.entries(changes)) {
      if (typeof change === 'object' && change !== null) {
        const action = this.getChangeAction(change as any);
        const content = this.getChangeContent(change as any);
        const operation: FileOperation = {
          method: action === 'delete' ? 'fs/delete_file' : 'fs/write_text_file',
          path: filePath,
          content,
          action,
        };
        operations.push(this.handleFileOperation(operation).then((): void => void 0));
      }
    }

    await Promise.all(operations);
  }

  private getChangeAction(change: import('@/common/codex/types').FileChange): 'create' | 'write' | 'delete' {
    if ('type' in change) {
      if (change.type === 'add') return 'create';
      if (change.type === 'delete') return 'delete';
      if (change.type === 'update') return 'write';
    }
    // legacy/back-compat
    if ('action' in (change as any) && (change as any).action) return (change as any).action;
    return 'write';
  }

  private getChangeContent(change: import('@/common/codex/types').FileChange): string {
    if ('content' in (change as any) && typeof (change as any).content === 'string') return (change as any).content;
    return '';
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 拒绝所有待处理的操作
    for (const [_operationId, { reject }] of this.pendingOperations) {
      reject(new Error('File operation handler is being cleaned up'));
    }
    this.pendingOperations.clear();
  }
}
