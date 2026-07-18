import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case tasks
    case workouts
    case recipes
    case places
    case money
    case golfCart
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tasks: "Tasks"
        case .workouts: "Workouts"
        case .recipes: "Recipes"
        case .places: "Places"
        case .money: "Money"
        case .golfCart: "Golf cart"
        case .settings: "Settings"
        }
    }

    func icon(selected: Bool) -> String {
        switch self {
        case .tasks: "checklist"
        case .workouts: "figure.run"
        case .recipes: selected ? "book.fill" : "book"
        case .places: selected ? "map.fill" : "map"
        case .money: selected ? "creditcard.fill" : "creditcard"
        case .golfCart: selected ? "bolt.car.fill" : "bolt.car"
        case .settings: selected ? "gearshape.fill" : "gearshape"
        }
    }
}

struct MainTabView: View {
    let auth: AuthSession

    @State private var selection: AppTab = .tasks

    var body: some View {
        // The bar lives below the panes in the layout (not in a safe-area inset)
        // because NavigationStack does not propagate parent safe-area insets to
        // its content — panes would extend behind the bar.
        VStack(spacing: 0) {
            ZStack {
                pane(.tasks) { TasksView(auth: auth) }
                pane(.workouts) { WorkoutsView(auth: auth) }
                pane(.recipes) { RecipesView(auth: auth) }
                pane(.places) { ComingSoonView(tab: .places) }
                pane(.money) { ComingSoonView(tab: .money) }
                pane(.golfCart) { GolfCartView(isActive: selection == .golfCart) }
                pane(.settings) { SettingsView(auth: auth) }
            }
            bottomBar
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .sensoryFeedback(.selection, trigger: selection)
    }

    /// Panes stay in the hierarchy so each tab keeps its state; selection
    /// toggles visibility directly, without TabView's crossfade.
    private func pane(_ tab: AppTab, @ViewBuilder content: () -> some View) -> some View {
        content()
            .opacity(selection == tab ? 1 : 0)
            .allowsHitTesting(selection == tab)
            .accessibilityHidden(selection != tab)
    }

    private var bottomBar: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases) { tab in
                Button {
                    selection = tab
                } label: {
                    Image(systemName: tab.icon(selected: selection == tab))
                        .font(.system(size: 21, weight: .medium))
                        .foregroundStyle(selection == tab ? Theme.foreground : Theme.mutedForeground)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(selection == tab ? [.isSelected] : [])
            }
        }
        .background(Theme.background)
        .overlay(alignment: .top) {
            Theme.border.frame(height: 0.5)
        }
    }
}

private struct ComingSoonView: View {
    let tab: AppTab

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                VStack(spacing: 12) {
                    Image(systemName: tab.icon(selected: false))
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(Theme.mutedForeground.opacity(0.4))
                    VStack(spacing: 4) {
                        Text(tab.title)
                            .font(.body.weight(.medium))
                            .foregroundStyle(Theme.foreground)
                        Text("Coming soon")
                            .font(.footnote)
                            .foregroundStyle(Theme.mutedForeground)
                    }
                }
            }
            .navigationTitle(tab.title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
