import MapKit
import Observation
import SwiftUI

/// Search Apple Maps for a place and save it, like adding a pin in Maps.
struct AddPlaceView: View {
    let store: PlacesStore
    let onAdded: (PlaceItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var search = PlaceSearch()
    @State private var status: PlaceStatus = .wantToGo
    @State private var savingID: String?
    @State private var errorMessage: String?
    @FocusState private var isFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(Theme.mutedForeground)
                    TextField("Café, restaurant, museum…", text: $search.query)
                        .focused($isFocused)
                        .submitLabel(.search)
                        .autocorrectionDisabled()
                    if !search.query.isEmpty {
                        Button {
                            search.query = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(Theme.faintForeground)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Clear search")
                    }
                }
                .padding(.horizontal, 14)
                .frame(height: 46)
                .background(Theme.card, in: Capsule())

                HStack(spacing: 8) {
                    ForEach(PlaceStatus.allCases) { option in
                        FilterPill(title: option.label, isSelected: status == option) {
                            withAnimation(.snappy) { status = option }
                        }
                    }
                    Spacer()
                }

                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .font(.footnote)
                        .foregroundStyle(Theme.destructive)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                results
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .background(Theme.background)
            .navigationTitle("Add a place")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear { isFocused = true }
        }
        .presentationCornerRadius(28)
    }

    @ViewBuilder
    private var results: some View {
        if search.query.isEmpty {
            EmptyState(emoji: "✨", title: "Find a spot", detail: "Search like you would in Apple Maps.")
                .frame(maxHeight: .infinity)
        } else if search.results.isEmpty {
            EmptyState(emoji: "🔎", title: "No places found", detail: "Try the name and the city together.")
                .frame(maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(search.results, id: \.id) { completion in
                        Button {
                            add(completion)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "mappin.circle.fill")
                                    .font(.system(size: 26))
                                    .foregroundStyle(Theme.primary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(completion.title)
                                        .font(.body.weight(.medium))
                                        .foregroundStyle(Theme.foreground)
                                    if !completion.subtitle.isEmpty {
                                        Text(completion.subtitle)
                                            .font(.subheadline)
                                            .foregroundStyle(Theme.mutedForeground)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer()
                                if savingID == completion.id {
                                    ProgressView()
                                }
                            }
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(savingID != nil)
                        Divider().overlay(Theme.border).padding(.leading, 38)
                    }
                }
                .padding(.horizontal, 14)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .scrollDismissesKeyboard(.immediately)
        }
    }

    private func add(_ completion: MKLocalSearchCompletion) {
        savingID = completion.id
        errorMessage = nil
        Task {
            defer { savingID = nil }
            do {
                let item = try await PlaceSearch.resolve(completion)
                let created = try await store.create(PlaceSearch.draft(from: item, fallbackName: completion.title, status: status))
                onAdded(created)
                dismiss()
            } catch {
                errorMessage = "Couldn't add that place. Try again in a moment."
            }
        }
    }
}

/// Autocomplete over Apple Maps, so no API key is needed.
@MainActor
@Observable
final class PlaceSearch: NSObject, MKLocalSearchCompleterDelegate {
    var query = "" {
        didSet { completer.queryFragment = query }
    }

    private(set) var results: [MKLocalSearchCompletion] = []

    @ObservationIgnored private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.resultTypes = [.pointOfInterest, .address]
        completer.delegate = self
    }

    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        let results = completer.results
        Task { @MainActor in self.results = results }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        Task { @MainActor in self.results = [] }
    }

    static func resolve(_ completion: MKLocalSearchCompletion) async throws -> MKMapItem {
        let response = try await MKLocalSearch(request: MKLocalSearch.Request(completion: completion)).start()
        guard let item = response.mapItems.first else { throw MKError(.placemarkNotFound) }
        return item
    }

    static func draft(from item: MKMapItem, fallbackName: String, status: PlaceStatus) -> PlaceCreate {
        let placemark = item.placemark
        let street = [placemark.thoroughfare, placemark.subThoroughfare].compactMap { $0 }.joined(separator: " ")
        let address = [street.isEmpty ? nil : street, placemark.locality].compactMap { $0 }.joined(separator: ", ")
        return PlaceCreate(
            name: item.name ?? fallbackName,
            address: address.isEmpty ? nil : address,
            country: placemark.country,
            latitude: placemark.coordinate.latitude,
            longitude: placemark.coordinate.longitude,
            status: status,
            category: item.pointOfInterestCategory.flatMap(category),
            website: item.url?.absoluteString,
            phone: item.phoneNumber
        )
    }

    /// Apple Maps categories onto the API's canonical ones.
    private static func category(_ poi: MKPointOfInterestCategory) -> String? {
        switch poi {
        case .restaurant: "restaurant"
        case .foodMarket: "market"
        case .cafe: "cafe"
        case .bakery: "bakery"
        case .brewery, .winery, .nightlife: "bar"
        case .museum: "museum"
        case .theater, .movieTheater: "theater"
        case .park, .nationalPark: "park"
        case .beach: "beach"
        case .hotel: "hotel"
        case .store: "shopping"
        case .fitnessCenter: "gym"
        default: nil
        }
    }
}

extension MKLocalSearchCompletion {
    var id: String { "\(title)|\(subtitle)" }
}
