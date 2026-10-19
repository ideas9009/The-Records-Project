import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
const boardPages = [
  { label: "Tasks", route: "jobs", key: "task" },
  { label: "Material Requests", route: "jobs:materials", key: "materials" },
  { label: "Available", route: "jobs:available", key: "available" },
];
export function boardSliderPosition(
  clientX: number,
  left: number,
  width: number,
  count = 3,
) {
  if (width <= 0) return 0;
  return Math.max(
    0,
    Math.min(count - 1, ((clientX - left) / width) * count - 0.5),
  );
}
export default function BoardPageSlider({
  selected,
  go,
  pages = boardPages,
  label = "Task Board pages",
}: {
  selected: string;
  go: (page: string) => void;
  pages?: readonly { label: string; route: string; key: string }[];
  label?: string;
}) {
  const active = Math.max(
    0,
    pages.findIndex((page) => page.key === selected),
  );
  const [position, setPosition] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null),
    pointer = useRef<number | null>(null);
  function select(index: number) {
    root.current?.querySelectorAll<HTMLButtonElement>("button")[index]?.focus();
    go(pages[index].route);
  }
  function at(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return boardSliderPosition(
      event.clientX,
      rect.left,
      rect.width,
      pages.length,
    );
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || pointer.current !== null) return;
    event.preventDefault();
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPosition(at(event));
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current === event.pointerId) setPosition(at(event));
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== event.pointerId) return;
    const index = Math.round(at(event));
    pointer.current = null;
    setPosition(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    select(index);
  }
  function cancel() {
    pointer.current = null;
    setPosition(null);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (active + 1) % pages.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (active + pages.length - 1) % pages.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = pages.length - 1;
    else return;
    event.preventDefault();
    select(next);
  }
  return (
    <div
      ref={root}
      className="board-page-slider"
      role="radiogroup"
      aria-label={label}
      data-dragging={position !== null ? "true" : undefined}
      style={
        {
          "--slider-position": position ?? active,
          "--slider-count": pages.length,
        } as CSSProperties
      }
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={keyboard}
    >
      <span className="board-page-slider-thumb" aria-hidden="true" />
      {pages.map((page, index) => (
        <button
          type="button"
          role="radio"
          aria-checked={active === index}
          tabIndex={active === index ? 0 : -1}
          key={page.key}
          onClick={(event) => {
            if (event.detail === 0) select(index);
          }}
        >
          {page.label}
        </button>
      ))}
    </div>
  );
}
