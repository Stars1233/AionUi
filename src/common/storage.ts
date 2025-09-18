/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage } from '@office-ai/platform';
import type { AcpBackend } from './acpTypes';

/**
 * @description 聊天相关的存储
 */
export const ChatStorage = storage.buildStorage<IChatConversationRefer>('agent.chat');

// 聊天消息存储
export const ChatMessageStorage = storage.buildStorage('agent.chat.message');

// 系统配置存储
export const ConfigStorage = storage.buildStorage<IConfigStorageRefer>('agent.config');

// 系统环境变量存储
export const EnvStorage = storage.buildStorage<IEnvStorageRefer>('agent.env');

export interface IConfigStorageRefer {
  'gemini.config': {
    authType: string;
    proxy: string;
    GOOGLE_GEMINI_BASE_URL?: string;
    GOOGLE_CLOUD_PROJECT?: string;
  };
  'acp.config': {
    [backend in AcpBackend]?: {
      authMethodId?: string;
      authToken?: string;
      lastAuthTime?: number;
      cliPath?: string;
    };
  };
  'model.config': IProvider[];
  'mcp.config': IMcpServer[];
  language: string;
  theme: string;
  'gemini.defaultModel': string;
  'tools.imageGenerationModel': TProviderWithModel & {
    switch: boolean;
  };
}

export interface IEnvStorageRefer {
  'aionui.dir': {
    workDir: string;
    cacheDir: string;
  };
}

interface IChatConversation<T, Extra> {
  createTime: number;
  modifyTime: number;
  name: string;
  desc?: string;
  id: string;
  type: T;
  extra: Extra;
  model: TProviderWithModel;
  status?: 'pending' | 'running' | 'finished' | undefined;
}

export type TChatConversation =
  | IChatConversation<
      'gemini',
      {
        workspace: string;
        customWorkspace?: boolean; // true 用户指定工作目录 false 系统默认工作目录
        webSearchEngine?: 'google' | 'default'; // 搜索引擎配置
      }
    >
  | Omit<
      IChatConversation<
        'acp',
        {
          workspace?: string;
          backend: AcpBackend;
          cliPath?: string;
          customWorkspace?: boolean;
        }
      >,
      'model'
    >;

export type IChatConversationRefer = {
  'chat.history': TChatConversation[];
};

export type ModelType =
  | 'text' // 文本对话
  | 'vision' // 视觉理解
  | 'function_calling' // 工具调用
  | 'image_generation' // 图像生成
  | 'web_search' // 网络搜索
  | 'reasoning' // 推理模型
  | 'embedding' // 嵌入模型
  | 'rerank' // 重排序模型
  | 'excludeFromPrimary'; // 排除：不适合作为主力模型

export type ModelCapability = {
  type: ModelType;
  /**
   * 是否为用户手动选择，如果为true，则表示用户手动选择了该类型，否则表示用户手动禁止了该模型；如果为undefined，则表示使用默认值
   */
  isUserSelected?: boolean;
};

export interface IProvider {
  id: string;
  platform: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string[];
  /**
   * 模型能力标签列表。打了标签就是支持，没打就是不支持
   */
  capabilities?: ModelCapability[];
  /**
   * 上下文token限制，可选字段，只在明确知道时填写
   */
  contextLimit?: number;
}

export type TProviderWithModel = Omit<IProvider, 'model'> & { useModel: string };

// MCP Server Configuration Types
export type McpTransportType = 'stdio' | 'sse' | 'http';

export interface IMcpServerTransportStdio {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface IMcpServerTransportSSE {
  type: 'sse';
  url: string;
}

export interface IMcpServerTransportHTTP {
  type: 'http';
  url: string;
}

export type IMcpServerTransport = IMcpServerTransportStdio | IMcpServerTransportSSE | IMcpServerTransportHTTP;

export interface IMcpServer {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  transport: IMcpServerTransport;
  tools?: IMcpTool[];
  status?: 'connected' | 'disconnected' | 'error' | 'testing';
  lastConnected?: number;
  createdAt: number;
  updatedAt: number;
}

export interface IMcpTool {
  name: string;
  description?: string;
  inputSchema?: any;
}
