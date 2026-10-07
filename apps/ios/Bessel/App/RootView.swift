import SwiftUI

struct RootView: View {
    let auth: AuthSession

    @State private var updateRequired = false

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if updateRequired {
                UpdateRequiredView()
            } else {
                switch auth.state {
                case .restoring:
                    ProgressView()
                        .tint(Theme.mutedForeground)
                case .signedOut:
                    LoginView(auth: auth)
                case .signedIn:
                    MainTabView(auth: auth)
                }
            }
        }
        .onAppear {
            // A background task may have restored it already.
            if auth.state == .restoring { auth.restore() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .besselUpdateRequired)) { _ in
            updateRequired = true
        }
    }
}

/// Shown when the server turns this build away (HTTP 426), instead of every
/// screen failing one by one.
private struct UpdateRequiredView: View {
    var body: some View {
        EmptyState(
            emoji: "✨",
            title: "Time for an update",
            detail: "This version of Bessel isn't supported anymore. Install the latest one to keep going."
        )
        .padding(32)
    }
}
