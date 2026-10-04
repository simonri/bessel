import SwiftUI

@main
struct BesselApp: App {
    @State private var auth = AuthSession()

    var body: some Scene {
        WindowGroup {
            RootView(auth: auth)
                .tint(Theme.primary)
                .fontDesign(.rounded)
                .background(Theme.background)
        }
    }
}
