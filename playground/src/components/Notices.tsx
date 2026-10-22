import type { ReactNode } from "react";

/** An empty state. One action, per the copy deck. */
export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

/** An error notice. One action, per the copy deck. */
export function ErrorNotice({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="error-notice" role="alert">
      <p>{message}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
