import type { ReactNode } from 'react';
import { Button, Skeleton } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-heading-actions">{actions}</div>
    </header>
  );
}

export function WorkspaceHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-heading">
        <span className="workspace-page-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <div className="workspace-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="workspace-header-actions">{actions}</div>
    </header>
  );
}

export function MetricStrip({
  items,
  caption,
  loading = false,
}: {
  items: { label: string; value: ReactNode; icon: ReactNode; tone?: string }[];
  caption?: ReactNode;
  loading?: boolean;
}) {
  return (
    <section className="metric-section" aria-label="概览" aria-busy={loading}>
      <div className="metric-strip">
        {items.map((item) => (
          <div className="workspace-metric" key={item.label}>
            <span className={`metric-icon tone-${item.tone || 'primary'}`} aria-hidden="true">
              {item.icon}
            </span>
            <div>
              <div className="metric-label">{item.label}</div>
              <div className="metric-value">{loading ? '—' : item.value}</div>
            </div>
          </div>
        ))}
      </div>
      {caption && <div className="metric-caption">{caption}</div>}
    </section>
  );
}

export function FilterTabs({
  value,
  onChange,
  items,
  label = '筛选',
}: {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string; count?: number }[];
  label?: string;
}) {
  return (
    <div className="workspace-filter-tabs" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          key={item.value}
          className={`workspace-filter-tab${item.value === value ? ' is-active' : ''}`}
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function WorkspaceEmpty({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="workspace-empty">
      <div className="workspace-empty-art" aria-hidden="true">
        <span>{icon}</span>
        <i />
        <i />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Button type="primary" onClick={onAction} icon={<ArrowRightOutlined />} iconPlacement="end">
          {action}
        </Button>
      )}
    </div>
  );
}

export function WorkspaceSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="workspace-skeleton" role="status" aria-label="正在加载">
      {Array.from({ length: count }, (_, i) => (
        <div className="workspace-skeleton-card" key={i}>
          <Skeleton active avatar paragraph={{ rows: 2 }} />
        </div>
      ))}
    </div>
  );
}
