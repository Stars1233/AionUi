/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpStatus, IMessageCodexStatus } from '@/common/chatLib';
import { Badge, Typography } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';

const { Text } = Typography;

interface MessageAcpStatusProps {
  message: IMessageAcpStatus | IMessageCodexStatus;
}

const MessageAcpStatus: React.FC<MessageAcpStatusProps> = ({ message }) => {
  const { status, message: statusMessage } = message.content;
  const backend = 'backend' in message.content ? message.content.backend : undefined;

  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return <Badge status='processing' text='Connecting' />;
      case 'connected':
        return <Badge status='success' text='Connected' />;
      case 'authenticated':
        return <Badge status='success' text='Authenticated' />;
      case 'session_active':
        return <Badge status='success' text='Session Active' />;
      case 'disconnected':
        return <Badge status='default' text='Disconnected' />;
      case 'error':
        return <Badge status='error' text='Error' />;
      default:
        return <Badge status='default' text='Unknown' />;
    }
  };

  const getBackendIcon = () => {
    switch (backend) {
      case 'claude':
        return '🤖'; // Claude icon
      case 'gemini':
        return '✨'; // Gemini icon
      default:
        return '🔌'; // Generic connection icon
    }
  };

  const isError = status === 'error';
  const isSuccess = status === 'connected' || status === 'authenticated' || status === 'session_active';

  return (
    <div
      className={classNames('acp-status-message', 'flex items-center gap-3 p-3 rounded-lg border', {
        'bg-red-50 border-red-200 text-red-700': isError,
        'bg-green-50 border-green-200 text-green-700': isSuccess,
        'bg-blue-50 border-blue-200 text-blue-700': !isError && !isSuccess,
      })}
    >
      {backend && (
        <div className='flex items-center gap-2'>
          <Text style={{ fontWeight: 'bold' }} className='capitalize'>
            {backend}
          </Text>
        </div>
      )}

      <div className='flex-1'>{getStatusBadge()}</div>

      <div className='text-sm'>
        <Text type='secondary'>{statusMessage}</Text>
      </div>
    </div>
  );
};

export default MessageAcpStatus;
