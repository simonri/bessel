import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class PlacesStore {
    var status: PlaceStatus = .wantToGo
    private(set) var places: [PlaceItem] = []
    private(set) var hasLoaded = false
    var errorMessage: String?

    private let client: APIClient
    private var pendingDeletes: [UUID: Task<Void, Never>] = [:]

    init(client: APIClient) {
        self.client = client
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

    func load() async {
        defer { hasLoaded = true }
        do {
            let response: PlaceListResponse = try await client.get(
                "/v1/places",
                query: [
                    URLQueryItem(name: "sorting", value: "-created_at"),
                    URLQueryItem(name: "limit", value: "200"),
                ]
            )
            places = response.items.filter { pendingDeletes[$0.id] == nil }
        } catch {
            report(error)
        }
    }

    func create(_ draft: PlaceCreate) async throws -> PlaceItem {
        let created: PlaceItem = try await client.post("/v1/places", body: draft)
        withAnimation(.snappy) { places.insert(created, at: 0) }
        return created
    }

    func update(_ place: PlaceItem, with update: PlaceVisitUpdate) async {
        do {
            let updated: PlaceItem = try await client.patch("/v1/places/\(place.id)", body: update)
            if let index = places.firstIndex(where: { $0.id == updated.id }) {
                withAnimation(.snappy) { places[index] = updated }
            }
        } catch {
            report(error)
        }
    }

    func delete(_ place: PlaceItem, toasts: ToastCenter) {
        withAnimation(.snappy) { places.removeAll { $0.id == place.id } }
        pendingDeletes[place.id] = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4.5))
            guard !Task.isCancelled, let self else { return }
            pendingDeletes[place.id] = nil
            do {
                try await client.deleteNoContent("/v1/places/\(place.id)")
            } catch {
                report(error)
                await load()
            }
        }
        toasts.show("Place removed") { [weak self] in
            guard let self else { return }
            pendingDeletes.removeValue(forKey: place.id)?.cancel()
            withAnimation(.snappy) {
                self.places.append(place)
                self.places.sort { $0.createdAt > $1.createdAt }
            }
        }
    }

    private func report(_ error: Error) {
        if error is CancellationError { return }
        errorMessage = error.localizedDescription
    }
}
