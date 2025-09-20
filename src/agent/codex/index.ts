/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NetworkError } from './CodexMcpConnection';
import { CodexMcpConnection } from './CodexMcpConnection';
import { APP_CLIENT_NAME, APP_CLIENT_VERSION, CODEX_MCP_PROTOCOL_VERSION } from '@/common/constants';

export interface CodexAgentConfig {
  id: string;
  cliPath?: string; // e.g. 'codex' or absolute path
  workingDir: string;
  onEvent: (evt: { type: string; data: any }) => void;
  onNetworkError?: (error: NetworkError) => void;
}

/**
 * Minimal Codex MCP Agent skeleton.
 * Not wired into UI flows yet; provides a starting point for protocol fusion.
 */
export class CodexMcpAgent {
  private readonly id: string;
  private readonly cliPath?: string;
  private readonly workingDir: string;
  private readonly onEvent: (evt: { type: string; data: any }) => void;
  private readonly onNetworkError?: (error: NetworkError) => void;
  private conn: CodexMcpConnection | null = null;
  private conversationId: string | null = null;

  constructor(cfg: CodexAgentConfig) {
    this.id = cfg.id;
    this.cliPath = cfg.cliPath;
    this.workingDir = cfg.workingDir;
    this.onEvent = cfg.onEvent;
    this.onNetworkError = cfg.onNetworkError;
  }

  async start(): Promise<void> {
    this.conn = new CodexMcpConnection();
    this.conn.onEvent = (env) => this.processCodexEvent(env);
    this.conn.onNetworkError = (error) => this.handleNetworkError(error);
    await this.conn.start(this.cliPath || 'codex', this.workingDir);

    // MCP initialize handshake
    await this.conn.request('initialize', {
      protocolVersion: CODEX_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: APP_CLIENT_NAME, version: APP_CLIENT_VERSION },
    });
  }

  async stop(): Promise<void> {
    await this.conn?.stop();
    this.conn = null;
  }

  async newSession(cwd?: string): Promise<{ sessionId: string }> {
    // Establish Codex conversation via MCP tool call; we will keep the generated ID locally
    const convId = this.conversationId || this.generateConversationId();
    this.conversationId = convId;

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [CodexMcpAgent] newSession attempt ${attempt}/${maxRetries} for conversation: ${convId}`);

        await this.conn?.request(
          'tools/call',
          {
            name: 'codex',
            arguments: {
              prompt: 'Hello from AionUi',
              cwd: cwd || this.workingDir,
            },
            config: { conversationId: convId },
          },
          600000
        ); // 10分钟超时

        console.log(`✅ [CodexMcpAgent] newSession succeeded on attempt ${attempt}`);
        return { sessionId: convId };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`❌ [CodexMcpAgent] newSession attempt ${attempt}/${maxRetries} failed:`, lastError.message);

        if (attempt === maxRetries) {
          console.error(`🔥 [CodexMcpAgent] All ${maxRetries} attempts failed, giving up`);
          break;
        }

        // 指数退避：2s, 4s, 8s
        const delay = 2000 * Math.pow(2, attempt - 1);
        console.log(`⏱️ [CodexMcpAgent] Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // 如果所有重试都失败，但连接可能仍然有效，只记录错误而不抛出
    console.warn(`⚠️ [CodexMcpAgent] newSession failed after ${maxRetries} attempts, but continuing with session: ${convId}`);
    console.warn(`⚠️ [CodexMcpAgent] Last error:`, lastError?.message);

    // 返回会话 ID，让后续流程继续
    return { sessionId: convId };
  }

  async sendPrompt(prompt: string): Promise<void> {
    const convId = this.conversationId || this.generateConversationId();
    this.conversationId = convId;

    console.log(`📤 [CodexMcpAgent] Sending prompt to conversation: ${convId}`);
    console.log(`📝 [CodexMcpAgent] Prompt preview: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);

    try {
      await this.conn?.request(
        'tools/call',
        {
          name: 'codex-reply',
          arguments: { prompt, conversationId: convId },
        },
        600000 // 10分钟超时，避免长任务中断
      );
      console.log('✅ [CodexMcpAgent] sendPrompt request completed successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log('⚠️ [CodexMcpAgent] sendPrompt request failed, but stream messages may still be arriving:', errorMsg);

      // 检查是否是超时错误
      if (errorMsg.includes('timed out')) {
        console.log('🔄 [CodexMcpAgent] This appears to be a timeout, but Codex may still be processing and sending events');
        console.log('🎯 [CodexMcpAgent] Continuing execution to allow stream processing...');
        // 不抛出错误，因为从日志看到 reasoning_delta 事件仍在正常到达
        return;
      }

      // 对于非超时错误，仍然抛出
      console.error('❌ [CodexMcpAgent] sendPrompt encountered non-timeout error:', errorMsg);
      throw error;
    }
  }

  async sendApprovalResponse(callId: string, approved: boolean, changes: Record<string, any>): Promise<void> {
    await this.conn?.request('apply_patch_approval_response', {
      call_id: callId,
      approved,
      changes,
    });
  }

  resolvePermission(callId: string, approved: boolean): void {
    this.conn?.resolvePermission(callId, approved);
  }

  respondElicitation(callId: string, decision: 'approved' | 'approved_for_session' | 'denied' | 'abort'): void {
    (this.conn as any)?.respondElicitation?.(callId, decision);
  }

  private processCodexEvent(env: { method: string; params?: any }): void {
    console.log('⚡ [CodexMcpAgent] Processing codex event:', env.method);
    console.log('📋 [CodexMcpAgent] Event params:', JSON.stringify(env.params, null, 2));

    // Handle codex/event messages (wrapped messages)
    if (env.method === 'codex/event') {
      const msg = env.params?.msg;
      if (!msg) {
        return;
      }

      try {
        // Forward as a normalized event envelope for future mapping
        // Include _meta information from the original event for proper request tracking
        const enrichedData = {
          ...msg,
          _meta: env.params?._meta, // Pass through meta information like requestId
        };
        console.log('📨 [CodexMcpAgent] Forwarding event to parent:', msg.type || 'unknown');
        this.onEvent({ type: msg.type || 'unknown', data: enrichedData });
      } catch {
        // Ignore errors in event processing
      }

      if (msg.type === 'session_configured' && msg.session_id) {
        this.conversationId = msg.session_id;
      }
      return;
    }

    // Handle direct elicitation/create messages
    if (env.method === 'elicitation/create') {
      try {
        // Forward the elicitation request directly
        this.onEvent({ type: 'elicitation/create', data: env.params });
      } catch {
        // Ignore errors in elicitation processing
      }
      return;
    }
  }

  private handleNetworkError(error: NetworkError): void {
    // Forward network error to the parent handler
    if (this.onNetworkError) {
      this.onNetworkError(error);
    } else {
      // Fallback: emit as a regular event
      this.onEvent({
        type: 'network_error',
        data: {
          errorType: error.type,
          message: error.suggestedAction,
          originalError: error.originalError,
          retryCount: error.retryCount,
        },
      });
    }
  }

  // Public method to reset network error state
  public resetNetworkError(): void {
    this.conn?.resetNetworkError();
  }

  // Public method to check network error state
  public hasNetworkError(): boolean {
    return this.conn?.hasNetworkError() || false;
  }

  private generateConversationId(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const crypto = require('crypto');
      if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      const buf = crypto.randomBytes(8).toString('hex');
      return `conv-${Date.now()}-${buf}`;
    } catch {
      // Final fallback without insecure randomness; keep it monotonic & unique-enough for session scoping
      const ts = Date.now().toString(36);
      const pid = typeof process !== 'undefined' && process.pid ? process.pid.toString(36) : 'p';
      return `conv-${ts}-${pid}`;
    }
  }
}
