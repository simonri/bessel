import SwiftUI

/// Adds a Google or iCloud calendar from the phone, so the Calendar tab works
/// without ever opening the desktop app.
struct ConnectCalendarSheet: View {
    let store: CalendarStore

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        ICloudConnectForm(store: store) { dismiss() }
                    } label: {
                        Label("iCloud", systemImage: "icloud")
                    }
                } footer: {
                    Text("Your events show up here and on the desktop, and new ones you add go to that calendar.")
                }
                .listRowBackground(Theme.card)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("Connect a calendar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(28)
        .presentationDragIndicator(.hidden)
    }
}

/// Apple ID and an app-specific password: what iCloud asks of any calendar app
/// that isn't Apple's own.
private struct ICloudConnectForm: View {
    let store: CalendarStore
    let onConnected: () -> Void

    @State private var appleID = ""
    @State private var password = ""
    @State private var isConnecting = false
    @State private var errorMessage: String?
    @FocusState private var focused: Field?

    private enum Field { case appleID, password }

    private var canConnect: Bool {
        appleID.contains("@") && !password.trimmingCharacters(in: .whitespaces).isEmpty && !isConnecting
    }

    var body: some View {
        Form {
            Section {
                TextField("Apple ID", text: $appleID)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .appleID)
                    .submitLabel(.next)
                    .onSubmit { focused = .password }
                SecureField("App-specific password", text: $password)
                    .textContentType(.password)
                    .focused($focused, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(connect)
            } footer: {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Apple asks for an app-specific password here, not your usual one. Make one at account.apple.com under Sign-In and Security.")
                    Link("Open account.apple.com", destination: URL(string: "https://account.apple.com")!)
                        .foregroundStyle(Theme.primary)
                }
            }
            .listRowBackground(Theme.card)

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .font(.footnote)
                        .foregroundStyle(Theme.destructive)
                }
                .listRowBackground(Theme.card)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.background)
        .navigationTitle("iCloud")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if isConnecting {
                    ProgressView()
                } else {
                    Button("Connect", action: connect)
                        .fontWeight(.semibold)
                        .disabled(!canConnect)
                }
            }
        }
        .onAppear { focused = .appleID }
    }

    private func connect() {
        guard canConnect else { return }
        isConnecting = true
        errorMessage = nil
        Task {
            defer { isConnecting = false }
            do {
                try await store.connectICloud(appleID: appleID, appPassword: password)
                onConnected()
            } catch {
                errorMessage = error.userMessage
            }
        }
    }
}
