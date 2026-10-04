import MapKit
import SwiftUI

struct PlacesView: View {
    let auth: AuthSession

    @State private var store: PlacesStore
    @State private var showingMap = false
    @State private var adding = false
    @State private var selectedID: UUID?
    @State private var justAddedID: UUID?
    @State private var cameraPosition: MapCameraPosition = .automatic
    @Environment(ToastCenter.self) private var toasts

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: PlacesStore(client: APIClient(auth: auth)))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                statusPicker
                    .padding(.horizontal, 16)
                    .padding(.top, Theme.pageTop)
                    .padding(.bottom, 12)
                if showingMap {
                    map
                } else {
                    list
                }
            }
            .background(Theme.background)
            .navigationTitle("Places")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add place")
                }
                ProfileToolbarItem(auth: auth)
            }
            // The new place opens once the add sheet is gone; presenting a
            // sheet while another is dismissing is dropped.
            .sheet(isPresented: $adding, onDismiss: {
                selectedID = justAddedID
                justAddedID = nil
            }) {
                AddPlaceView(store: store) { created in
                    store.status = created.status
                    justAddedID = created.id
                }
            }
            .sheet(item: selectedPlace) { selection in
                PlaceDetailView(store: store, placeID: selection.id)
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .task { await store.load() }
        }
    }

    private var statusPicker: some View {
        HStack(spacing: 8) {
            ForEach(PlaceStatus.allCases) { status in
                FilterPill(title: "\(status.label)  \(store.count(status))", isSelected: store.status == status) {
                    withAnimation(.snappy) { store.status = status }
                }
            }
            Spacer()
            Button {
                withAnimation(.snappy) { showingMap.toggle() }
            } label: {
                Image(systemName: showingMap ? "list.bullet" : "map")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.foreground)
                    .frame(width: 36, height: 36)
                    .background(Theme.fill, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showingMap ? "Show list" : "Show map")
        }
    }

    @ViewBuilder
    private var list: some View {
        if !store.hasLoaded {
            ProgressView().frame(maxHeight: .infinity)
        } else if store.visible.isEmpty {
            VStack(spacing: 16) {
                EmptyState(
                    emoji: store.status == .wantToGo ? "🗺️" : "📸",
                    title: store.status == .wantToGo ? "Where to next?" : "No memories yet",
                    detail: store.status == .wantToGo
                        ? "Save cafés, restaurants and spots you'd love to try."
                        : "Places you've been show up here with your rating and notes."
                )
                if store.status == .wantToGo {
                    Button("Add a place") { adding = true }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22)
                        .frame(height: 46)
                        .background(Theme.primary, in: Capsule())
                }
            }
            .frame(maxHeight: .infinity)
        } else {
            List {
                ForEach(store.visible) { place in
                    Button {
                        selectedID = place.id
                    } label: {
                        PlaceRow(place: place)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Theme.card)
                    .listRowSeparatorTint(Theme.border)
                    .swipeActions(edge: .leading) {
                        if place.status == .wantToGo {
                            Button {
                                Task {
                                    await store.update(place, with: PlaceVisitUpdate(status: .visited, rating: nil, visitedAt: .now, review: place.review))
                                }
                                toasts.show("Moved to Been there ✨")
                            } label: {
                                Label("Been there", systemImage: "checkmark")
                            }
                            .tint(Theme.positive)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            store.delete(place, toasts: toasts)
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .contentMargins(.top, 0, for: .scrollContent)
            .refreshable { await store.load() }
        }
    }

    private var map: some View {
        Map(position: $cameraPosition, selection: $selectedID) {
            ForEach(store.visible) { place in
                Annotation(place.name, coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)) {
                    Text(PlaceCategory.emoji(place.category))
                        .font(.system(size: 18))
                        .frame(width: 36, height: 36)
                        .background(Theme.card, in: Circle())
                        .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
                }
                .tag(place.id)
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .onChange(of: store.status) { cameraPosition = .automatic }
    }

    private var selectedPlace: Binding<SelectedPlace?> {
        Binding(
            get: { selectedID.map(SelectedPlace.init) },
            set: { selectedID = $0?.id }
        )
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}

private struct SelectedPlace: Identifiable {
    let id: UUID
}

private struct PlaceRow: View {
    let place: PlaceItem

    var body: some View {
        HStack(spacing: 12) {
            Text(PlaceCategory.emoji(place.category))
                .font(.system(size: 22))
                .frame(width: 46, height: 46)
                .background(Theme.pastelWash(PlaceCategory.hue(place.category), strength: 1.4), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(place.name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let category = PlaceCategory.label(place.category) {
                        Text(category)
                    }
                    if let city = place.city {
                        Text("·")
                        Text(city).lineLimit(1)
                    }
                }
                .font(.subheadline)
                .foregroundStyle(Theme.mutedForeground)
            }
            Spacer(minLength: 0)
            if let rating = place.rating {
                HStack(spacing: 2) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.warning)
                    Text("\(rating)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.foreground)
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

// MARK: - Detail

struct PlaceDetailView: View {
    let store: PlacesStore
    let placeID: UUID

    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toasts
    @State private var review = ""
    @FocusState private var reviewFocused: Bool

    var body: some View {
        NavigationStack {
            if let place = store.place(placeID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header(place)
                        actions(place)

                        if place.status == .visited {
                            visitCard(place)
                        } else {
                            Button {
                                Task { await store.update(place, with: PlaceVisitUpdate(status: .visited, rating: nil, visitedAt: .now, review: place.review)) }
                            } label: {
                                Label("I've been here", systemImage: "checkmark.circle.fill")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 52)
                                    .background(Theme.primary, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }

                        Map(initialPosition: .region(MKCoordinateRegion(
                            center: place.coordinate,
                            latitudinalMeters: 800,
                            longitudinalMeters: 800
                        ))) {
                            Marker(place.name, coordinate: place.coordinate)
                                .tint(Theme.primary)
                        }
                        .frame(height: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .allowsHitTesting(false)
                    }
                    .padding(16)
                }
                .background(Theme.background)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Menu {
                            if place.status == .visited {
                                Button {
                                    Task { await store.update(place, with: PlaceVisitUpdate(status: .wantToGo, rating: nil, visitedAt: nil, review: place.review)) }
                                } label: {
                                    Label("Move to Want to go", systemImage: "arrow.uturn.backward")
                                }
                            }
                            Button(role: .destructive) {
                                dismiss()
                                store.delete(place, toasts: toasts)
                            } label: {
                                Label("Remove place", systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            saveReview(place)
                            dismiss()
                        }
                        .fontWeight(.semibold)
                    }
                }
                .onAppear { review = place.review ?? "" }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(28)
    }

    private func header(_ place: PlaceItem) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text(PlaceCategory.emoji(place.category))
                .font(.system(size: 30))
                .frame(width: 60, height: 60)
                .background(Theme.pastelWash(PlaceCategory.hue(place.category), strength: 1.4), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.foreground)
                if let address = place.address {
                    Text(address)
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                }
                if let category = PlaceCategory.label(place.category) {
                    Chip(text: category, hue: PlaceCategory.hue(place.category))
                        .padding(.top, 2)
                }
            }
        }
    }

    private func actions(_ place: PlaceItem) -> some View {
        HStack(spacing: 10) {
            actionButton("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill") {
                let item = MKMapItem(placemark: MKPlacemark(coordinate: place.coordinate))
                item.name = place.name
                item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
            }
            if let website = place.website, let url = URL(string: website) {
                actionButton("Website", systemImage: "safari.fill") { UIApplication.shared.open(url) }
            }
            if let phone = place.phone, let url = URL(string: "tel:\(phone.filter { !$0.isWhitespace })") {
                actionButton("Call", systemImage: "phone.fill") { UIApplication.shared.open(url) }
            }
        }
    }

    private func actionButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.primary)
                Text(title)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Theme.foreground)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func visitCard(_ place: PlaceItem) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Your rating")
                    .font(.headline)
                    .foregroundStyle(Theme.foreground)
                Spacer()
                if let visitedAt = place.visitedAt {
                    Text("Visited \(visitedAt.formatted(.dateTime.day().month(.abbreviated).year()))")
                        .font(.caption)
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
            HStack(spacing: 10) {
                ForEach(1...5, id: \.self) { star in
                    Button {
                        let rating = place.rating == star ? nil : star
                        Task {
                            await store.update(place, with: PlaceVisitUpdate(status: .visited, rating: rating, visitedAt: place.visitedAt, review: trimmedReview))
                        }
                    } label: {
                        Image(systemName: star <= (place.rating ?? 0) ? "star.fill" : "star")
                            .font(.system(size: 28))
                            .foregroundStyle(star <= (place.rating ?? 0) ? Theme.warning : Theme.faintForeground)
                    }
                    .buttonStyle(.plain)
                    .haptic(.selection, trigger: place.rating)
                    .accessibilityLabel("\(star) star\(star == 1 ? "" : "s")")
                }
            }
            TextField("What did you think?", text: $review, axis: .vertical)
                .lineLimit(3...8)
                .focused($reviewFocused)
                .padding(12)
                .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .onChange(of: reviewFocused) { _, focused in
                    if !focused { saveReview(place) }
                }
        }
        .card(padding: 18)
    }

    private var trimmedReview: String? {
        let trimmed = review.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func saveReview(_ place: PlaceItem) {
        guard place.status == .visited, trimmedReview != place.review else { return }
        Task {
            await store.update(place, with: PlaceVisitUpdate(status: place.status, rating: place.rating, visitedAt: place.visitedAt, review: trimmedReview))
        }
    }
}

extension PlaceItem {
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
