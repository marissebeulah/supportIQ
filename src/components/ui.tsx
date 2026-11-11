import { useEffect, useId, useState, type ButtonHTMLAttributes, type ComponentType, type ReactNode, type SelectHTMLAttributes } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, Star, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCountUp } from "../lib/hooks";
import { PRIORITY_META, STATUS_META, initials } from "../lib/format";
import type { Priority, ProductConcernSummary, Status } from "../lib/types";

export type IconType = ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>;

/* ------------------------------------------------------------------ Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <LoaderCircle size={15} className="spin" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`.trim()} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  className = "",
  children,
  style,
}: {
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`card ${className}`.trim()} style={style}>
      {children}
    </section>
  );
}

export function CardHead({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="card-head">
      <div>
        <h2 className="card-title">{title}</h2>
        {description ? <p className="card-desc">{description}</p> : null}
      </div>
      {action ? <div className="card-head-action">{action}</div> : null}
    </header>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function PaginatedList<T>({
  items,
  label,
  children,
}: {
  items: T[];
  label: string;
  children: (pageItems: T[]) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * pageSize;

  useEffect(() => {
    setPage(1);
  }, [items, pageSize]);

  return (
    <>
      {children(items.slice(firstIndex, firstIndex + pageSize))}
      {total ? (
        <nav className="pagination" aria-label={`${label} pages`}>
          <span className="pagination-summary" aria-live="polite">
            Showing {firstIndex + 1}-{Math.min(firstIndex + pageSize, total)} of {total} {label}
          </span>
          <div className="pagination-controls">
            {total > PAGE_SIZE_OPTIONS[0] ? (
              <label className="pagination-size">
                <span>Rows</span>
                <select
                  className="select"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  aria-label="Rows per page"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {pageCount > 1 ? (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Previous page"
                  title="Previous page"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="pagination-page">Page {currentPage} of {pageCount}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Next page"
                  title="Next page"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ Badges */

export function StatusPill({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span className={`badge badge-${status}`}>
      <i className="badge-dot" />
      {meta.label}
    </span>
  );
}

export function PriorityPill({ priority, withDot = false }: { priority: Priority; withDot?: boolean }) {
  return (
    <span className={`badge badge-priority-${priority}`}>
      {withDot ? <i className="badge-dot" /> : null}
      {PRIORITY_META[priority].label}
    </span>
  );
}

export function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`tag ${className}`.trim()}>{children}</span>;
}

export function ProductPill({
  product,
  className = "",
}: {
  product: { id: number; name: string } | null;
  className?: string;
}) {
  return (
    <span
      className={`badge badge-product ${product ? "" : "is-unassigned"} ${className}`.trim()}
      title={product ? `Product: ${product.name}` : "No product selected"}
    >
      {product ? product.name : "No product selected"}
    </span>
  );
}

const PRODUCT_CONCERN_COLORS = ["#0f5d4c", "#1f4bc4", "#c2801a", "#8151cc", "#a8331f", "#2f7d7a"];

export function ProductConcerns({
  items,
  onSelect,
  emptyLabel = "No product concerns yet.",
}: {
  items: ProductConcernSummary[];
  onSelect?: (id: number | null) => void;
  emptyLabel?: string;
}) {
  if (!items.length) return <p className="small muted">{emptyLabel}</p>;

  const max = Math.max(1, ...items.map((item) => item.total));

  return (
    <div className="product-concerns" aria-label="Concerns by product">
      {items.map((item, index) => {
        const share = Math.round((item.total / max) * 100);
        const body = (
          <>
            <div className="product-concern-top">
              <span className="product-concern-name">{item.name}</span>
              <b>{item.total}</b>
            </div>
            <div className="product-concern-track" aria-hidden="true">
              <div
                className="product-concern-fill"
                style={{
                  width: `${share}%`,
                  background: PRODUCT_CONCERN_COLORS[index % PRODUCT_CONCERN_COLORS.length],
                }}
              />
            </div>
            <div className="product-concern-meta">
              <span>{item.open} open</span>
              <span>·</span>
              <span>{item.resolved} resolved</span>
              {item.late ? (
                <>
                  <span>·</span>
                  <span className="is-late">{item.late} late</span>
                </>
              ) : null}
              {item.csatAvg != null ? (
                <>
                  <span>·</span>
                  <span>{item.csatAvg.toFixed(1)} / 5</span>
                </>
              ) : null}
            </div>
          </>
        );

        if (onSelect) {
          return (
            <button
              key={item.id ?? "none"}
              type="button"
              className="product-concern product-concern-button"
              onClick={() => onSelect(item.id)}
            >
              {body}
            </button>
          );
        }

        return (
          <div key={item.id ?? "none"} className="product-concern">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function LiveBadge({ status }: { status: "connecting" | "live" | "offline" }) {
  return (
    <span className={`live live-${status}`} title="Live updates">
      <i />
      {status === "live" ? "Live" : status === "offline" ? "Reconnecting" : "Connecting"}
    </span>
  );
}

/* ------------------------------------------------------------------ Avatar */

const AVATAR_TONES = ["sage", "clay", "slate", "plum", "sand", "teal"];

export function Avatar({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 7)) % AVATAR_TONES.length;
  }
  return (
    <span className={`avatar avatar-${size} avatar-tone-${AVATAR_TONES[hash]} ${className}`.trim()} aria-hidden>
      {initials(name) || "?"}
    </span>
  );
}

/* ------------------------------------------------------------------- Forms */

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className = "",
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className}`.trim()}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`switch ${disabled ? "is-disabled" : ""}`.trim()}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="track" />
    </label>
  );
}

/* ------------------------------------------------------------------ Layout */

export function PageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-sub">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Back */

export function BackButton({
  fallback = "/",
  label = "Back",
  className = "",
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const navigate = useNavigate();

  const goBack = () => {
    const index = Number((window.history.state as { idx?: number } | null)?.idx ?? 0);
    if (index > 0) navigate(-1);
    else navigate(fallback);
  };

  return (
    <button type="button" className={`back-btn ${className}`.trim()} onClick={goBack}>
      <ArrowLeft size={14} />
      <span>{label}</span>
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading-block">
      <LoaderCircle size={22} className="spin" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  const animated = useCountUp(value);
  return <>{format ? format(animated) : Math.round(animated).toLocaleString()}</>;
}

/* --------------------------------------------------------------- Skeletons */

export function Skeleton({
  width,
  height = 10,
  radius = 6,
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-grid" role="status" aria-label="Loading summary">
      {Array.from({ length: count }).map((_, index) => (
        <div className="stat skeleton-stat" key={index}>
          <Skeleton width={72} height={9} />
          <Skeleton
            width={`${42 + (index % 3) * 8}%`}
            height={26}
            radius={8}
            className="skeleton-gap"
          />
          <Skeleton width={`${58 + (index % 2) * 12}%`} height={10} className="skeleton-gap" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({
  rows = 4,
  avatar = true,
}: {
  rows?: number;
  avatar?: boolean;
}) {
  return (
    <div className="skeleton-rows" role="status" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton-row" key={index}>
          {avatar ? <span className="skeleton skeleton-avatar" /> : null}
          <span className="skeleton-lines">
            <Skeleton width={`${64 + (index % 4) * 7}%`} height={11} />
            <Skeleton width={`${38 + (index % 3) * 9}%`} height={9} />
          </span>
          <Skeleton width={44} height={9} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: IconType;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={20} />
      </span>
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="error-note" role="alert">
      <CircleAlert size={16} />
      <span>{message}</span>
    </div>
  );
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const titleId = useId();
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setVisible(true);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(false), 140);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open && !visible) return null;

  return (
    <div
      className={`modal-backdrop ${open ? "" : "is-closing"}`.trim()}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width: `min(${width}px, 100%)` }}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
            {description ? <p className="hint modal-desc">{description}</p> : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose} className="modal-close">
            <X size={17} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body ? <p className="confirm-body">{body}</p> : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------- Stars */

export function Stars({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange?: (next: number) => void;
  size?: "sm" | "md" | "lg";
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const starSize = size === "lg" ? 26 : size === "sm" ? 13 : 18;

  if (!onChange) {
    return (
      <span className={`stars stars-${size}`} aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} size={starSize} className={star <= value ? "is-on" : ""} fill={star <= value ? "currentColor" : "none"} />
        ))}
      </span>
    );
  }

  return (
    <span className={`stars stars-${size}`} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-btn ${star <= shown ? "is-on" : ""}`}
          onMouseEnter={() => setHover(star)}
          onFocus={() => setHover(star)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(star)}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          aria-pressed={value === star}
        >
          <Star size={starSize} fill={star <= shown ? "currentColor" : "none"} />
        </button>
      ))}
    </span>
  );
}

/* --------------------------------------------------------------- Segmented */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined ? <span className="seg-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
