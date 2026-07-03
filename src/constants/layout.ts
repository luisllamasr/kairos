/**
 * Tab stacks omit bottom — the tab bar owns that inset.
 * Keep this identical everywhere (including BootstrapScreen) so handoffs do not reflow.
 */
export const TAB_SAFE_AREA_EDGES = ['top', 'left', 'right'] as const;

/**
 * ScrollViews / FlatLists inside an inset wrapper must not also apply automatic
 * content insets on iOS — that double-applies top padding and re-measures when
 * content size changes.
 */
export const DISABLE_SCROLL_INSET_ADJUSTMENT = {
  contentInsetAdjustmentBehavior: 'never' as const,
};

/** Edges used by Screen on tab-root scroll screens (no bottom). */
export const TAB_SCREEN_EDGES = TAB_SAFE_AREA_EDGES;
