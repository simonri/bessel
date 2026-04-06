import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import {
  BottomSheetModal,
  BottomSheetModalProps,
  BottomSheetBackdrop as GorhomBottomSheetBackdrop,
  BottomSheetScrollView as GorhomBottomSheetScrollView,
  BottomSheetView as GorhomBottomSheetView,
} from '@gorhom/bottom-sheet'
import { useTheme } from "@/design-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface BottomSheetProps
  extends React.PropsWithChildren,
    Omit<BottomSheetModalProps, "children"> {
  onDismiss?: () => void;
  scrollable?: boolean;
}

export const BottomSheet = ({
  children,
  onDismiss,
  scrollable = true,
  ...props
}: BottomSheetProps) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const theme = useTheme();

  const safeViewInsets = useSafeAreaInsets();

  useEffect(() => {
    bottomSheetRef.current?.present();
  }, []);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      onDismiss={onDismiss}
      enablePanDownToClose
      enableDynamicSizing
      backgroundStyle={{
        backgroundColor: "#171717",
        borderRadius: theme.borderRadii["border-radius-24"],
      }}
      handleIndicatorStyle={{
        backgroundColor: "#52525b",
      }}
      {...props}
      backdropComponent={(backdropProps) => (
        <GorhomBottomSheetBackdrop
          {...backdropProps}
          enableTouchThrough={false}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          style={[
            { flex: 1, backgroundColor: theme.colors.overlay },
            StyleSheet.absoluteFill,
          ]}
        />
      )}
    >
      {scrollable ? (
        <GorhomBottomSheetScrollView
          contentContainerStyle={{
            flex: 1,
            padding: theme.spacing["spacing-4"],
            paddingBottom: safeViewInsets.bottom,
          }}
        >
          {children}
        </GorhomBottomSheetScrollView>
      ) : (
        <GorhomBottomSheetView
          style={{
            flex: 1,
            padding: theme.spacing["spacing-4"],
            paddingBottom: safeViewInsets.bottom,
          }}
        >
          {children}
        </GorhomBottomSheetView>
      )}
    </BottomSheetModal>
  );
};
