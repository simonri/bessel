import SwiftUI

@main
struct BesselApp: App {
    @State private var auth = AuthSession()

    var body: some Scene {
        WindowGroup {
            RootView(auth: auth)
                .preferredColorScheme(.dark)
                .tint(Theme.primary)
                .background(Theme.background)
        }
    }
}
