import { useEffect, useState, type ReactNode } from 'react';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'normal' | 'small';
  disabled?: boolean;
  title?: string;
  accent?: string;
}) {
  const cls = [
    'btn',
    props.variant === 'primary' ? 'primary' : '',
    props.variant === 'ghost' ? 'ghost' : '',
    props.size === 'small' ? 'small' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      className={cls}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      style={props.accent && props.variant === 'primary' ? { background: `linear-gradient(120deg, ${props.accent}, ${props.accent}cc)`, boxShadow: `0 10px 26px ${props.accent}55` } : undefined}
    >
      {props.children}
    </button>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={() => onClose?.()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

export function useToast(): [string, (m: string, ms?: number) => void] {
  const [msg, setMsg] = useState('');
  const show = (m: string, ms = 2200) => {
    setMsg(m);
    window.setTimeout(() => setMsg(''), ms);
  };
  return [msg, show];
}
