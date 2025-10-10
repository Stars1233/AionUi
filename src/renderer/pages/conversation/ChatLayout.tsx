import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { removeStack } from '@/renderer/utils/common';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React, { useState } from 'react';

import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import classNames from 'classnames';

const addEventListener = <K extends keyof DocumentEventMap>(key: K, handler: (e: DocumentEventMap[K]) => void): (() => void) => {
  document.addEventListener(key, handler);
  return () => {
    document.removeEventListener(key, handler);
  };
};

const useSiderWidthWithDrag = (defaultWidth: number) => {
  const [siderWidth, setSiderWidth] = useState(defaultWidth);

  const handleDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const target = e.target as HTMLElement;

    const initDragStyle = () => {
      const originalUserSelect = document.body.style.userSelect;
      target.classList.add('bg-#86909C/40');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      return () => {
        target.classList.remove('bg-#86909C/40');
        document.body.style.userSelect = originalUserSelect;
        document.body.style.cursor = '';
        target.style.transform = '';
      };
    };

    const remove = removeStack(
      initDragStyle(),
      addEventListener('mousemove', (e: MouseEvent) => {
        const deltaX = startX - e.clientX;
        const newWidth = Math.max(200, Math.min(500, siderWidth + deltaX));
        target.style.transform = `translateX(${siderWidth - newWidth}px)`;
      }),
      addEventListener('mouseup', (e) => {
        const deltaX = startX - e.clientX;
        const newWidth = Math.max(200, Math.min(500, siderWidth + deltaX));
        setSiderWidth(newWidth);
        remove();
      })
    );
  };

  const dragContext = (
    <div
      className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize  z-10 hover:bg-#86909C/20`}
      onMouseDown={handleDragStart}
      onDoubleClick={() => {
        setSiderWidth(defaultWidth);
      }}
    />
  );

  return { siderWidth, dragContext };
};

const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
}> = (props) => {
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(false);

  const { siderWidth, dragContext } = useSiderWidthWithDrag(266);
  const { backend } = props;

  return (
    <ArcoLayout className={'size-full'}>
      <ArcoLayout.Content>
        <ArcoLayout.Header className={classNames('flex items-center justify-between p-16px gap-16px  !bg-#F7F8FA', backend ? 'h-96px' : 'h-56px')}>
          <FlexFullContainer className='h-full'>
            <span className=' ml-16px font-bold text-16px inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full max-w-60%'>{props.title}</span>
            {backend && (
              <div className='ml-16px flex items-center gap-2 bg-[#f2f3f5] w-fit rounded-full px-[8px] py-[2px]'>
                <img src={backend === 'claude' ? ClaudeLogo : backend === 'gemini' ? GeminiLogo : backend === 'qwen' ? QwenLogo : backend === 'iflow' ? IflowLogo : backend === 'codex' ? CodexLogo : ''} alt={`${backend} logo`} width={16} height={16} style={{ objectFit: 'contain' }} />
                <span className='font-medium'>{ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name || backend}</span>
              </div>
            )}
          </FlexFullContainer>
          <div className='flex items-center gap-16px'>{rightSiderCollapsed ? <ExpandRight onClick={() => setRightSiderCollapsed(false)} className='cursor-pointer flex' theme='outline' size='24' fill='#86909C' strokeWidth={3} /> : <ExpandLeft onClick={() => setRightSiderCollapsed(true)} className='cursor-pointer flex' theme='outline' size='24' fill='#86909C' strokeWidth={3} />}</div>
        </ArcoLayout.Header>
        <ArcoLayout.Content className={classNames('h-[calc(100%-106px)] bg-#F9FAFB', backend ? 'h-[calc(100%-106px)]' : 'h-[calc(100%-66px)]')}>{props.children}</ArcoLayout.Content>
      </ArcoLayout.Content>

      <ArcoLayout.Sider width={siderWidth} collapsedWidth={0} collapsed={rightSiderCollapsed} className={'!bg-#F7F8FA relative'}>
        {/* Drag handle */}
        {/* <div className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize transition-all duration-200 z-10 ${isDragging ? 'bg-#86909C/40' : 'hover:bg-#86909C/20'}`} onMouseDown={handleDragStart} onDoubleClick={handleDoubleClick} /> */}
        {dragContext}
        <ArcoLayout.Header className={'flex items-center justify-start p-16px gap-16px h-56px'}>
          <div className='w-full'>{props.siderTitle}</div>
          {/* <ExpandLeft theme='outline' size='24' fill='#86909C' className='cursor-pointer' strokeWidth={3} onClick={() => setRightSiderCollapsed(true)} /> */}
        </ArcoLayout.Header>
        <ArcoLayout.Content className={'h-[calc(100%-106px)] bg-#F9FAFB'}>{props.sider}</ArcoLayout.Content>
      </ArcoLayout.Sider>
    </ArcoLayout>
  );
};

export default ChatLayout;
