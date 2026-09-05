import { Modal } from '@douyinfe/semi-ui'

interface ConfirmDialogOptions {
  title: string
  content: string
  okText?: string
  cancelText?: string
  danger?: boolean
  onOk: () => void | Promise<void>
  onCancel?: () => void
}

export function showConfirm({
  title,
  content,
  okText = '确认',
  cancelText = '取消',
  danger = false,
  onOk,
  onCancel,
}: ConfirmDialogOptions) {
  Modal.confirm({
    title,
    content,
    okText,
    cancelText,
    okButtonProps: danger ? { type: 'danger' } : undefined,
    onOk: async () => {
      await onOk()
    },
    onCancel: () => {
      onCancel?.()
    },
  })
}
