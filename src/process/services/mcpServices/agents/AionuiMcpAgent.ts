/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import type { IMcpServer } from '../../../../common/storage';
import { ProcessConfig } from '../../../initStorage';

/**
 * AionUi 本地 MCP 代理实现
 *
 * 专门用于管理通过 @office-ai/aioncli-core 运行的本地 Gemini CLI 的 MCP 配置
 *
 * 工作原理：
 * 1. MCP 配置存储在 ProcessConfig 的 'mcp.config' 中
 * 2. GeminiAgentManager 在启动时从 mcp.config 读取并转换为 @office-ai/aioncli-core 格式
 * 3. @office-ai/aioncli-core 在运行时使用这些 MCP servers
 *
 * 与其他 ACP Backend MCP Agents 的区别：
 * - ACP Backend Agents: 管理真实的 CLI 工具的 MCP 配置 (如 claude mcp, qwen mcp 命令)
 * - AionuiMcpAgent: 管理 AionUi 本地 @office-ai/aioncli-core 的运行时 MCP 配置
 */
export class AionuiMcpAgent extends AbstractMcpAgent {
  constructor() {
    // 使用 'aionui' 作为 backend type 来区分真实的 Gemini CLI
    // 虽然配置最终被 GeminiAgentManager 使用，但在 MCP 管理层面它是独立的 agent
    super('aionui');
  }

  getSupportedTransports(): string[] {
    // @office-ai/aioncli-core 支持 stdio, sse, http
    // 参考: node_modules/@office-ai/aioncli-core/dist/src/config/config.d.ts -> MCPServerConfig
    return ['stdio', 'sse', 'http'];
  }

  /**
   * 检测 AionUi 管理的 MCP 配置
   * 从 ProcessConfig 的统一配置中读取
   */
  async detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      const mcpConfig = await ProcessConfig.get('mcp.config');
      if (!mcpConfig || !Array.isArray(mcpConfig)) {
        return [];
      }

      // 返回所有配置的 MCP servers
      // 过滤出 @office-ai/aioncli-core 支持的传输类型
      return mcpConfig.filter((server: IMcpServer) => {
        const supportedTypes = this.getSupportedTransports();
        return supportedTypes.includes(server.transport.type);
      });
    } catch (error) {
      console.warn('[AionuiMcpAgent] Failed to detect MCP servers:', error);
      return [];
    }
  }

  /**
   * 安装 MCP 服务器到 AionUi 配置
   * 实际上是将配置合并到 ProcessConfig 的统一配置中
   */
  async installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    try {
      // 读取当前配置
      const currentConfig = (await ProcessConfig.get('mcp.config')) || [];
      const existingServers = Array.isArray(currentConfig) ? currentConfig : [];

      // 合并新服务器（去重，以 name 为key）
      const serverMap = new Map<string, IMcpServer>();

      // 先添加现有服务器
      existingServers.forEach((server: IMcpServer) => {
        serverMap.set(server.name, server);
      });

      // 添加或更新新服务器
      mcpServers.forEach((server) => {
        // 只安装支持的传输类型
        if (this.getSupportedTransports().includes(server.transport.type)) {
          serverMap.set(server.name, {
            ...server,
            updatedAt: Date.now(),
          });
        } else {
          console.warn(`[AionuiMcpAgent] Skipping ${server.name}: unsupported transport type ${server.transport.type}`);
        }
      });

      // 转换回数组并保存
      const mergedServers = Array.from(serverMap.values());
      await ProcessConfig.set('mcp.config', mergedServers);

      console.log('[AionuiMcpAgent] Installed MCP servers:', mcpServers.map((s) => s.name).join(', '));
      return { success: true };
    } catch (error) {
      console.error('[AionuiMcpAgent] Failed to install MCP servers:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从 AionUi 配置中删除 MCP 服务器
   */
  async removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    try {
      // 读取当前配置
      const currentConfig = (await ProcessConfig.get('mcp.config')) || [];
      const existingServers = Array.isArray(currentConfig) ? currentConfig : [];

      // 过滤掉要删除的服务器
      const filteredServers = existingServers.filter((server: IMcpServer) => server.name !== mcpServerName);

      // 如果没有任何变化，说明服务器不存在（也算成功）
      if (filteredServers.length === existingServers.length) {
        console.log(`[AionuiMcpAgent] MCP server '${mcpServerName}' not found, nothing to remove`);
        return { success: true };
      }

      // 保存更新后的配置
      await ProcessConfig.set('mcp.config', filteredServers);

      console.log(`[AionuiMcpAgent] Removed MCP server: ${mcpServerName}`);
      return { success: true };
    } catch (error) {
      console.error('[AionuiMcpAgent] Failed to remove MCP server:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
