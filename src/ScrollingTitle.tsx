import { useLayoutEffect, useRef } from "react";

export default function ScrollingTitle({ title }: { title: string }) {
  const frame = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = frame.current!;
    const label = text.current!;
    const measure = () => {
      const distance = label.getBoundingClientRect().width - container.clientWidth;
      const overflows = container.clientWidth > 0 && distance > 1;
      container.toggleAttribute("data-overflow", overflows);
      if (overflows) {
        container.style.setProperty("--title-offset", `-${distance}px`);
        container.style.setProperty("--title-duration", `${3 + distance / 36}s`);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(label);
    measure();
    return () => observer.disconnect();
  }, [title]);

  return (
    <span className="scrolling-title" ref={frame}>
      <span ref={text}>{title}</span>
    </span>
  );
}
