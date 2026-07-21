import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { driverHeartbeat, setDriverOnline } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { getApiTarget, getBaseUrl } from "@/lib/apiTarget";
import {
  requestLocationPermissions,
  startOnlineTracking,
  stopLocationTracking,
} from "@/services/locationService";
import { getDriverLocationClient } from "@/services/wsClient";
import { getDriverSseClient } from "@/services/sseClient";
import { useAuth } from "./AuthContext";
import { useActiveOrder } from "./ActiveOrderContext";

/** How often to ping the backend watchdog while online (must be < 30s server timeout). */
const HEARTBEAT_INTERVAL_MS = 20_000;

type OnlineState = {
  isOnline: boolean;
  toggling: boolean;
  toggleOnline: () => Promise<void>;
};

const OnlineCtx = createContext<OnlineState | undefined>(undefined);

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { trackingActive } = useActiveOrder();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(user?.driver?.isOnline ?? false);
  const [toggling, setToggling] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track whether we've attempted to resume location on this session already
  const locationResumed = useRef(false);

  useEffect(() => {
    if (!user?.driver) return;
    const online = user.driver.isOnline ?? false;
    setIsOnline(online);

    // If the driver was already online when the app started (e.g. after a
    // background kill), restart the foreground location watcher so the REST
    // PATCH /location keeps flowing — without requiring a manual toggle.
    if (online && !locationResumed.current) {
      locationResumed.current = true;
      startOnlineTracking().catch((e) =>
        console.warn("[online] auto-resume location failed", e),
      );
    }
  }, [user?.driver?.isOnline]);

  // ── SSE — connect when online, disconnect when offline ───────────────
  useEffect(() => {
    const sse = getDriverSseClient();

    if (!isOnline || !user?.driver?.id) {
      sse.disconnect();
      return;
    }

    const driverId = user.driver.id;

    (async () => {
      try {
        const [target, token] = await Promise.all([getApiTarget(), getToken()]);
        const base = getBaseUrl(target);
        const channels = `available_orders,driver:${driverId},driver_orders:${driverId}`;
        const url = `${base}/events?channels=${encodeURIComponent(channels)}`;
        sse.connect(url, token ?? "");
      } catch (e) {
        console.warn("[SSE] connect error", e);
      }
    })();

    // Invalidate React Query caches when the server pushes updates.
    // When the payload carries an orderId we can do a targeted invalidation
    // instead of blowing out the whole list.
    const off = sse.onEvent((event, data) => {
      const payload = data && typeof data === "object" ? data as Record<string, unknown> : null;
      const orderId = payload?.orderId ?? payload?.order_id ?? payload?.id;

      if (
        event === "available_orders" ||
        event === "new_order" ||
        event === "message"
      ) {
        queryClient.invalidateQueries({ queryKey: ["available-orders"] });
      }

      if (event === "order_assigned") {
        // Remove the assigned order from the available list immediately
        queryClient.invalidateQueries({ queryKey: ["available-orders"] });
        if (orderId) {
          queryClient.invalidateQueries({ queryKey: ["order", String(orderId)] });
        }
      }

      if (event === "driver_orders" || event === "order_status" || event === "order_updated") {
        queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        if (orderId) {
          queryClient.invalidateQueries({ queryKey: ["order", String(orderId)] });
        }
      }

      if (event === "order_cancelled" || event === "order_delivered") {
        queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        queryClient.invalidateQueries({ queryKey: ["earnings"] });
        if (orderId) {
          queryClient.invalidateQueries({ queryKey: ["order", String(orderId)] });
        }
      }
    });

    return () => {
      off();
      sse.disconnect();
    };
  }, [isOnline, user?.driver?.id]);

  // ── Heartbeat — keep driver online while GPS updates may be sparse ───
  useEffect(() => {
    if (!isOnline || !user?.driver?.id) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    const driverId = user.driver.id;

    heartbeatRef.current = setInterval(() => {
      driverHeartbeat(driverId).catch((e) =>
        console.warn("[heartbeat] failed", e),
      );
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [isOnline, user?.driver?.id]);

  // ── Toggle online / offline ──────────────────────────────────────────
  const toggleOnline = useCallback(async () => {
    if (toggling) return;
    if (trackingActive) {
      Alert.alert(
        "Course en cours",
        "Vous ne pouvez pas passer hors ligne pendant une course active.",
      );
      return;
    }
    const next = !isOnline;
    setToggling(true);
    try {
      if (next) {
        const perm = await requestLocationPermissions();
        if (!perm.granted) {
          Alert.alert(
            "Permission requise",
            perm.message ?? "La localisation est nécessaire pour recevoir des courses.",
          );
          return;
        }
        await setDriverOnline(true);
        setIsOnline(true);
        try {
          await startOnlineTracking();
          getDriverLocationClient().connect().catch(() => {});
        } catch (e) {
          console.warn("[online] location start failed", e);
        }
      } else {
        await setDriverOnline(false);
        setIsOnline(false);
        try {
          await stopLocationTracking();
          getDriverLocationClient().close();
        } catch (e) {
          console.warn("[online] location stop failed", e);
        }
      }
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : "Erreur de connexion";
      Alert.alert("Erreur", msg);
    } finally {
      setToggling(false);
    }
  }, [isOnline, toggling, trackingActive]);

  const value = useMemo<OnlineState>(
    () => ({ isOnline, toggling, toggleOnline }),
    [isOnline, toggling, toggleOnline],
  );

  return <OnlineCtx.Provider value={value}>{children}</OnlineCtx.Provider>;
}

export function useOnline(): OnlineState {
  const ctx = useContext(OnlineCtx);
  if (!ctx) throw new Error("useOnline must be used within OnlineProvider");
  return ctx;
}
