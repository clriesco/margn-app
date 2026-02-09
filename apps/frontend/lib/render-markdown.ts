export const renderMarkdown = (text: string): string => {
  const html = text
    .replace(/^#### (.+)$/gm, '<h6 style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary); margin: 1rem 0 0.5rem 0;">$1</h6>')
    .replace(/^### (.+)$/gm, '<h5 style="font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); margin: 1rem 0 0.5rem 0;">$1</h5>')
    .replace(/^## (.+)$/gm, '<h4 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem 0;">$1</h4>')
    .replace(/^# (.+)$/gm, '<h3 style="font-size: 1.125rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem 0;">$1</h3>')
    .replace(/^\*\*(\d+)\. ([^*]+)\*\*$/gm, '<h4 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem 0;">$1. $2</h4>')
    .replace(/^(\d+)\. \*\*([^*]+)\*\*$/gm, '<h4 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem 0;">$1. $2</h4>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li style="margin: 0.25rem 0;">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul style="margin: 0.5rem 0; padding-left: 1.5rem; list-style-type: disc;">${match}</ul>`)
    .replace(/\n\n+/g, '</p><p style="margin-top: 0.75rem;">')
    .replace(/\n/g, '<br/>');

  return `<div>${html}</div>`;
};
