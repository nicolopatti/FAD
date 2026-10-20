'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Riscontro delle azioni, unico per tutta l'app: messaggi brevi di conferma
 * (toast) e finestre di conferma proprie al posto di `confirm()`/`alert()`
 * del browser. Montato una volta sola in `app/layout.tsx`.
 */

type ToastKind = 'ok' | 'errore' | 'info';
type Toast = { id: number; kind: ToastKind; testo: string };

export type ConfirmOptions = {
  titolo: string;
  messaggio?: ReactNode;
  /** Etichetta del pulsante che conferma (default "Conferma"). */
  conferma?: string;
  annulla?: string;
  /** Azione distruttiva o irreversibile: pulsante rosso. */
  pericolosa?: boolean;
};

type FeedbackApi = {
  toast: (testo: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

const TOAST_MS = 4200;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const seq = useRef(0);

  const toast = useCallback((testo: string, kind: ToastKind = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, testo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...opts, resolve });
      }),
    [],
  );

  // Apre/chiude il <dialog> nativo in base allo stato (backdrop + focus trap gratis).
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (pending && !d.open) d.showModal();
    if (!pending && d.open) d.close();
  }, [pending]);

  const chiudi = (esito: boolean) => {
    pending?.resolve(esito);
    setPending(null);
  };

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role="status">
            <span className="toast__dot" aria-hidden="true" />
            <span>{t.testo}</span>
          </div>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="dialog"
        aria-labelledby="dialog-titolo"
        onCancel={(e) => { e.preventDefault(); chiudi(false); }}
        onClick={(e) => { if (e.target === dialogRef.current) chiudi(false); }}
      >
        {pending && (
          <form method="dialog" className="dialog__box" onSubmit={(e) => { e.preventDefault(); chiudi(true); }}>
            <h2 id="dialog-titolo" className="dialog__title">{pending.titolo}</h2>
            {pending.messaggio && <div className="dialog__body">{pending.messaggio}</div>}
            <div className="dialog__actions">
              <button type="button" className="btn btn--secondary" onClick={() => chiudi(false)}>
                {pending.annulla ?? 'Annulla'}
              </button>
              <button type="submit" className={`btn ${pending.pericolosa ? 'btn--danger' : ''}`} autoFocus>
                {pending.conferma ?? 'Conferma'}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback va usato dentro <FeedbackProvider>');
  return ctx;
}
