import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class PlacesStore {
    var status: PlaceStatus = .wantToGo
    private(set) var places: [PlaceItem] = []
    private(set) var hasLoaded = false
    /// A change that didn't go through; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let outbox: DeleteOutbox
    private let cache: ResponseCache
    @ObservationIgnored private var loads = LoadGeneration()
    @ObservationIgnored private let changes = SerialQueues<UUID>()
    private static let cacheKey = "places.v1"

    init(services: AppServices) {
        client = services.client
        outbox = services.outbox
        cache = services.cache
        if let saved = cache.load([PlaceItem].self, key: Self.cacheKey) {
            places = saved
            hasLoaded = true
        }
    }

    var visible: [PlaceItem] {
        let filtered = places.filter { $0.status == status }
        guard status == .visited else { return filtered }
        return filtered.sorted { ($0.visitedAt ?? $0.createdAt) > ($1.visitedAt ?? $1.createdAt) }
    }

    func count(_ status: PlaceStatus) -> Int {
        places.filter { $0.status == status }.count
    }

    func place(_ id: UUID) -> PlaceItem? {
        places.first { $0.id == id }
    }

    func loadIfStale() async {
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    func load() async {
        let ticket = loads.begin()
        defer { hasLoaded = true }
        do {
            let items: [PlaceItem] = try await client.getAllPages(
                "/v1/places",
                query: [URLQueryItem(name: "sorting", value: "-created_at")]
            )
            guard loads.isCurrent(ticket) else { return }
            let pending = outbox.pendingIDs
            places = items.filter { !pending.contains($0.id) }
            loadError = nil
            loads.finish(ticket)
            cache.save(items, as: Self.cacheKey)
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    func create(_ draft: PlaceCreate) async throws -> PlaceItem {
        loads.invalidate()
        let created: PlaceItem = try await client.post("/v1/places", body: draft)
        withAnimation(.snappy) { places.insert(created, at: 0) }
        return created
    }

    func update(_ place: PlaceItem, with update: PlaceVisitUpdate) async {
        loads.invalidate()
        do {
            let updated: PlaceItem = try await changes.run(place.id) { [client] in
                try await client.patch("/v1/places/\(place.id)", body: update)
            }
            if let index = places.firstIndex(where: { $0.id == updated.id }) {
                withAnimation(.snappy) { places[index] = updated }
            }
        } catch {
            report(error)
        }
    }

    func delete(_ place: PlaceItem, toasts: ToastCenter) {
        loads.invalidate()
        withAnimation(.snappy) { places.removeAll { $0.id == place.id } }
        outbox.schedule(place.id, path: "/v1/places/\(place.id)")
        toasts.show("Place removed") { [weak self] in
            guard let self, outbox.cancel(place.id) else { return }
            withAnimation(.snappy) {
                self.places.append(place)
                self.places.sort { $0.createdAt > $1.createdAt }
            }
        }
    }

    private func report(_ error: Error) {
        if error.isCancellation { return }
        errorMessage = error.userMessage
    }
}
