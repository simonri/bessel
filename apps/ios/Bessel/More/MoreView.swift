import SwiftUI

/// Every page reached from the More tab, routed from its one stack: a
/// destination declared inside a pushed page pops right back out on iOS 26.
enum MoreRoute: Hashable {
    case places
    case contacts
    case contact(UUID)
}

/// The last tab: the pages that don't need a tab of their own.
struct MoreView: View {
    let auth: AuthSession
    let isActive: Bool

    @State private var places: PlacesStore
    @State private var contacts: ContactsStore
    @State private var path: [MoreRoute] = []

    init(auth: AuthSession, services: AppServices, isActive: Bool) {
        self.auth = auth
        self.isActive = isActive
        _places = State(initialValue: PlacesStore(services: services))
        _contacts = State(initialValue: ContactsStore(services: services))
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    row(.places, title: "Places", detail: placesDetail, systemImage: "mappin.and.ellipse", hue: 15)
                    row(.contacts, title: "Contacts", detail: contactsDetail, systemImage: "person.2", hue: 250)
                }
                .listRowBackground(Theme.card)
                .listRowSeparatorTint(Theme.border)
            }
            .listStyle(.insetGrouped)
            .contentMargins(.top, Theme.pageTop, for: .scrollContent)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("More")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ProfileToolbarItem(auth: auth)
            }
            .navigationDestination(for: MoreRoute.self) { route in
                switch route {
                case .places:
                    PlacesView(store: places, isActive: isActive && path.last == .places)
                case .contacts:
                    ContactsView(store: contacts, isActive: isActive && path.last == .contacts)
                case .contact(let id):
                    ContactDetailView(store: contacts, contactID: id)
                }
            }
            // Counts on the rows; each page refreshes itself once open.
            .refreshWhileVisible(isActive && path.isEmpty) {
                async let placesLoad: Void = places.loadIfStale()
                async let contactsLoad: Void = contacts.loadIfStale()
                _ = await (placesLoad, contactsLoad)
            }
        }
    }

    private func row(_ route: MoreRoute, title: String, detail: String?, systemImage: String, hue: Double) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 14) {
                Image(systemName: systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.pastel(hue))
                    .frame(width: 40, height: 40)
                    .background(Theme.pastelWash(hue, strength: 1.4), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.foreground)
                    if let detail {
                        Text(detail)
                            .font(.subheadline)
                            .foregroundStyle(Theme.mutedForeground)
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    /// "3 to try · 5 been": only once there's something to count.
    private var placesDetail: String? {
        guard places.hasLoaded, !places.places.isEmpty else { return "Cafés and spots you want to try" }
        return "\(places.count(.wantToGo)) to try · \(places.count(.visited)) been"
    }

    private var contactsDetail: String? {
        guard contacts.hasLoaded, !contacts.contacts.isEmpty else { return "Birthdays and catching up" }
        let count = contacts.contacts.count
        return count == 1 ? "1 person" : "\(count) people"
    }
}
