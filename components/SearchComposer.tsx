"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUpIcon, CloseIcon, SearchIcon } from "./icons";

interface Props {
  defaultValue?: string;
  compact?: boolean;
  autoFocus?: boolean;
  hints?: string[];
  tab?: string;
  suggestions?: boolean;
}

function fold(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function Completion({ text, typed }: { text: string; typed: string }) {
  const t = fold(typed.trim());
  const f = fold(text);
  if (t && f.startsWith(t)) {
    return (
      <span>
        {text.slice(0, t.length)}
        <b>{text.slice(t.length)}</b>
      </span>
    );
  }
  return <span>{text}</span>;
}

export function SearchComposer({ defaultValue = "", compact = false, autoFocus = false, hints = [], tab, suggestions = true }: Props) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [hint, setHint] = useState(0);
  const [exiting, setExiting] = useState<number | null>(null);
  const [typed, setTyped] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
    setTyped(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (hints.length < 2 || value) return;
    const id = setInterval(() => {
      setHint((h) => {
        setExiting(h);
        setTimeout(() => setExiting(null), 260);
        return (h + 1) % hints.length;
      });
    }, 2800);
    return () => clearInterval(id);
  }, [hints.length, value]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!suggestions) return;
    const q = typed;
    if (!q.trim()) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { suggestions: string[] };
        setItems(data.suggestions);
        setCursor(-1);
      } catch {
      }
    }, 90);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [typed, suggestions]);

  const go = (q: string) => {
    const query = q.trim();
    if (!query) {
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    inputRef.current?.blur();
    const params = new URLSearchParams({ q: query });
    if (tab && tab !== "all") params.set("tab", tab);
    router.push(`/search?${params}`);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    go(cursor >= 0 && items[cursor] ? items[cursor] : value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = cursor + dir < -1 ? items.length - 1 : cursor + dir >= items.length ? -1 : cursor + dir;
      setCursor(next);
      setValue(next === -1 ? typed : items[next]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setValue(typed);
    }
  };

  const showDropdown = open && items.length > 0;
  const filled = value.trim().length > 0;

  return (
    <form className="composer-wrap" role="search" action="/search" onSubmit={onSubmit}>
      <div className={`composer ${compact ? "composer-compact" : ""}`} data-open={showDropdown ? "1" : undefined} data-filled={filled ? "1" : undefined}>
        <SearchIcon className="composer-icon" />
        <div className="composer-field">
          <input
            ref={inputRef}
            className="composer-input"
            type="search"
            name="q"
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label="Rechercher sur le web"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={cursor >= 0 ? `${listId}-${cursor}` : undefined}
            onChange={(e) => {
              setTyped(e.target.value);
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
          />
          {!value && hints.length > 0 && (
            <div className="composer-hints" aria-hidden>
              {hints.map((h, i) => (
                <span key={h} className={`hint-word ${i === hint ? "active" : ""} ${i === exiting ? "exiting" : ""}`}>
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>
        {filled && (
          <>
            <button
              type="button"
              className="composer-clear"
              aria-label="Effacer"
              onClick={() => {
                setTyped("");
                setValue("");
                setItems([]);
                inputRef.current?.focus();
              }}
            >
              <CloseIcon />
            </button>
            <span className="composer-divider" />
          </>
        )}
        <button type="submit" className="cta-go" aria-label="Rechercher" disabled={!filled}>
          <ArrowUpIcon style={{ transform: "rotate(90deg)" }} />
        </button>
      </div>

      {showDropdown && (
        <div className="search-dropdown" role="listbox" id={listId}>
          {items.map((s, i) => (
            <button
              key={s}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === cursor}
              className="suggestion"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(s)}
              onMouseEnter={() => setCursor(i)}
            >
              <SearchIcon />
              <Completion text={s} typed={typed} />
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
