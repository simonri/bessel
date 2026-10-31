import SwiftUI

/// Imports a shared Timeline export as soon as it opens, then says what changed.
struct TimelineImportSheet: View {
    let importer: TimelineImporter
    let client: APIClient

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Spacer(minLength: 0)
                content
                Spacer(minLength: 0)
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(Theme.background)
            .navigationTitle("Google Timeline")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    if importer.phase != .importing {
                        Button("Done") { importer.close() }
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .presentationCornerRadius(28)
        .interactiveDismissDisabled(importer.phase == .importing)
        // Again for each file, should another be shared while this one shows.
        .task(id: importer.file) { await importer.start(client: client) }
    }

    @ViewBuilder
    private var content: some View {
        switch importer.phase {
        case .ready, .importing:
            ProgressView()
                .controlSize(.large)
                .tint(Theme.mutedForeground)
            Text("Importing your Timeline…")
                .foregroundStyle(Theme.mutedForeground)
        case let .imported(result):
            Image(systemName: result.unreadable > 0 ? "exclamationmark.triangle" : "checkmark.circle")
                .font(.system(size: 44))
                .foregroundStyle(result.unreadable > 0 ? Theme.destructive : Theme.primary)
            Text(result.unreadable > 0 ? "Imported, but not all of it" : "Timeline imported")
                .font(.headline)
            Text(Self.summary(result))
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.mutedForeground)
        case let .failed(message):
            Image(systemName: "exclamationmark.circle")
                .font(.system(size: 44))
                .foregroundStyle(Theme.destructive)
            Text("Import failed")
                .font(.headline)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.mutedForeground)
            if importer.file.map({ FileManager.default.fileExists(atPath: $0.path(percentEncoded: false)) }) == true {
                HStack(spacing: 12) {
                    Button("Discard", role: .destructive) { importer.discard() }
                        .buttonStyle(.bordered)
                    Button("Try again") { Task { await importer.start(client: client) } }
                        .buttonStyle(.borderedProminent)
                }
                .padding(.top, 8)
            }
        }
    }

    static func summary(_ result: API.LocationImportSchema) -> String {
        let changes = [
            (result.added, "added"),
            (result.updated, "updated"),
            (result.removed, "removed"),
        ]
        .filter { $0.0 > 0 }
        .map { "\($0.0.formatted()) \($0.1)" }
        var lines = [changes.isEmpty ? "Already up to date." : changes.joined(separator: ", ").capitalizedFirst + "."]
        if result.stale > 0 {
            lines.append("\(result.stale.formatted()) skipped: a newer export already covers them.")
        }
        if result.unreadable > 0 {
            lines.append("\(result.unreadable.formatted()) couldn't be read, so nothing was removed this time.")
        }
        return lines.joined(separator: "\n")
    }
}

private extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
