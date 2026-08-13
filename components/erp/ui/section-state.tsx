"use client";

import { AlertCircle, RefreshCcw } from "lucide-react";

export function SectionLoading({ label = "Loading this module" }: { label?: string }) {
  return <section className="state-panel panel"><div className="state-spinner" /><h2>{label}</h2><p>Only the data required for this page is being requested.</p></section>;
}

export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <section className="state-panel panel"><AlertCircle size={34} /><h2>This module could not be loaded</h2><p>{message}</p><button type="button" className="secondary-button" onClick={onRetry}><RefreshCcw size={16} /> Retry</button></section>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{detail}</span></div>;
}
