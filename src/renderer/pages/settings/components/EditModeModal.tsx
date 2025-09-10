import type { IProvider } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Modal } from '@arco-design/web-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const EditModeModal = ModalHOC<{ data?: IProvider; onChange(data: IProvider): void }>(({ modalProps, modalCtrl, ...props }) => {
  const { t } = useTranslation();
  const { data } = props;
  const [form] = Form.useForm();

  useEffect(() => {
    if (data) {
      form.setFieldsValue(data);
    }
  }, [data]);
  return (
    <Modal
      title={t('settings.editModel')}
      {...modalProps}
      onOk={() => {
        form.validate().then((values) => {
          props.onChange({ ...(data || {}), ...values });
        });
      }}
    >
      <Form form={form}>
        <Form.Item label={t('settings.platformName')} required rules={[{ required: true }]} field={'name'}>
          <Input />
        </Form.Item>
        <Form.Item label={t('settings.baseUrl')} required={data?.platform !== 'gemini'} rules={[{ required: data?.platform !== 'gemini' }]} field={'baseUrl'} disabled>
          <Input></Input>
        </Form.Item>
        <Form.Item label={t('settings.apiKey')} required rules={[{ required: true }]} field={'apiKey'} extra={<div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>💡 {t('settings.multiApiKeyEditTip')}</div>}>
          <Input.TextArea rows={4} placeholder={t('settings.apiKeyPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
});

export default EditModeModal;
