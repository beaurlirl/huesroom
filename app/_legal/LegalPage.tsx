import Link from "next/link";
import type { ReactNode } from "react";
import { GAME_NAME, SUPPORT_EMAIL, UPDATED } from "./contact";

/** A plain, readable page in the game's own look (Union, hairlines, black on white) for the privacy and support URLs. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-white" style={{ touchAction: "pan-y", userSelect: "text", WebkitUserSelect: "text" }}>
      <article className="mx-auto max-w-2xl px-6 pb-24 pt-12 text-[15px] leading-relaxed" style={{ fontFamily: "var(--ui-font)" }}>
        <Link href="/" className="ui text-xs tracking-wide" style={{ color: "var(--muted)" }}>
          (back to the game)
        </Link>
        <h1 className="ui mt-8 text-5xl font-bold leading-[0.9] sm:text-6xl">{title}</h1>
        <p className="ui mt-3 text-xs" style={{ color: "var(--muted)" }}>
          {GAME_NAME} · updated {UPDATED}
        </p>
        <div className="mt-8 border-t" style={{ borderColor: "var(--glass-edge)" }} />
        {children}
      </article>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="ui text-sm font-bold tracking-wide">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

/** The contact line. Shows a visible placeholder until SUPPORT_EMAIL is set, so an unfinished page cannot pass for a finished one. */
export function Contact() {
  return SUPPORT_EMAIL ? (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
      {SUPPORT_EMAIL}
    </a>
  ) : (
    <span className="bg-yellow-200 px-1">[support email to be added]</span>
  );
}
