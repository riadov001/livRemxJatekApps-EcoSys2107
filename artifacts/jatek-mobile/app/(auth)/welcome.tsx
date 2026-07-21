import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const handleLogin = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push("/(auth)/login");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Top branding area */}
      <View style={styles.top}>
        <View style={[styles.logoWrap, { backgroundColor: colors.card, shadowColor: colors.primary }]}>
          <Image
            source={require("../../assets/images/jatek-logo.png")}
            style={{ width: 64, height: 64 }}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.brand, { color: colors.heading }]}>
          Jatek<Text style={{ color: colors.primary }}>.</Text>
        </Text>
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Espace livreur
        </Text>
      </View>

      {/* Illustration / feature list */}
      <View style={styles.features}>
        {[
          { icon: "navigate-circle-outline", label: "Suivi GPS en temps réel" },
          { icon: "wallet-outline",          label: "Gains quotidiens transparents" },
          { icon: "time-outline",            label: "Horaires flexibles" },
        ].map(({ icon, label }) => (
          <View key={label} style={[styles.featureRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.featureIcon, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name={icon as any} size={22} color={colors.primary} />
            </View>
            <Text style={[styles.featureLabel, { color: colors.foreground }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <View style={styles.bottom}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={handleLogin}
          activeOpacity={0.85}
        >
          <Ionicons name="log-in-outline" size={20} color="#fff" />
          <Text style={styles.btnText}>Se connecter</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Connectez-vous avec votre numéro WhatsApp ou votre email
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },

  top: { alignItems: "center", paddingTop: 48, gap: 12 },
  logoWrap: {
    width: 96, height: 96, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
  brand: { fontSize: 36, fontFamily: "Inter_900Black", letterSpacing: -1, fontStyle: "italic" },
  tagline: { fontSize: 15, fontFamily: "Inter_500Medium", letterSpacing: 0.2 },

  features: { gap: 12 },
  featureRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, borderRadius: 16, borderWidth: 1,
  },
  featureIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  featureLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },

  bottom: { gap: 14, paddingBottom: 16 },
  btn: {
    height: 56, borderRadius: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: "#E91E8C", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 7,
  },
  btnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  hint: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
