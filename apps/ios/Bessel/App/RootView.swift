import SwiftUI

struct RootView: View {
    let auth: AuthSession

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            switch auth.state {
            case .restoring:
                ProgressView()
                    .tint(Theme.mutedForeground)
            case .signedOut:
                LoginView(auth: auth)
            case .signedIn:
                TasksView(auth: auth)
            }
        }
        .onAppear { auth.restore() }
    }
}
