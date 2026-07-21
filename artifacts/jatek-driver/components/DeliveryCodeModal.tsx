import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

// Backend may use 4-digit or 6-digit codes — accept 4–6 digits.
const CODE_MIN = 4;
const CODE_MAX = 6;

interface Props {
  visible: boolean;
  loading?: boolean;
  expectedLength?: number; // optional hint from order data (4 or 6)
  onCancel: () => void;
  onSubmit: (code: string) => void;
}

export function DeliveryCodeModal({ visible, loading, expectedLength, onCancel, onSubmit }: Props) {
  const colors = useColors();
  const [code, setCode] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Determine the exact length to validate against.
  // If `expectedLength` is provided and in range, use it.
  // Otherwise accept anything between CODE_MIN and CODE_MAX digits.
  const exactLen = expectedLength && expectedLength >= CODE_MIN && expectedLength <= CODE_MAX
    ? expectedLength
    : null;
  const isValid = exactLen ? code.length === exactLen : code.length >= CODE_MIN && code.length <= CODE_MAX;

  useEffect(() => {
    if (visible) {
      setCode("");
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const hint = exactLen
    ? `${exactLen} chiffres`
    : `${CODE_MIN} à ${CODE_MAX} chiffres`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderRadius: colors.radius * 1.5 }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
            <Feather name="check-circle" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Code de livraison
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Demandez le code à {hint} affiché sur l'application du client.
          </Text>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, CODE_MAX))}
            keyboardType="number-pad"
            maxLength={CODE_MAX}
            placeholder={exactLen ? "_ ".repeat(exactLen).trim() : "_ _ _ _"}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, {
              color: colors.foreground,
              backgroundColor: colors.muted,
              borderColor: isValid ? colors.primary : colors.border,
              borderRadius: colors.radius,
              fontFamily: "Inter_700Bold",
            }]}
          />
          <View style={styles.row}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.cancel, { borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={() => onSubmit(code)}
              disabled={loading || !isValid}
              style={({ pressed }) => [styles.confirm, {
                backgroundColor: isValid ? colors.primary : colors.muted,
                borderRadius: colors.radius,
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={{ color: isValid ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_700Bold" }}>
                  Confirmer
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 380, padding: 22, alignItems: "center" },
  iconWrap: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, marginBottom: 14 },
  title: { fontSize: 18, marginBottom: 6 },
  subtitle: { fontSize: 13, textAlign: "center", marginBottom: 18 },
  input: { width: "100%", height: 64, fontSize: 30, letterSpacing: 12, textAlign: "center", paddingHorizontal: 16, borderWidth: 2, marginBottom: 4 },
  row: { flexDirection: "row", gap: 10, marginTop: 18, alignSelf: "stretch" },
  cancel: { flex: 1, height: 48, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  confirm: { flex: 2, height: 48, alignItems: "center", justifyContent: "center" },
});
