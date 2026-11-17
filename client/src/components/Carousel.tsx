import { useEffect, useRef, type ReactNode, type TouchEvent, type WheelEvent } from "react";
import { swipeTarget } from "../phone";

export interface Slide {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  slides: Slide[];
  current: string;
  onChange: (id: string) => void;
  label: string;
}

/** A sideways two-finger swipe on a trackpad this far (in pixels) goes to the next slide. */
const WHEEL_STEP = 90;
/** Quiet time that ends a trackpad swipe, so one swipe moves one slide. */
const WHEEL_IDLE_MS = 250;

/**
 * Slides side by side in the desktop's left column, as on a phone: tabs and ‹ › buttons above
 * them, and a sideways swipe (a finger, or two on a trackpad) goes to the next or the previous
 * one. Each slide fills the column and scrolls on its own, so switching slides, or what a slide
 * shows changing, never moves anything around it.
 */
export function Carousel({ slides, current, onChange, label }: Props) {
  const ids = slides.map((s) => s.id);
  const index = Math.max(0, ids.indexOf(current));
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const wheel = useRef<{ dx: number; done: boolean; timer: number } | null>(null);

  // Slides out of view can't be reached with Tab or by a screen reader.
  useEffect(() => {
    slideRefs.current.forEach((slide, i) => {
      if (slide) slide.inert = i !== index;
    });
  }, [index, slides.length]);

  useEffect(() => () => clearTimeout(wheel.current?.timer), []);

  const go = (step: number) => {
    const next = ids[index + step];
    if (next) onChange(next);
  };

  const onTouchStart = (event: TouchEvent) => {
    const target = event.target as HTMLElement;
    const point = event.touches[0];
    touch.current =
      event.touches.length === 1 && !target.closest("input, textarea, select, [data-no-swipe]")
        ? { x: point.clientX, y: point.clientY }
        : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const from = touch.current;
    touch.current = null;
    const point = event.changedTouches[0];
    if (!from || !point) return;
    const target = swipeTarget(ids, ids[index], point.clientX - from.x, point.clientY - from.y);
    if (target) onChange(target);
  };

  // A trackpad's sideways swipe arrives as wheel events: add them up until one slide's worth,
  // then wait for the swipe to end before another.
  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const state = wheel.current ?? { dx: 0, done: false, timer: 0 };
    clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      wheel.current = null;
    }, WHEEL_IDLE_MS);
    wheel.current = state;
    if (state.done) return;
    state.dx += event.deltaX;
    if (Math.abs(state.dx) >= WHEEL_STEP) {
      state.done = true;
      go(state.dx > 0 ? 1 : -1);
    }
  };

  return (
    <section className="carousel" aria-roledescription="carousel" aria-label={label}>
      <div className="carousel-head">
        <button className="carousel-arrow" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous panel">
          <Chevron left />
        </button>
        <div className="carousel-tabs" role="tablist" aria-label={label}>
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              role="tab"
              aria-selected={i === index}
              className={i === index ? "on" : ""}
              onClick={() => onChange(slide.id)}
            >
              {slide.label}
            </button>
          ))}
        </div>
        <button
          className="carousel-arrow"
          onClick={() => go(1)}
          disabled={index === slides.length - 1}
          aria-label="Next panel"
        >
          <Chevron />
        </button>
      </div>
      <div className="carousel-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onWheel={onWheel}>
        <div className="carousel-track" style={{ transform: `translateX(${-index * 100}%)` }}>
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              ref={(element) => {
                slideRefs.current[i] = element;
              }}
              className={`carousel-slide carousel-slide-${slide.id}`}
              role="tabpanel"
              aria-label={slide.label}
            >
              {slide.content}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Chevron({ left = false }: { left?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={left ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
