"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HomeScrollReset() {
  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const shouldReset = navigation?.type === "reload" || window.location.hash === "#events";
    if (shouldReset) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
      window.scrollTo(0, 0);
      const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
      return () => {
        window.cancelAnimationFrame(frame);
        window.history.scrollRestoration = previousScrollRestoration;
      };
    }

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  return null;
}

export function EventSectionButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.setAttribute("data-scroll-ready", "true");
  }, []);

  function handleClick() {
    const section = document.getElementById("events");
    if (!section) return;

    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button ref={buttonRef} className={className} data-scroll-ready="false" type="button" onClick={handleClick}>
      {children}
    </button>
  );
}
