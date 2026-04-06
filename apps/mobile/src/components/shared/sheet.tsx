import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetModalProps,
} from "@gorhom/bottom-sheet";
import { useBottomSpacing } from "@/lib/safe-area";

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
  const ref = useRef<BottomSheetModal>(null);
  const bottomSpacing = useBottomSpacing();

  useEffect(() => {
    ref.current?.present();
  }, []);

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onDismiss}
      enablePanDownToClose
      enableDynamicSizing
      backgroundStyle={{
        backgroundColor: "#171717",
        borderRadius: 20,
      }}
      handleIndicatorStyle={{
        backgroundColor: "#52525b",
        width: 36,
        height: 5,
      }}
      {...props}
      backdropComponent={(backdropProps) => (
        <BottomSheetBackdrop
          {...backdropProps}
          enableTouchThrough={false}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          style={[
            { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
            StyleSheet.absoluteFillObject,
          ]}
        />
      )}
    >
      {scrollable ? (
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 0,
          }}
        >
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView
          style={{
            paddingHorizontal: 20,
            paddingBottom: 0,
          }}
        >
          {children}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
};
