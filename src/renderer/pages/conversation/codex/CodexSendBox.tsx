import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook } from '@/renderer/hooks/useSendBoxDraft';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TMessage } from '@/common/chatLib';
import { CodexMessageTransformer } from '@/agent/codex/CodexMessageTransformer';

const useCodexSendBoxDraft = getSendBoxDraftHook('codex', {
  _type: 'codex',
  atPath: [],
  content: '',
  uploadFile: [],
});

const CodexSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [waitingForSession, setWaitingForSession] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  // 用于跟踪已处理的全局状态消息，避免重复
  const processedGlobalMessages = useRef(new Set<string>());
  const { content, setContent, atPath, setAtPath, uploadFile, setUploadFile } = (function useDraft() {
    const { data, mutate } = useCodexSendBoxDraft(conversation_id);
    const EMPTY: string[] = [];
    const atPath = data?.atPath ?? EMPTY;
    const uploadFile = data?.uploadFile ?? EMPTY;
    const content = data?.content ?? '';
    return {
      atPath,
      uploadFile,
      content,
      setAtPath: (val: string[]) => mutate((prev) => ({ ...(prev as any), atPath: val })),
      setUploadFile: (val: string[]) => mutate((prev) => ({ ...(prev as any), uploadFile: val })),
      setContent: (val: string) => mutate((prev) => ({ ...(prev as any), content: val })),
    };
  })();

  // 当会话ID变化时，清理已处理的全局消息记录
  useEffect(() => {
    processedGlobalMessages.current.clear();
    // console.log(`🧹 [CodexSendBox] Cleared processed global messages for conversation: ${conversation_id}`);
  }, [conversation_id]);

  useEffect(() => {
    return ipcBridge.codexConversation.responseStream.on(async (message) => {
      // Received message
      if (conversation_id !== message.conversation_id) {
        return;
      }

      // console.log(`📨 [CodexSendBox] Received message type: ${message.type}`, message);
      if (message.type === 'start') {
        setRunning(true);
        setWaitingForSession(true);
      }
      if (message.type === 'finish') {
        // console.log('🏁 [CodexSendBox] Conversation finished, clearing all states');
        setRunning(false);
        setWaitingForSession(false);
        setIsThinking(false);
      }

      // 处理思考状态
      if (message.type === 'agent_reasoning') {
        // console.log('🤔 [CodexSendBox] Starting thinking state');
        setIsThinking(true);
      }
      if (message.type === 'agent_reasoning_raw_content') {
        // console.log('💭 [CodexSendBox] Thinking completed, updating status');
        // Add a small delay to ensure the thinking completion message is visible
        setTimeout(() => {
          setIsThinking(false);
        }, 1500); // Show completion state for 1.5 seconds
      }

      // 处理消息
      if (message.type === 'content' || message.type === 'user_content' || message.type === 'error') {
        // 收到内容消息时，确保清除思考状态（防止状态卡住）
        if (isThinking) {
          // console.log('📝 [CodexSendBox] Received content message, clearing thinking state');
          setIsThinking(false);
        }
        // 通用消息类型使用标准转换器
        const transformedMessage = transformMessage(message);
        addOrUpdateMessage(transformedMessage);
      } else if (message.type === 'acp_permission' && message.data?.agentType === 'codex') {
        // Codex-specific ACP permission requests
        try {
          // Use Codex-specific transformer for these messages
          const transformedMessage = CodexMessageTransformer.transformCodexMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
        } catch (error) {
          console.error('❌ [CodexSendBox] Error transforming Codex ACP permission message:', error);
          // Fallback to standard transformation
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
        }
      } else if (CodexMessageTransformer.isCodexSpecificMessage(message.type)) {
        // 当收到agent_message时，确保清除思考状态
        if (message.type === 'agent_message' && isThinking) {
          // console.log('📝 [CodexSendBox] Received agent_message, clearing thinking state');
          setIsThinking(false);
        }

        // Codex 特定消息类型使用专用转换器
        const transformedMessage = CodexMessageTransformer.transformCodexMessage(message);
        if (transformedMessage) {
          // 对于全局状态消息，检查是否已经处理过相同的消息
          const isGlobalStatusMessage = ['codex_thinking_global', 'codex_status_global'].includes(transformedMessage.msg_id);

          if (isGlobalStatusMessage) {
            const messageKey = `${transformedMessage.msg_id}_${JSON.stringify(transformedMessage.content)}`;

            // 如果这个全局状态消息已经处理过，跳过
            if (processedGlobalMessages.current.has(messageKey)) {
              // console.log(`🔄 [CodexSendBox] Skipping duplicate global status message: ${transformedMessage.msg_id}`);
              return;
            }

            // 标记为已处理
            processedGlobalMessages.current.add(messageKey);
            // console.log(`✅ [CodexSendBox] Processing new global status message: ${transformedMessage.msg_id}`);
          }

          addOrUpdateMessage(transformedMessage);
        }
      }
    });
  }, [conversation_id]);

  // 处理粘贴的文件 - Codex专用逻辑
  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      // 将粘贴的文件添加到uploadFile中
      const filePaths = pastedFiles.map((file) => file.path);
      setUploadFile([...uploadFile, ...filePaths]);
    },
    [uploadFile, setUploadFile]
  );

  // 粘贴处理现在直接在 SendBox 组件中处理（通过 componentId 检测）

  useAddEventListener('codex.selected.file', (files: string[]) => {
    // Add a small delay to ensure state persistence and prevent flashing
    setTimeout(() => {
      setAtPath(files);
    }, 10);
  });

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();
    const loading_id = uuid();

    // 立即清空输入框和选择的文件，提升用户体验
    setContent('');
    emitter.emit('codex.selected.file.clear');
    const currentAtPath = [...atPath];
    const currentUploadFile = [...uploadFile];
    setAtPath([]);
    setUploadFile([]);

    if (currentAtPath.length || currentUploadFile.length) {
      message = currentUploadFile.map((p) => '@' + p.split(/[\\/]/).pop()).join(' ') + ' ' + currentAtPath.map((p) => '@' + p).join(' ') + ' ' + message;
    }
    // 前端先写入用户消息，避免导航/事件竞争导致看不到消息
    const userMessage: TMessage = {
      id: msg_id,
      msg_id,
      conversation_id,
      type: 'text',
      position: 'right',
      content: { content: message },
      createdAt: Date.now(),
    };
    addOrUpdateMessage(userMessage, true); // 立即保存到存储，避免刷新丢失

    // Set waiting state when sending message
    setWaitingForSession(true);

    try {
      await ipcBridge.codexConversation.sendMessage.invoke({
        input: message,
        msg_id,
        conversation_id,
        files: [...currentUploadFile, ...currentAtPath], // 包含上传文件和选中的工作空间文件
        loading_id,
      });
    } finally {
      // Clear waiting state when done
      setWaitingForSession(false);
    }
  };

  // 处理从引导页带过来的 initial message，确保页面加载后再发送
  useEffect(() => {
    if (!conversation_id) return;

    const storageKey = `codex_initial_message_${conversation_id}`;
    const processedKey = `codex_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;

      // 双重检查锁定模式，防止竞态条件
      if (sessionStorage.getItem(processedKey)) {
        // console.log(`🔄 [CodexSendBox] Initial message already processed for conversation: ${conversation_id}`);
        return;
      }

      // 立即标记为已处理，防止重复处理
      sessionStorage.setItem(processedKey, 'true');

      try {
        // Set waiting state when processing initial message
        setWaitingForSession(true);

        const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
        // 使用固定的msg_id，基于conversation_id确保唯一性
        const msg_id = `initial_${conversation_id}_${Date.now()}`;
        const loading_id = uuid();

        // console.log(`✅ [CodexSendBox] Processing initial message for conversation: ${conversation_id}, input: "${input}"`);

        // 发送消息，让后端处理用户消息的添加（在连接建立后）
        await ipcBridge.codexConversation.sendMessage.invoke({ input, msg_id, conversation_id, files, loading_id });

        // 成功后移除初始消息存储
        sessionStorage.removeItem(storageKey);
        // console.log(`🧹 [CodexSendBox] Initial message sent successfully and cleaned up for conversation: ${conversation_id}`);
      } catch (err) {
        // console.error('❌ [CodexSendBox] Failed to process initial message:', err);
        // 发送失败时清理处理标记，允许重试
        sessionStorage.removeItem(processedKey);
      } finally {
        // Clear waiting state
        setWaitingForSession(false);
      }
    };

    // 使用 setTimeout 确保在组件完全挂载后执行
    const timer = setTimeout(() => {
      processInitialMessage();
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [conversation_id, addOrUpdateMessage]);

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col'>
      {(isThinking || waitingForSession) && (
        <div className='mb-8px'>
          <span className='text-12px text-#999 px-8px py-4px bg-#f5f5f5 rounded-4px'>{isThinking ? t('codex.thinking.please_wait') : t('codex.sendbox.waiting', { defaultValue: 'Please wait...' })}</span>
        </div>
      )}
      <SendBox
        value={content}
        onChange={(val) => {
          // Only allow content changes when not waiting for session or thinking
          if (!waitingForSession && !isThinking) {
            setContent(val);
          }
        }}
        loading={running}
        disabled={waitingForSession || isThinking}
        placeholder={waitingForSession || isThinking ? t('codex.sendbox.waiting', { defaultValue: 'Please wait...' }) : t('acp.sendbox.placeholder', { backend: 'Codex', defaultValue: `Send message to Codex...` })}
        onStop={() => {
          return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {});
        }}
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        prefix={
          <>
            {uploadFile.map((path) => (
              <Tag
                color='blue'
                key={path}
                closable
                className={'mr-4px'}
                onClose={() => {
                  setUploadFile(uploadFile.filter((v) => v !== path));
                }}
              >
                {path.split('/').pop()}
              </Tag>
            ))}
            {atPath.map((path) => (
              <Tag
                key={path}
                color='gray'
                closable
                className={'mr-4px'}
                onClose={() => {
                  const newAtPath = atPath.filter((v) => v !== path);
                  emitter.emit('codex.selected.file', newAtPath);
                  setAtPath(newAtPath);
                }}
              >
                {path}
              </Tag>
            ))}
          </>
        }
        tools={
          <>
            <Button
              type='secondary'
              shape='circle'
              icon={<Plus theme='outline' size='14' strokeWidth={2} fill='#333' />}
              onClick={() => {
                ipcBridge.dialog.showOpen.invoke({ properties: ['openFile', 'multiSelections'] }).then((files) => setUploadFile(files || []));
              }}
            ></Button>
          </>
        }
        onSend={onSendHandler}
      ></SendBox>
    </div>
  );
};

export default CodexSendBox;
