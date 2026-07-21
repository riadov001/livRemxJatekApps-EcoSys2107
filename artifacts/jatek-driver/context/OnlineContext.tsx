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

  useEffect(() => {
    if (user?.driver) setIsOnline(user.driver.isOnline ?? false);
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

    // Invalidate React Query caches when the server pushes updates
    const off = sse.onEvent((event) => {
      if (
        event === "available_orders" ||
        event === "new_order" ||
        event === "order_assigned" ||
        event === "message"
      ) {
        queryClient.invalidateQueries({ queryKey: ["available-orders"] });
      }
      if (event === "driver_orders" || event === "order_status") {
        queryClient.invalidateQueries({ queryKey: ["my-orders"] });
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
      const msg = e instanceof Error ? e.message : "Erreur de connexion";
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
