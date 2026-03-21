import { Route, Routes } from 'react-router-dom';

import ChatApp from '../../products/chat/renderer/App';

function ProductPlaceholder(
  { title, note }: { title: string; note: string },
) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 24px',
        background: 'var(--app-bg, #0f172a)',
      }}
    >
      <section
        style={{
          width: 'min(640px, 100%)',
          borderRadius: 24,
          padding: 32,
          background: 'var(--surface, rgba(15, 23, 42, 0.88))',
          color: 'var(--text-primary, #e2e8f0)',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.25)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--accent, #38bdf8)',
          }}
        >
          {title}
        </p>
        <h1 style={{ margin: '12px 0 0', fontSize: 32 }}>{title}</h1>
        <p style={{ margin: '16px 0 0', lineHeight: 1.6, color: 'var(--text-muted, #94a3b8)' }}>
          {note}
        </p>
      </section>
    </div>
  );
}

export default function SuiteApp() {
  return (
    <Routes>
      <Route
        path="/work/*"
        element={
          <ProductPlaceholder
            title="Cats Work"
            note="Cats Work now has a dedicated suite slot, but its UI surface is still a placeholder in this refactor slice."
          />
        }
      />
      <Route
        path="/code/*"
        element={
          <ProductPlaceholder
            title="Cats Code"
            note="Cats Code now has a dedicated suite slot, but its UI surface is still a placeholder in this refactor slice."
          />
        }
      />
      <Route path="*" element={<ChatApp />} />
    </Routes>
  );
}
