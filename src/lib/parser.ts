/**
 * Telegram HTML export parser. Pure browser, no deps.
 *
 * Parses a list of `messages*.html` strings (read in numeric order) into a
 * flat list of Messages plus an id index for jump-links. Multi-file exports
 * are stitched together in order.
 */

import type { MediaItem, Message, MessageId } from "../types";

/* ---------- helpers ---------- */

function getClassList(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

function childWithClass(el: Element, cls: string, recursive = false): Element | null {
  for (const c of Array.from(el.children)) {
    if (getClassList(c).includes(cls)) return c;
    if (recursive) {
      const nested = childWithClass(c, cls, true);
      if (nested) return nested;
    }
  }
  return null;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

function parseMessageIdFromHref(href: string | null): MessageId | null {
  if (!href) return null;
  const m = href.match(/go_to_message(\d+)/);
  return m ? m[1] : href;
}

/* ---------- media ---------- */

function parseMedia(div: Element): MediaItem | null {
  const classes = getClassList(div);
  let kind: string | null = null;
  for (const c of classes) {
    if (c.startsWith("media_")) { kind = c.slice("media_".length); break; }
  }
  if (!kind) return null;
  const title = textOf(childWithClass(div, "title")) || undefined;
  const status = textOf(childWithClass(div, "status")) || undefined;
  const desc = textOf(childWithClass(div, "description")) || undefined;
  const link = div.querySelector("a[href]") as HTMLAnchorElement | null;
  const href = link?.getAttribute("href") ?? undefined;
  return { kind, title, status, description: desc, href };
}

/* ---------- message parsing ---------- */

function isJoined(div: Element): boolean {
  return getClassList(div).includes("joined");
}

/**
 * Walk a body element looking for the immediate-child `from_name` div.
 * Only direct children, so we don't accidentally pick up sender names from
 * nested media, forwarded bodies, or quoted text blocks.
 */
function directChildWithClass(el: Element, cls: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (getClassList(c).includes(cls)) return c;
  }
  return null;
}

function findForwardedBody(body: Element): Element | null {
  for (const c of Array.from(body.children)) {
    const cls = getClassList(c);
    if (cls.includes("forwarded") && cls.includes("body")) return c;
  }
  return null;
}

function findReplyNode(body: Element): { target: MessageId | null } | null {
  const node = directChildWithClass(body, "reply_to");
  if (!node) return null;
  const a = node.querySelector("a[href]") as HTMLAnchorElement | null;
  return { target: parseMessageIdFromHref(a?.getAttribute("href") ?? null) };
}

function findDateNode(body: Element): Element | null {
  return directChildWithClass(body, "pull_right") ?? directChildWithClass(body, "date");
}

function findTextNode(body: Element): Element | null {
  return directChildWithClass(body, "text");
}

function findMediaItems(body: Element): MediaItem[] {
  const items: MediaItem[] = [];
  // media_wrap containers (multi-media messages).
  for (const wrap of body.querySelectorAll(":scope > .media_wrap")) {
    for (const m of wrap.querySelectorAll(":scope > .media")) {
      const parsed = parseMedia(m);
      if (parsed) items.push(parsed);
    }
  }
  // direct media children.
  for (const m of body.querySelectorAll(":scope > .media")) {
    if (m.closest(".media_wrap")) continue;
    const parsed = parseMedia(m);
    if (parsed) items.push(parsed);
  }
  return items;
}

function parseMessageDiv(div: Element, prevSender: string | null): { msg: Message; sender: string | null } | null {
  const classes = getClassList(div);
  if (classes.includes("service")) return null;

  const id = (div.getAttribute("id") ?? "").startsWith("message")
    ? div.getAttribute("id")
    : null;
  const body = div.querySelector(":scope > .body");
  if (!body) return null;

  const dateNode = findDateNode(body);
  const timestamp = dateNode?.getAttribute("title")?.trim()
    || (dateNode ? textOf(dateNode) : "")
    || null;

  const fromNameNode = directChildWithClass(body, "from_name");
  let sender = textOf(fromNameNode) || null;
  const joined = isJoined(div);

  const forwardedHeader = findForwardedBody(body);
  const isForwarded = forwardedHeader !== null;
  let forwardedFrom: string | null = null;
  if (forwardedHeader) {
    const fn = directChildWithClass(forwardedHeader, "from_name");
    if (fn) {
      // Strip the inner `.date details` span (carries the original timestamp).
      const clone = fn.cloneNode(true) as Element;
      clone.querySelectorAll("span.date").forEach((s) => s.remove());
      forwardedFrom = (clone.textContent ?? "").trim() || null;
    }
  }

  const reply = findReplyNode(body);
  const replyTo = reply?.target ?? null;

  const textNode = findTextNode(body);
  let text = "";
  if (textNode) {
    text = renderHtmlToMarkdown(textNode);
  } else if (isForwarded) {
    const inner = forwardedHeader?.querySelector(":scope > .text");
    if (inner) text = renderHtmlToMarkdown(inner as Element);
  }
  text = text.trim();

  const media = findMediaItems(body);

  let finalSender = sender;
  if (!finalSender && joined) finalSender = prevSender;
  const returnedSender = sender ?? prevSender;

  return {
    msg: {
      id,
      timestamp,
      sender: finalSender,
      text,
      replyTo,
      forwardedFrom,
      isForwarded,
      media,
      joined,
    },
    sender: returnedSender,
  };
}

/* ---------- HTML → Markdown converter (scoped) ---------- */

/**
 * Lightweight HTML→Markdown for the subset of HTML Telegram uses inside
 * <div class="text"> blocks: <a>, <br>, <strong>/<b>, <em>/<i>, lists.
 * Anchor labels are buffered so we can emit [label](url) correctly even
 * when tags nest inside the anchor.
 */
class FragmentMd {
  private out: string[] = [];
  private inAnchor: { href: string; label: string } | null = null;
  private listStack: Array<"ul" | "ol"> = [];
  private listIndex: number[] = [];
  private pre = false;

  emit(text: string) {
    if (this.inAnchor) this.inAnchor.label += text;
    else this.out.push(text);
  }

  render(root: Element): string {
    this.walk(root);
    let s = this.out.join("");
    // collapse excessive blank lines
    s = s.replace(/\n{3,}/g, "\n\n");
    // trim trailing spaces on each line
    s = s.split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n");
    return s.trim();
  }

  private walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? "";
      this.emit(this.unescape(t));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;

    switch (tag) {
      case "br":
        this.emit("\n");
        return;
      case "a": {
        const href = attrs.href ?? "";
        this.inAnchor = { href, label: "" };
        for (const c of Array.from(el.childNodes)) this.walk(c);
        const { href: h, label } = this.inAnchor;
        this.inAnchor = null;
        const trimmed = label.trim();
        this.out.push(trimmed ? `[${this.unescape(trimmed)}](${h})` : h);
        return;
      }
      case "strong": case "b": this.emit("**"); this.inside(el); this.emit("**"); return;
      case "em": case "i":    this.emit("*");  this.inside(el); this.emit("*");  return;
      case "code":            this.emit("`");  this.inside(el); this.emit("`");  return;
      case "pre": {
        const wasPre = this.pre;
        this.pre = true;
        this.out.push("\n```\n");
        this.inside(el);
        this.out.push("\n```\n");
        this.pre = wasPre;
        return;
      }
      case "ul": case "ol": {
        this.listStack.push(tag);
        this.listIndex.push(0);
        this.inside(el);
        this.listStack.pop();
        this.listIndex.pop();
        this.out.push("\n");
        return;
      }
      case "li": {
        if (this.listStack.length) {
          const indent = "  ".repeat(this.listStack.length - 1);
          if (this.listStack[this.listStack.length - 1] === "ol") {
            this.listIndex[this.listIndex.length - 1] += 1;
            this.out.push(`\n${indent}${this.listIndex[this.listIndex.length - 1]}. `);
          } else {
            this.out.push(`\n${indent}- `);
          }
        }
        this.inside(el);
        return;
      }
      case "p": case "div": {
        if (this.out.length && !this.out[this.out.length - 1].endsWith("\n")) this.out.push("\n");
        this.inside(el);
        if (!this.out[this.out.length - 1].endsWith("\n")) this.out.push("\n");
        return;
      }
      default:
        this.inside(el);
    }
  }

  private inside(el: Element) {
    for (const c of Array.from(el.childNodes)) this.walk(c);
  }

  private unescape(s: string): string {
    return s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ");
  }
}

function renderHtmlToMarkdown(el: Element): string {
  return new FragmentMd().render(el);
}

/* ---------- top-level: parse one HTML file ---------- */

export interface ParseFileResult {
  messages: Message[];
  serviceEntries: { service: string }[];
}

export function parseHtml(html: string): ParseFileResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: Message[] = [];
  const serviceEntries: { service: string }[] = [];
  let currentSender: string | null = null;

  const all = doc.querySelectorAll("div.message");
  for (const div of Array.from(all)) {
    const classes = getClassList(div);
    if (classes.includes("service")) {
      const txt = textOf(div);
      if (txt) serviceEntries.push({ service: txt });
      continue;
    }
    const parsed = parseMessageDiv(div, currentSender);
    if (!parsed) continue;
    if (parsed.sender) currentSender = parsed.sender;
    out.push(parsed.msg);
  }
  return { messages: out, serviceEntries };
}

export function parseFiles(files: { name: string; html: string }[]): Message[] {
  // Sort: messages.html (no number) < messages2.html < messages10.html
  const sorted = [...files].sort((a, b) => sortKey(a.name) - sortKey(b.name));
  const out: Message[] = [];
  for (const f of sorted) {
    const { messages } = parseHtml(f.html);
    out.push(...messages);
  }
  return out;
}

function sortKey(name: string): number {
  const m = name.match(/^messages(\d+)?\.html$/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return m[1] ? parseInt(m[1], 10) : 0;
}

export function buildIdIndex(messages: Message[]): Map<string, Message> {
  const m = new Map<string, Message>();
  for (const msg of messages) {
    if (!msg.id) continue;
    m.set(msg.id, msg);
    if (msg.id.startsWith("message")) m.set(msg.id.slice("message".length), msg);
  }
  return m;
}
