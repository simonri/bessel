import SwiftUI

/// Settings, opened from the avatar: grouped cards with outline icons, an
/// appearance picker and log out at the bottom.
struct ProfileView: View {
    let auth: AuthSession

    @Environment(\.dismiss) private var dismiss
    @AppStorage(Preferences.hapticsKey) private var hapticsEnabled = true
    @AppStorage(Preferences.appearanceKey) private var appearance: AppearancePreference = .system
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    section("Account") {
                        accountRow
                    }

                    section("App") {
                        row("Apple Health", systemImage: "heart") {
                            Text(healthStatus)
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        divider
                        row("Haptic feedback", systemImage: "iphone.radiowaves.left.and.right", iconSize: 14) {
                            Toggle("Haptic feedback", isOn: $hapticsEnabled)
                                .labelsHidden()
                        }
                        divider
                        row("Version", systemImage: "info.circle") {
                            Text(Self.versionLabel)
                                .foregroundStyle(Theme.mutedForeground)
                        }
                    }

                    section("Appearance") {
                        HStack(spacing: 12) {
                            ForEach(AppearancePreference.allCases) { option in
                                AppearanceOption(option: option, isSelected: appearance == option) {
                                    withAnimation(.snappy) { appearance = option }
                                }
                            }
                        }
                        .padding(16)
                    }

                    Button {
                        confirmingSignOut = true
                    } label: {
                        HStack(spacing: 16) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 20, weight: .light))
                                .frame(width: 28)
                            Text("Log out")
                            Spacer()
                        }
                        .font(.body)
                        .foregroundStyle(Theme.destructive)
                        .padding(.horizontal, 18)
                        .frame(height: 60)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 32)
            }
            .background(Theme.background)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
            }
            .confirmationDialog("Log out of Bessel?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                Button("Log out", role: .destructive) {
                    dismiss()
                    auth.signOut()
                }
            }
        }
        .presentationDetents([.large])
        .presentationCornerRadius(32)
    }

    // MARK: - Pieces

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(Theme.mutedForeground)
                .padding(.leading, 20)
            VStack(spacing: 0, content: content)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
    }

    private func row(_ title: String, systemImage: String, iconSize: CGFloat = 20, @ViewBuilder trailing: () -> some View) -> some View {
        HStack(spacing: 16) {
            Image(systemName: systemImage)
                .font(.system(size: iconSize, weight: .light))
                .foregroundStyle(Theme.foreground)
                .frame(width: 28)
            Text(title)
                .foregroundStyle(Theme.foreground)
            Spacer(minLength: 8)
            trailing()
        }
        .font(.body)
        .padding(.horizontal, 18)
        .frame(minHeight: 60)
    }

    private var divider: some View {
        Theme.border
            .frame(height: 0.5)
            .padding(.leading, 62)
    }

    private var accountRow: some View {
        let hue = PastelHue.forName(auth.userEmail ?? "")
        return HStack(spacing: 14) {
            Text(auth.userEmail?.first.map { String($0).uppercased() } ?? "B")
                .font(.headline)
                .foregroundStyle(Theme.pastel(hue))
                .frame(width: 44, height: 44)
                .background(Theme.pastelWash(hue, strength: 1.4), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(auth.userEmail ?? "Signed in")
                    .foregroundStyle(Theme.foreground)
                Text("Signed in with Google")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
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

/// A tiny preview of the app in light, dark or split for System.
private struct AppearanceOption: View {
    let option: AppearancePreference
    let isSelected: Bool
    let action: () -> Void

    private static let lightSurface = Color(UIColor.oklch(0.985, 0.006, 70))
    private static let lightCard = Color(UIColor.oklch(1, 0, 0))
    private static let darkSurface = Color(UIColor.oklch(0.15, 0.004, 285))
    private static let darkCard = Color(UIColor.oklch(0.205, 0.005, 285))

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                preview
                    .frame(height: 86)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(isSelected ? Theme.primary : Theme.border, lineWidth: isSelected ? 2.5 : 1)
                    )
                Text(option.label)
                    .font(.subheadline.weight(isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? Theme.primary : Theme.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(option.label)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    @ViewBuilder
    private var preview: some View {
        switch option {
        case .light:
            mock(surface: Self.lightSurface, card: Self.lightCard, line: .black.opacity(0.25))
        case .dark:
            mock(surface: Self.darkSurface, card: Self.darkCard, line: .white.opacity(0.35))
        case .system:
            ZStack {
                mock(surface: Self.lightSurface, card: Self.lightCard, line: .black.opacity(0.25))
                mock(surface: Self.darkSurface, card: Self.darkCard, line: .white.opacity(0.35))
                    .mask(DiagonalHalf())
            }
        }
    }

    private func mock(surface: Color, card: Color, line: Color) -> some View {
        ZStack {
            surface
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(card)
                .padding(10)
            VStack(alignment: .leading, spacing: 5) {
                Capsule().fill(line).frame(width: 40, height: 4)
                Capsule().fill(line).frame(width: 26, height: 4)
                Spacer()
                HStack {
                    Spacer()
                    Circle().fill(Theme.primary).frame(width: 14, height: 14)
                }
            }
            .padding(18)
        }
    }
}

/// The lower-right triangle, for the split System preview.
private struct DiagonalHalf: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.closeSubpath()
        }
    }
}
