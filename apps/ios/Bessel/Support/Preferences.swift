import SwiftUI

/// On-device settings from the Settings sheet.
enum Preferences {
    static let hapticsKey = "prefs.haptics"
    static let appearanceKey = "prefs.appearance"
}

enum AppearancePreference: String, CaseIterable, Identifiable {
    case light
    case dark
    case system

    var id: String { rawValue }

    var label: String {
        switch self {
        case .light: "Light"
        case .dark: "Dark"
        case .system: "System"
        }
    }
}

private struct HapticModifier<Trigger: Equatable>: ViewModifier {
    let feedback: SensoryFeedback
    let trigger: Trigger
    let condition: ((Trigger, Trigger) -> Bool)?

    @AppStorage(Preferences.hapticsKey) private var isEnabled = true

    func body(content: Content) -> some View {
        content.sensoryFeedback(feedback, trigger: trigger) { old, new in
            isEnabled && (condition?(old, new) ?? true)
        }
    }
}

extension View {
    /// `sensoryFeedback` that respects the Haptic feedback setting.
    func haptic<Trigger: Equatable>(
        _ feedback: SensoryFeedback,
        trigger: Trigger,
        condition: ((Trigger, Trigger) -> Bool)? = nil
    ) -> some View {
        modifier(HapticModifier(feedback: feedback, trigger: trigger, condition: condition))
    }
}
