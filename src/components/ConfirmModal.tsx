import { App } from 'obsidian';
import React, { useState, type ReactNode } from 'react';
import { ReactModal } from './ReactModal';
import { usePending } from '../hooks/usePending';

// ── Form ─────────────────────────────────────────────────────────────────────

interface ConfirmFormProps {
  message: string;
  confirmLabel: string;
  /** Label shown on the confirm button while `onConfirm` is running. */
  pendingLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const ConfirmForm: React.FC<ConfirmFormProps> = ({ message, confirmLabel, pendingLabel, onConfirm, onCancel }) => {
  const { pending, run } = usePending();
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setError('');
    try {
      await run(onConfirm);
    } catch (e) {
      // The caller has already shown a notice; keep the dialog open with the reason.
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  return (
    <fieldset className="m365-confirm-form" disabled={pending} aria-busy={pending}>
      {error && <div className="m365-form-error">{error}</div>}
      <p>{message}</p>
      <div className="m365-form-actions">
        <button onClick={onCancel} autoFocus>Cancel</button>
        <button className="mod-warning" onClick={() => void handleConfirm()}>
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </fieldset>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * Asks the user to confirm a destructive action. Stays open (disabled) while `onConfirm` runs,
 * closes when it succeeds, and shows the error if it rejects.
 */
export class ConfirmModal extends ReactModal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly pendingLabel: string,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(app);
  }

  protected getTitle(): string {
    return this.title;
  }

  protected renderContent(): ReactNode {
    return (
      <ConfirmForm
        message={this.message}
        confirmLabel={this.confirmLabel}
        pendingLabel={this.pendingLabel}
        onConfirm={() => this.closeAfter(this.onConfirm)}
        onCancel={() => this.close()}
      />
    );
  }
}
