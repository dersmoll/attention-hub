import { useEffect, useState, type CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  WIDGET_PREFERENCES_CHANGED_EVENT,
  normalizeWidgetPreferences,
  readWidgetPreferences,
  widgetPanelStyle,
  type WidgetPreferences,
} from "./widget-preferences";

export function useWidgetPanelStyle() {
  const [preferences, setPreferences] = useState(readWidgetPreferences);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen<Partial<WidgetPreferences>>(
      WIDGET_PREFERENCES_CHANGED_EVENT,
      ({ payload }) => {
        if (!disposed) {
          setPreferences(normalizeWidgetPreferences(payload));
        }
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  return widgetPanelStyle(preferences) as CSSProperties;
}
