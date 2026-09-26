/** Thin DOM helpers, so view code reads as structure rather than boilerplate. */

/**
 * Looks up an element that index.html is known to contain.
 * Throws rather than returning null: a missing id is a broken build, not a
 * runtime condition worth handling at every call site.
 */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`index.html is missing #${id}`);
  return node as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function clear<T extends HTMLElement>(node: T): T {
  node.textContent = '';
  return node;
}

export function appendAll<T extends HTMLElement>(parent: T, children: readonly HTMLElement[]): T {
  for (const child of children) parent.appendChild(child);
  return parent;
}

/** A focusable button. Everything the remote can land on is built through here. */
export function focusableButton(
  className: string,
  text: string | null,
  onActivate: () => void
): HTMLButtonElement {
  const node = el('button', className, text ?? undefined);
  node.setAttribute('data-focus', '');
  node.addEventListener('click', onActivate);
  return node;
}
