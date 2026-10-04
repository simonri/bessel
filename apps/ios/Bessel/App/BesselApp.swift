import SwiftUI
import UIKit

@main
struct BesselApp: App {
    @State private var auth = AuthSession()
    @AppStorage(Preferences.appearanceKey) private var appearance: AppearancePreference = .system

    var body: some Scene {
        WindowGroup {
            RootView(auth: auth)
                .tint(Theme.primary)
                .fontDesign(.rounded)
                .background(Theme.background)
                .onAppear(perform: applyAppearance)
                .onChange(of: appearance) { applyAppearance() }
        }
    }

    /// Set on the window rather than with `preferredColorScheme`, which doesn't
    /// reliably return to the system setting and misses sheets.
    private func applyAppearance() {
        let style: UIUserInterfaceStyle = switch appearance {
        case .light: .light
        case .dark: .dark
        case .system: .unspecified
        }
        for scene in UIApplication.shared.connectedScenes {
            for window in (scene as? UIWindowScene)?.windows ?? [] {
                window.overrideUserInterfaceStyle = style
            }
        }
    }
}
