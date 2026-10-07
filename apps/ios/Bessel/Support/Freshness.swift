import SwiftUI

extension View {
    /// Runs `refresh` when this tab comes on screen and when the app comes back
    /// to the front, but not for tabs nobody is looking at. `refresh` decides
    /// for itself whether what's shown is old enough to fetch again.
    func refreshWhileVisible(_ isActive: Bool, refresh: @escaping () async -> Void) -> some View {
        modifier(RefreshWhileVisible(isActive: isActive, refresh: refresh))
    }

    /// A refresh that failed, as a toast with Retry over what's still shown,
    /// rather than an alert for something nobody asked for.
    func loadErrorToast(_ message: Binding<String?>, isActive: Bool, retry: @escaping () async -> Void) -> some View {
        modifier(LoadErrorToast(message: message, isActive: isActive, retry: retry))
    }
}

private struct RefreshWhileVisible: ViewModifier {
    let isActive: Bool
    let refresh: () async -> Void

    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content.task(id: isActive && scenePhase == .active) {
            guard isActive, scenePhase == .active else { return }
            await refresh()
        }
    }
}

private struct LoadErrorToast: ViewModifier {
    @Binding var message: String?
    let isActive: Bool
    let retry: () async -> Void

    @Environment(ToastCenter.self) private var toasts

    func body(content: Content) -> some View {
        content.onChange(of: message) { _, new in
            guard let new else { return }
            message = nil
            guard isActive else { return }
            toasts.showQuietly(new, actionTitle: "Retry") {
                Task { await retry() }
            }
        }
    }
}
