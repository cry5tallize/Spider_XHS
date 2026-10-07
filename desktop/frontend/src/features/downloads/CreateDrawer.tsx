import { Drawer } from 'antd';
import type { DownloadConfig } from '@/shared/contracts';
import { DownloadPanel } from './DownloadPanel';

type Props = {
  open: boolean;
  onClose: () => void;
  snapshotID: string;
  batchSnapshotIDs?: string[];
  title: string;
  initialConfig?: DownloadConfig;
  force?: boolean;
};
export function CreateDownloadDrawer(props: Props) {
  return (
    <Drawer
      title={props.title ? '下载 · ' + props.title : '下载笔记'}
      open={props.open}
      onClose={props.onClose}
      size={520}
      destroyOnHidden
    >
      {props.open && (
        <DownloadPanel
          snapshotIDs={props.batchSnapshotIDs || [props.snapshotID]}
          initialConfig={props.initialConfig}
          force={props.force}
        />
      )}
    </Drawer>
  );
}
