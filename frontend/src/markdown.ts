import DOMPurify from "dompurify";
import { Marked } from "marked";

const marked = new Marked({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(source: string): string {
  const rawHtml = marked.parse(source) as string;
  return DOMPurify.sanitize(rawHtml);
}
