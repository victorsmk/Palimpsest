import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

// Minimal render helpers on react-dom + act. @testing-library/react would also need
// @testing-library/dom, which this project does not depend on.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Renders an element into a detached container (jsdom environment required). */
export function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    rerender: (next: ReactElement) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export function renderHook<Result, Props>(hook: (props: Props) => Result, initialProps: Props) {
  const result = { current: undefined as unknown as Result };
  function Probe({ hookProps }: { hookProps: Props }) {
    result.current = hook(hookProps);
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  const renderWith = (props: Props) =>
    act(() => root.render(createElement(Probe, { hookProps: props })));
  renderWith(initialProps);
  return { result, rerender: renderWith };
}

export function click(element: Element | null | undefined) {
  if (!element) throw new Error('click(): element not found');
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
