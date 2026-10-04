import SwiftUI

struct ProfileView: View {
    let auth: AuthSession

    @Environment(\.dismiss) private var dismiss
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    header
                    VStack(spacing: 0) {
                        row("Apple Health", value: healthStatus, systemImage: "heart.fill", hue: 0)
                        Divider().overlay(Theme.border).padding(.leading, 52)
                        row("Version", value: Self.versionLabel, systemImage: "sparkles", hue: 270)
                    }
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

                    Button(role: .destructive) {
                        confirmingSignOut = true
                    } label: {
                        Text("Sign out")
                            .font(.body.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                    .tint(Theme.destructive)

                    BesselMark(size: 22, color: Theme.faintForeground)
                        .padding(.top, 8)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(Theme.background)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Sign out of Bessel?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) {
                    dismiss()
                    auth.signOut()
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(28)
    }

    private var header: some View {
        let hue = PastelHue.forName(auth.userEmail ?? "")
        return VStack(spacing: 10) {
            Text(auth.userEmail?.first.map { String($0).uppercased() } ?? "B")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Theme.pastel(hue))
                .frame(width: 76, height: 76)
                .background(Theme.pastelWash(hue, strength: 1.4), in: Circle())
            if let email = auth.userEmail {
                Text(email)
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
    }

    private func row(_ title: String, value: String, systemImage: String, hue: Double) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.pastel(hue))
                .frame(width: 28, height: 28)
                .background(Theme.pastelWash(hue), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text(title)
                .foregroundStyle(Theme.foreground)
            Spacer()
            Text(value)
                .foregroundStyle(Theme.mutedForeground)
        }
        .font(.subheadline)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    private var healthStatus: String {
        guard let lastSynced = WorkoutSyncAnchor.lastSyncedAt else { return "Not connected" }
        return "Synced \(lastSynced.formatted(.relative(presentation: .named)))"
    }

    private static let versionLabel: String = {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String
        return build.map { "\(version) (\($0))" } ?? version
    }()
}
