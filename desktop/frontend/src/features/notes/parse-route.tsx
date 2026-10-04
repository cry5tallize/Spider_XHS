import { Tabs, Typography } from 'antd';
import { CollectionMode } from '@/shared/contracts';
import { Component as SinglePanel } from './single-panel';
import { InputPanel } from '@/features/parsing/InputPanel';
export function Component() {
  return <div className="page"><div className="page-toolbar"><div><Typography.Title level={2} style={{ marginTop: 0 }}>解析笔记</Typography.Title>
    <Typography.Text type="secondary">整理单条、批量或用户发布的笔记，保留全部媒体候选和解析来源。</Typography.Text></div></div>
    <Tabs destroyOnHidden items={[
      { key: 'single', label: '单笔记', children: <SinglePanel /> },
      { key: 'batch', label: '批量笔记', children: <InputPanel mode={CollectionMode.ModeNotes} /> },
      { key: 'users', label: '用户笔记', children: <InputPanel mode={CollectionMode.ModeUsers} /> },
    ]} />
  </div>;
}
