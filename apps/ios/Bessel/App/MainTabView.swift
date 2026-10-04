import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case tasks
    case health
    case recipes
    case places
    case golfCart

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tasks: "Tasks"
        case .health: "Health"
        case .recipes: "Recipes"
        case .places: "Places"
        case .golfCart: "Golf cart"
        }
    }

    var icon: String {
        switch self {
        case .tasks: "checkmark.circle"
        case .health: "heart"
        case .recipes: "fork.knife"
        case .places: "mappin.and.ellipse"
        case .golfCart: "bolt.car"
        }
    }
}

struct MainTabView: View {
    let auth: AuthSession

    @State private var selection: AppTab = .tasks
    @State private var toasts = ToastCenter()

    var body: some View {
        TabView(selection: $selection) {
            TasksView(auth: auth)
                .tabItem { Label(AppTab.tasks.title, systemImage: AppTab.tasks.icon) }
                .tag(AppTab.tasks)
                .floatingTabBar()
            HealthView(auth: auth, isActive: selection == .health)
                .tabItem { Label(AppTab.health.title, systemImage: AppTab.health.icon) }
                .tag(AppTab.health)
                .floatingTabBar()
            RecipesView(auth: auth)
                .tabItem { Label(AppTab.recipes.title, systemImage: AppTab.recipes.icon) }
                .tag(AppTab.recipes)
                .floatingTabBar()
            PlacesView(auth: auth)
                .tabItem { Label(AppTab.places.title, systemImage: AppTab.places.icon) }
                .tag(AppTab.places)
                .floatingTabBar()
            GolfCartView(auth: auth, isActive: selection == .golfCart)
                .tabItem { Label(AppTab.golfCart.title, systemImage: AppTab.golfCart.icon) }
                .tag(AppTab.golfCart)
                .floatingTabBar()
        }
        .environment(toasts)
        .overlay(alignment: .bottom) {
            ToastOverlay(center: toasts)
                .padding(.bottom, 64)
        }
        .haptic(.selection, trigger: selection)
        .onChange(of: selection) {
            // An open composer on the tab you left shouldn't keep the keyboard up.
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
        .onAppear(perform: applyLaunchTab)
    }

    private func applyLaunchTab() {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["BESSEL_TAB"], let tab = AppTab(rawValue: raw) {
            selection = tab
        }
        #endif
    }
}

private extension View {
    /// Content runs all the way under the floating glass tab bar, with no
    /// solid bar background or darkening edge effect behind it.
    @ViewBuilder
    func floatingTabBar() -> some View {
        if #available(iOS 26.0, *) {
            toolbarBackgroundVisibility(.hidden, for: .tabBar)
                .scrollEdgeEffectHidden(true, for: .bottom)
        } else {
            toolbarBackground(.hidden, for: .tabBar)
        }
    }
}

/// The avatar as its own toolbar item. On iOS 26 it stands alone instead of
/// sitting inside the bar's glass bubble (a circle in a circle).
struct ProfileToolbarItem: ToolbarContent {
    let auth: AuthSession

    var body: some ToolbarContent {
        if #available(iOS 26.0, *) {
            ToolbarItem(placement: .topBarTrailing) {
                ProfileButton(auth: auth)
            }
            .sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .topBarTrailing) {
                ProfileButton(auth: auth)
            }
        }
    }
}

/// The round avatar in each tab's navigation bar; opens your profile.
struct ProfileButton: View {
    let auth: AuthSession

    @State private var showingProfile = false

    var body: some View {
        Button {
            showingProfile = true
        } label: {
            Text(initial)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.pastel(PastelHue.forName(auth.userEmail ?? "")))
                .frame(width: 32, height: 32)
                .background(Theme.pastelWash(PastelHue.forName(auth.userEmail ?? ""), strength: 1.4), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Profile")
        .sheet(isPresented: $showingProfile) {
            ProfileView(auth: auth)
        }
    }

    private var initial: String {
        auth.userEmail?.first.map { String($0).uppercased() } ?? "B"
    }
}
