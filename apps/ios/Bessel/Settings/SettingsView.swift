import SwiftUI

struct SettingsView: View {
    let auth: AuthSession

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if let email = auth.userEmail {
                        LabeledContent("Email", value: email)
                            .foregroundStyle(Theme.foreground)
                    }
                    Button("Sign out", role: .destructive) {
                        auth.signOut()
                    }
                } header: {
                    Text("Account")
                        .font(.footnote.weight(.medium))
                        .textCase(nil)
                        .foregroundStyle(Theme.mutedForeground)
                }
                .listRowBackground(Theme.card)
                .listRowSeparatorTint(Theme.border)

                Section {
                } footer: {
                    VStack(spacing: 8) {
                        BesselMark(size: 22, color: Theme.mutedForeground.opacity(0.5))
                        Text("Bessel \(Self.versionLabel)")
                            .font(.caption)
                            .foregroundStyle(Theme.mutedForeground.opacity(0.7))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 24)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private static let versionLabel: String = {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String
        return build.map { "\(version) (\($0))" } ?? version
    }()
}
