import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MentionPicker } from "./MentionPicker";
import { cn } from "@/lib/utils";

interface MentionEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  departments?: Array<{ id: string; name: string; color: string }>;
  statuses?: Array<{ id: string; name: string; color: string }>;
  tags?: Array<{ id: string; name: string; color: string }>;
  templates?: Array<{ id: string; name: string }>;
  teamMembers?: Array<{ id: string; full_name: string }>;
  aiAgents?: Array<{ id: string; name: string; is_active?: boolean }>;
  lawFirm?: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    instagram?: string;
    facebook?: string;
    website?: string;
    business_hours?: unknown;
  };
}

// Regex to match mentions: supports @foo, @foo bar, @foo:bar, @foo:<bar|baz>
const MENTION_REGEX =
  /@([A-Za-zÀ-ÿ0-9_]+(?:\s[A-Za-zÀ-ÿ0-9_]+)*(?::[A-Za-zÀ-ÿ0-9_\s/|<>.-]+)?)/g;

// Explicit Tailwind classes for mention badges (dynamic classes don't work with JIT)
const MENTION_COLORS = {
  department: "bg-blue-500/15 text-blue-600 border-blue-500/30 hover:bg-blue-500/25 dark:text-blue-400",
  status: "bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/25 dark:text-amber-400",
  tag: "bg-purple-500/15 text-purple-600 border-purple-500/30 hover:bg-purple-500/25 dark:text-purple-400",
  responsible: "bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/25 dark:text-green-400",
  template: "bg-pink-500/15 text-pink-600 border-pink-500/30 hover:bg-pink-500/25 dark:text-pink-400",
  calendar: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30 hover:bg-cyan-500/25 dark:text-cyan-400",
  tool: "bg-orange-500/15 text-orange-600 border-orange-500/30 hover:bg-orange-500/25 dark:text-orange-400",
  data: "bg-slate-500/15 text-slate-600 border-slate-500/30 hover:bg-slate-500/25 dark:text-slate-400",
} as const;

function getMentionColor(mentionText: string): string {
  const lower = mentionText.toLowerCase();

  if (lower.startsWith("departamento:")) return MENTION_COLORS.department;
  if (lower.startsWith("status:")) return MENTION_COLORS.status;
  if (lower.startsWith("etiqueta:")) return MENTION_COLORS.tag;
  if (lower.startsWith("responsavel:")) return MENTION_COLORS.responsible;
  if (lower.startsWith("template:")) return MENTION_COLORS.template;
  if (lower.includes("evento")) return MENTION_COLORS.calendar;
  // Data fields (empresa, cliente, etc.)
  if (lower.startsWith("empresa:") || lower.startsWith("cliente:")) return MENTION_COLORS.data;
  // Default: tools (actions)
  return MENTION_COLORS.tool;
}

interface ParsedPart {
  type: "text" | "mention";
  content: string;
}

function parseValueToParts(value: string): ParsedPart[] {
  if (!value) return [];

  const result: ParsedPart[] = [];
  let lastIndex = 0;

  const regex = new RegExp(MENTION_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: "text", content: value.slice(lastIndex, match.index) });
    }
    result.push({ type: "mention", content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    result.push({ type: "text", content: value.slice(lastIndex) });
  }

  return result;
}

function isTextNode(node: Node | null): node is Text {
  return Boolean(node && node.nodeType === Node.TEXT_NODE);
}

function isHTMLElement(node: Node | null): node is HTMLElement {
  return Boolean(node && node.nodeType === Node.ELEMENT_NODE);
}

function getClosestMentionBadge(node: Node | null): HTMLElement | null {
  if (!node) return null;
  if (isHTMLElement(node) && node.dataset.mention) return node;
  if (isHTMLElement(node) && node.closest) {
    const el = node.closest("[data-mention]");
    return (el as HTMLElement) || null;
  }
  return null;
}

export function MentionEditor({
  value,
  onChange,
  placeholder,
  maxLength,
  className,
  departments = [],
  statuses = [],
  tags = [],
  templates = [],
  teamMembers = [],
  aiAgents = [],
  lawFirm,
}: MentionEditorProps) {
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const mentionPickerRef = useRef<HTMLDivElement>(null);

  const isComposingRef = useRef(false);
  const triggerRangeRef = useRef<Range | null>(null);
  const editingBadgeRef = useRef<HTMLElement | null>(null);
  const lastSyncedValueRef = useRef<string>("");

  const parts = useMemo(() => parseValueToParts(value), [value]);

  const createMentionBadge = useCallback((fullMention: string): HTMLElement => {
    // fullMention must include '@'
    const mentionText = fullMention.startsWith("@") ? fullMention.slice(1) : fullMention;

    const badge = document.createElement("span");
    badge.setAttribute("contenteditable", "false");
    badge.dataset.mention = fullMention.startsWith("@") ? fullMention : `@${fullMention}`;

    badge.className = cn(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-semibold mx-0.5 align-baseline",
      "select-none cursor-pointer",
      getMentionColor(mentionText)
    );

    const label = document.createElement("span");
    label.textContent = badge.dataset.mention;
    label.className = "leading-none";

    const remove = document.createElement("span");
    remove.textContent = "×";
    remove.dataset.removeMention = "true";
    remove.className = cn(
      "ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-sm font-bold",
      "opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
    );

    badge.appendChild(label);
    badge.appendChild(remove);

    return badge;
  }, []);

  const renderFromValue = useCallback(
    (nextValue: string) => {
      if (!inputRef.current) return;

      // Replace DOM entirely (only for external changes / initial mount)
      inputRef.current.innerHTML = "";

      if (!nextValue) {
        // Keep truly empty to allow placeholder styles
        return;
      }

      const parsed = parseValueToParts(nextValue);
      parsed.forEach((p) => {
        if (p.type === "mention") {
          inputRef.current!.appendChild(createMentionBadge(p.content));
        } else {
          inputRef.current!.appendChild(document.createTextNode(p.content));
        }
      });
    },
    [createMentionBadge]
  );

  const getPlainText = useCallback(() => {
    if (!inputRef.current) return "";

    let out = "";

    const walk = (node: Node) => {
      if (isTextNode(node)) {
        out += node.textContent || "";
        return;
      }

      if (!isHTMLElement(node)) return;

      // Mention badge
      if (node.dataset.mention) {
        out += node.dataset.mention;
        return;
      }

      if (node.tagName === "BR") {
        out += "\n";
        return;
      }

      node.childNodes.forEach(walk);

      // Convert block elements to newline separators
      if (node.tagName === "DIV" || node.tagName === "P") {
        out += "\n";
      }
    };

    inputRef.current.childNodes.forEach(walk);

    // Normalize: remove trailing spaces before newlines, collapse excessive newlines
    return out
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\n+$/, "");
  }, []);

  const syncValueUp = useCallback(() => {
    const next = getPlainText();
    lastSyncedValueRef.current = next;
    onChange(next);
  }, [getPlainText, onChange]);

  const setCaretAfterNode = useCallback((node: Node) => {
    const sel = window.getSelection();
    if (!sel) return;

    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }, []);

  const setCaretInTextNode = useCallback((node: Text, offset: number) => {
    const sel = window.getSelection();
    if (!sel) return;

    const r = document.createRange();
    const len = node.textContent?.length ?? 0;
    const safeOffset = Math.max(0, Math.min(offset, len));
    r.setStart(node, safeOffset);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }, []);

  const ensureTrailingSpace = useCallback((badge: HTMLElement) => {
    const next = badge.nextSibling;
    if (isTextNode(next)) {
      if (!next.textContent?.startsWith(" ")) {
        next.textContent = ` ${next.textContent || ""}`;
      }
      return next;
    }

    const space = document.createTextNode(" ");
    badge.after(space);
    return space;
  }, []);

  const updateMentionBadge = useCallback((badge: HTMLElement, mention: string) => {
    const full = mention.startsWith("@") ? mention : `@${mention}`;
    badge.dataset.mention = full;

    const mentionText = full.slice(1);

    // Update label (first child)
    const label = badge.firstChild;
    if (label && isTextNode(label)) {
      label.textContent = full;
    } else if (label && isHTMLElement(label)) {
      label.textContent = full;
    }

    // Re-apply classes (keep remove styles)
    badge.className = cn(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-semibold mx-0.5 align-baseline",
      "select-none cursor-pointer",
      getMentionColor(mentionText)
    );

    // Keep remove icon styles
    const remove = badge.querySelector("[data-remove-mention='true']") as HTMLElement | null;
    if (remove) {
      remove.className = cn(
        "ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded",
        "text-foreground/70 hover:bg-foreground/10 hover:text-foreground"
      );
    }
  }, []);

  const openPickerForBadge = useCallback(
    (badge: HTMLElement) => {
      editingBadgeRef.current = badge;
      triggerRangeRef.current = null;
      setMentionFilter("");
      setShowMentionPicker(true);

      // Keep caret right after the badge (inside the trailing space node)
      const space = ensureTrailingSpace(badge);
      setCaretInTextNode(space, Math.min(1, space.textContent?.length ?? 0));
    },
    [ensureTrailingSpace, setCaretInTextNode]
  );

  const closePicker = useCallback(() => {
    setShowMentionPicker(false);
    setMentionFilter("");
    triggerRangeRef.current = null;
    editingBadgeRef.current = null;
  }, []);

  const updatePickerFromCaret = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      closePicker();
      return;
    }

    const range = sel.getRangeAt(0);

    // If caret is inside/near a mention badge, do not open picker by typing.
    if (getClosestMentionBadge(range.startContainer)) {
      closePicker();
      return;
    }

    // Resolve caret to a Text node + offset (contenteditable can report Element nodes)
    let containerNode: Node = range.startContainer;
    let cursorOffset = range.startOffset;

    let textNode: Text | null = null;
    let textOffset = 0;

    if (isTextNode(containerNode)) {
      textNode = containerNode;
      textOffset = cursorOffset;
    } else if (isHTMLElement(containerNode)) {
      const el = containerNode;
      const i = cursorOffset;
      const before = i > 0 ? el.childNodes[i - 1] : null;
      const at = i < el.childNodes.length ? el.childNodes[i] : null;

      if (isTextNode(at)) {
        textNode = at;
        textOffset = 0;
      } else if (isTextNode(before)) {
        textNode = before;
        textOffset = before.textContent?.length ?? 0;
      } else {
        closePicker();
        return;
      }
    } else {
      closePicker();
      return;
    }

    const text = textNode.textContent || "";
    const cursor = textOffset;
    const beforeText = text.slice(0, cursor);
    const at = beforeText.lastIndexOf("@");

    if (at === -1) {
      closePicker();
      return;
    }

    const afterAt = beforeText.slice(at + 1);

    // Must be same token: stop on whitespace/newline
    if (/[\s\n]/.test(afterAt)) {
      closePicker();
      return;
    }

    // Build a trigger range from '@' to caret
    const triggerRange = document.createRange();
    triggerRange.setStart(textNode, at);
    triggerRange.setEnd(textNode, cursor);

    triggerRangeRef.current = triggerRange;
    editingBadgeRef.current = null;

    setShowMentionPicker(true);
    setMentionFilter(afterAt);
  }, [closePicker]);


  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;

    // Keep parent value in sync
    syncValueUp();

    // Update picker state from caret
    updatePickerFromCaret();

    // Enforce maxLength (soft) by trimming, only if needed
    if (maxLength && inputRef.current) {
      const plain = getPlainText();
      if (plain.length > maxLength) {
        // Trim the last inserted chars by re-rendering from trimmed value (rare path)
        const trimmed = plain.slice(0, maxLength);
        renderFromValue(trimmed);
        lastSyncedValueRef.current = trimmed;
        onChange(trimmed);
      }
    }
  }, [getPlainText, maxLength, onChange, renderFromValue, syncValueUp, updatePickerFromCaret]);

  const handleSelectMention = useCallback(
    (mention: string) => {
      if (!inputRef.current) return;

      const full = mention.startsWith("@") ? mention : `@${mention}`;

      // Editing an existing badge
      if (editingBadgeRef.current) {
        updateMentionBadge(editingBadgeRef.current, full);
        const space = ensureTrailingSpace(editingBadgeRef.current);
        setCaretInTextNode(space, Math.min(1, space.textContent?.length ?? 0));
        closePicker();
        setTimeout(syncValueUp, 0);
        inputRef.current.focus();
        return;
      }

      const sel = window.getSelection();
      if (!sel) return;

      const targetRange = triggerRangeRef.current || (sel.rangeCount ? sel.getRangeAt(0) : null);
      if (!targetRange) return;

      // Delete the "@..." trigger text
      targetRange.deleteContents();

      // Create and insert badge
      const badge = createMentionBadge(full);
      targetRange.insertNode(badge);

      // Ensure there's a space AFTER the badge for the caret
      // First check if there's already a text node after
      let spaceNode: Text;
      const nextSibling = badge.nextSibling;

      if (isTextNode(nextSibling)) {
        // If next text node doesn't start with space, prepend one
        if (!nextSibling.textContent?.startsWith(" ")) {
          nextSibling.textContent = " " + (nextSibling.textContent || "");
        }
        spaceNode = nextSibling;
      } else {
        // Create a new text node with a space
        spaceNode = document.createTextNode(" ");
        badge.after(spaceNode);
      }

      // Position caret INSIDE the space text node, after the space character
      setCaretInTextNode(spaceNode, 1);

      closePicker();

      setTimeout(syncValueUp, 0);
      inputRef.current.focus();
    },
    [
      closePicker,
      createMentionBadge,
      ensureTrailingSpace,
      setCaretInTextNode,
      syncValueUp,
      updateMentionBadge,
    ]
  );

  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // Remove mention
      if (target?.dataset?.removeMention === "true") {
        e.preventDefault();
        e.stopPropagation();
        const badge = target.closest("[data-mention]") as HTMLElement | null;
        badge?.remove();
        closePicker();
        setTimeout(syncValueUp, 0);
        inputRef.current?.focus();
        return;
      }

      const badge = target.closest?.("[data-mention]") as HTMLElement | null;
      if (badge) {
        e.preventDefault();
        e.stopPropagation();
        openPickerForBadge(badge);
      }
    },
    [closePicker, openPickerForBadge, syncValueUp]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        closePicker();
        return;
      }

      // Backspace removes badge when caret is immediately after it
      if (e.key === "Backspace") {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const r = sel.getRangeAt(0);
        if (!r.collapsed) return;

        const container = r.startContainer;
        const offset = r.startOffset;

        // Case 1: caret is at start of a text node, check previous sibling
        if (isTextNode(container) && offset === 0) {
          const prev = container.previousSibling;
          const prevBadge = getClosestMentionBadge(prev);
          if (prevBadge) {
            e.preventDefault();
            prevBadge.remove();
            closePicker();
            setTimeout(syncValueUp, 0);
            return;
          }
        }

        // Case 2: caret is in the root element after a badge
        if (isHTMLElement(container) && container === inputRef.current && offset > 0) {
          const prev = container.childNodes[offset - 1];
          const prevBadge = getClosestMentionBadge(prev);
          if (prevBadge) {
            e.preventDefault();
            prevBadge.remove();
            closePicker();
            setTimeout(syncValueUp, 0);
          }
        }
      }
    },
    [closePicker, syncValueUp]
  );

  // Sync external value only when not focused (prevents caret jump while typing)
  useEffect(() => {
    if (!inputRef.current) return;

    // First mount
    if (lastSyncedValueRef.current === "") {
      renderFromValue(value);
      lastSyncedValueRef.current = value || "";
      return;
    }

    if (!isFocused && value !== lastSyncedValueRef.current) {
      renderFromValue(value);
      lastSyncedValueRef.current = value || "";
    }
  }, [getPlainText, isFocused, renderFromValue, value]);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (evt: MouseEvent) => {
      if (
        mentionPickerRef.current &&
        !mentionPickerRef.current.contains(evt.target as Node) &&
        editorRef.current &&
        !editorRef.current.contains(evt.target as Node)
      ) {
        closePicker();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closePicker]);

  return (
    <div ref={editorRef} className="relative h-full">
      <div
        ref={inputRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          // ensure parent is in sync when leaving the field
          setTimeout(syncValueUp, 0);
          // Do NOT close the picker here; clicking the picker would blur the editor.
          // We close it via the outside click handler instead.
        }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          handleInput();
        }}
        data-placeholder={placeholder}
        className={cn(
          "h-full w-full overflow-auto p-4 bg-background font-mono text-sm leading-relaxed rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground",
          "[&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground [&:empty]:before:pointer-events-none",
          className
        )}
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      />

      {showMentionPicker && (
        <div
          ref={mentionPickerRef}
          className="absolute z-50 top-12 left-4"
          // Prevent focus leaving the editor when clicking an option
          onMouseDown={(e) => e.preventDefault()}
        >
          <MentionPicker
            departments={departments}
            statuses={statuses}
            tags={tags}
            templates={templates}
            teamMembers={teamMembers}
            aiAgents={aiAgents}
            lawFirm={lawFirm}
            onSelect={handleSelectMention}
            filter={mentionFilter}
          />
        </div>
      )}
    </div>
  );
}
