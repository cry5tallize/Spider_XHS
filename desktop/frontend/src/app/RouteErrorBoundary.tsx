import { Button, Result } from 'antd';
import { useNavigate } from 'react-router';

export function RouteErrorBoundary() {
  const navigate = useNavigate();
  return <Result status="error" title="页面暂时无法打开" subTitle="请返回工作空间后重试。"
    extra={<Button type="primary" onClick={() => void navigate('/')}>返回工作空间</Button>} />;
}
