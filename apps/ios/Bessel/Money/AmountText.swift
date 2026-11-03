import SwiftUI

/// An amount that blurs while amounts are hidden. Every amount on the money
/// pages goes through this, so hiding them can't miss one.
struct AmountText: View {
    let minor: Int
    var currency = "SEK"
    var compact = false
    var sign = false
    var exact = false

    @AppStorage(Preferences.hideAmountsKey) private var isHidden = false

    var body: some View {
        let text = MoneyFormat.kr(minor, currency: currency, compact: compact, sign: sign, exact: exact)
        Group {
            if isHidden {
                Text(MoneyFormat.mask(text))
                    .blur(radius: 5)
                    .accessibilityLabel("Amount hidden")
            } else {
                Text(text)
            }
        }
        .monospacedDigit()
        .lineLimit(1)
    }
}

/// The eye in the money pages' toolbar: hides or shows every amount on this device.
struct HideAmountsButton: View {
    @AppStorage(Preferences.hideAmountsKey) private var isHidden = false

    var body: some View {
        Button {
            withAnimation(.snappy) { isHidden.toggle() }
        } label: {
            Image(systemName: isHidden ? "eye.slash" : "eye")
        }
        .accessibilityLabel(isHidden ? "Show amounts" : "Hide amounts")
        .haptic(.selection, trigger: isHidden)
    }
}
