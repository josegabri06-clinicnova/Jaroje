"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createCopilotStreamParser } from '@/lib/copilot-stream';

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string }

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Chat sencillo contra /api/copilot (sustituye a useChat de la librería `ai`): mismo formato de petición y de respuesta */
export function useCopilotChat({ api, body }: { api: string; body: Record<string, unknown> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleInputChange = useCallback((e: { target: { value: string } }) => setInput(e.target.value), []);

  const handleSubmit = useCallback(async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
    const botId = newId();
    const history = [...messagesRef.current, userMsg];
    setMessages(history);
    setInput('');
    setError(null);
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })), ...bodyRef.current }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const raw = await res.text();
        let msg = raw;
        try { msg = JSON.parse(raw)?.error || raw; } catch { /* texto plano */ }
        throw new Error(msg || `Error ${res.status}`);
      }
      if (!res.body) throw new Error('Respuesta vacía del servidor');

      setMessages([...history, { id: botId, role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createCopilotStreamParser();
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = parser.feed(decoder.decode(value, { stream: true }));
        if (part.error) throw new Error(part.error);
        if (part.text) {
          answer += part.text;
          const current = answer;
          setMessages([...history, { id: botId, role: 'assistant', content: current }]);
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [api, input, isLoading]);

  return { messages, input, handleInputChange, handleSubmit, isLoading, error };
}
