import SwiftUI

/// What the More tab shows; switched with pills at the top, like Health and Gym.
enum MoreSection: String, CaseIterable, Identifiable {
    case places
    case contacts

    var id: String { rawValue }

    var title: String {
        switch self {
        case .places: "Places"
        case .contacts: "Contacts"
        }
    }
}

/// Pages pushed from the More tab, routed from its one stack: a destination
/// declared inside a pushed page pops right back out on iOS 26.
enum MoreRoute: Hashable {
    case contact(UUID)
}

/// The last tab: the pages that don't need a tab of their own. It opens
/// straight on the one used last, so getting back there is a single tap.
struct MoreView: View {
    let auth: AuthSession
    let isActive: Bool

    @AppStorage("more.section") private var section: MoreSection = .places
    @State private var places: PlacesStore
    @State private var contacts: ContactsStore
    @State private var path: [MoreRoute] = []
    @State private var addingPlace = false

    init(auth: AuthSession, services: AppServices, isActive: Bool) {
        self.auth = auth
        self.isActive = isActive
        _places = State(initialValue: PlacesStore(services: services))
        _contacts = State(initialValue: ContactsStore(services: services))
    }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                switch section {
                case .places:
                    PlacesView(store: places, isActive: isShowing(.places), adding: $addingPlace) { sectionPicker }
                case .contacts:
                    ContactsView(store: contacts, isActive: isShowing(.contacts)) { sectionPicker }
                }
            }
            .navigationTitle(section.title)
            .toolbarTitleDisplayMode(.inlineLarge)
            // Here rather than in Places, so the avatar stays last, as on every tab.
            .toolbar {
                if section == .places {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { addingPlace = true } label: { Image(systemName: "plus") }
                            .accessibilityLabel("Add place")
                    }
                }
                ProfileToolbarItem(auth: auth)
            }
            .navigationDestination(for: MoreRoute.self) { route in
                switch route {
                case .contact(let id):
                    ContactDetailView(store: contacts, contactID: id)
                }
            }
            .haptic(.selection, trigger: section)
        }
    }

    private func isShowing(_ page: MoreSection) -> Bool {
        isActive && section == page && path.isEmpty
    }

    private var sectionPicker: some View {
        HStack(spacing: 8) {
            ForEach(MoreSection.allCases) { page in
                FilterPill(title: page.title, isSelected: section == page) {
                    withAnimation(.snappy) { section = page }
                }
            }
        }
    }
}
