/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/ipcBridge';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import { addMessage } from '../../message';
import fs from 'fs/promises';
import path from 'path';

export interface FileOperation {
  method: string;
  path: string;
  content?: string;
  action?: 'create' | 'write' | 'delete' | 'read';
  metadata?: Record<string, any>;
}

/**
 * CodexFileOperationHandler - 参考 ACP 的文件操作能力
 * 提供统一的文件读写、权限管理和操作反馈
 */
export class CodexFileOperationHandler {
  private pendingOperations = new Map<string, { resolve: (result: any) => void; reject: (error: any) => void }>();
  private workingDirectory: string;

  constructor(
    private conversation_id: string,
    workingDirectory?: string
  ) {
    this.workingDirectory = workingDirectory || process.cwd();
    console.log('🔧 [CodexFileOperationHandler] Initialized with working directory:', this.workingDirectory);
  }

  /**
   * 处理文件操作请求 - 参考 ACP 的 handleFileOperation
   */
  async handleFileOperation(operation: FileOperation): Promise<any> {
    console.log('📁 [CodexFileOperationHandler] Handling file operation:', {
      method: operation.method,
      path: operation.path,
      action: operation.action,
    });

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
          console.warn('⚠️ [CodexFileOperationHandler] Unknown file operation method:', operation.method);
          return this.handleGenericFileOperation(operation);
      }
    } catch (error) {
      console.error('❌ [CodexFileOperationHandler] File operation failed:', error);
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

    console.log('✏️ [CodexFileOperationHandler] Writing file:', fullPath);

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

    console.log('✅ [CodexFileOperationHandler] File written successfully:', fullPath);
  }

  /**
   * 处理文件读取操作
   */
  private async handleFileRead(operation: FileOperation): Promise<string> {
    const fullPath = this.resolveFilePath(operation.path);

    console.log('📖 [CodexFileOperationHandler] Reading file:', fullPath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      // 发送操作反馈消息
      this.emitFileOperationMessage({
        method: 'fs/read_text_file',
        path: operation.path,
      });

      console.log('✅ [CodexFileOperationHandler] File read successfully:', fullPath);
      return content;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
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

    console.log('🗑️ [CodexFileOperationHandler] Deleting file:', fullPath);

    try {
      await fs.unlink(fullPath);

      // 发送操作反馈消息
      this.emitFileOperationMessage({
        method: 'fs/delete_file',
        path: operation.path,
      });

      console.log('✅ [CodexFileOperationHandler] File deleted successfully:', fullPath);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.warn('⚠️ [CodexFileOperationHandler] File not found for deletion:', fullPath);
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
    console.log('🔍 [CodexFileOperationHandler] Processing file references in content');

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
        console.log('🔄 [CodexFileOperationHandler] Replaced file reference:', atFilename, '→', filename);
      }
    });

    return processedContent;
  }

  /**
   * 发送文件操作消息到 UI - 参考 ACP 的 formatFileOperationMessage
   */
  private emitFileOperationMessage(operation: FileOperation): void {
    const formattedMessage = this.formatFileOperationMessage(operation);

    const responseMessage: IResponseMessage = {
      type: 'content',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: formattedMessage,
    };

    console.log('📤 [CodexFileOperationHandler] Emitting file operation message');
    addMessage(this.conversation_id, transformMessage(responseMessage));
    ipcBridge.codexConversation.responseStream.emit(responseMessage);
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
    const errorMessage: IResponseMessage = {
      type: 'error',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: error,
    };

    addMessage(this.conversation_id, transformMessage(errorMessage));
    ipcBridge.codexConversation.responseStream.emit(errorMessage);
  }

  /**
   * 批量应用文件更改 - 参考 ACP 和当前 CodexAgentManager 的 applyPatchChanges
   */
  async applyBatchChanges(changes: Record<string, any>): Promise<void> {
    console.log('📦 [CodexFileOperationHandler] Applying batch changes:', Object.keys(changes));

    const operations: Promise<void>[] = [];

    for (const [filePath, change] of Object.entries(changes)) {
      if (typeof change === 'object' && change !== null) {
        const operation: FileOperation = {
          method: change.action === 'delete' ? 'fs/delete_file' : 'fs/write_text_file',
          path: filePath,
          content: change.content || '',
          action: change.action || 'write',
        };

        operations.push(this.handleFileOperation(operation));
      }
    }

    await Promise.all(operations);
    console.log('✅ [CodexFileOperationHandler] All batch changes applied successfully');
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    console.log('🧹 [CodexFileOperationHandler] Cleaning up...');

    // 拒绝所有待处理的操作
    for (const [operationId, { reject }] of this.pendingOperations) {
      reject(new Error('File operation handler is being cleaned up'));
    }
    this.pendingOperations.clear();
  }
}
