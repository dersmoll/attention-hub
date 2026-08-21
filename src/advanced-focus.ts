export const ADVANCED_FOCUS_EVENT = "advanced-focus-requested";
export const ADVANCED_FOCUS_QUERY = "advancedFocus";

export type AdvancedFocusTarget = "work-calendar";

export interface AdvancedFocusRequest {
  target: AdvancedFocusTarget;
}

export function advancedWindowUrl(target?: AdvancedFocusTarget) {
  if (!target) {
    return "/";
  }

  return `/?${new URLSearchParams({ [ADVANCED_FOCUS_QUERY]: target })}`;
}

export function readAdvancedFocusTarget(
  search: string,
): AdvancedFocusTarget | null {
  return new URLSearchParams(search).get(ADVANCED_FOCUS_QUERY) ===
    "work-calendar"
    ? "work-calendar"
    : null;
}
