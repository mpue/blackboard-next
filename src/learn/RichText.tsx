// Renders the small markdown subset of lesson texts: paragraphs (blank
// lines), "- " bullet lists, **bold**, *italic*, `code` and $formulas$.

import { Fragment, type ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\$[^$]+\$)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="rounded bg-panel-2 px-1 font-mono text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return (
        <span key={i} className="whitespace-nowrap rounded bg-accent-soft px-1 font-serif italic text-accent">
          {formula(part.slice(1, -1))}
        </span>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** A few LaTeX-ish shorthands so formulas read naturally. */
function formula(f: string): string {
  return f
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\pi/g, 'π')
    .replace(/\\tau/g, 'τ')
    .replace(/\\Omega/g, 'Ω')
    .replace(/\\approx/g, '≈')
    .replace(/\\sqrt/g, '√')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\mu/g, 'µ')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/_\{([^}]*)\}/g, '$1')
    .replace(/_(\w)/g, '$1')
    .replace(/[{}]/g, '');
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*-\s+/.test(l))) {
          return (
            <ul key={i} className="my-1.5 list-disc space-y-0.5 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*-\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="my-1.5 first:mt-0 last:mb-0">
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
