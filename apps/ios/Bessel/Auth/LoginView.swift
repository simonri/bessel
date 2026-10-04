import SwiftUI

struct LoginView: View {
    let auth: AuthSession

    @State private var isSigningIn = false
    @State private var errorMessage: String?
    @State private var appeared = false

    var body: some View {
        ZStack {
            glow
            VStack(spacing: 0) {
                Spacer()

                BesselMark(size: 72)
                Text("Bessel")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(Theme.foreground)
                    .padding(.top, 18)
                Text("Your tasks, health, recipes and places,\nall in one calm little spot.")
                    .font(.body)
                    .foregroundStyle(Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)

                Spacer()

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Theme.destructive)
                        .multilineTextAlignment(.center)
                        .padding(.bottom, 12)
                }

                if !AppConfig.isAuthConfigured {
                    Text("Fill in AUTH0_CLIENT_ID and AUTH0_AUDIENCE in apps/ios/Config, then rebuild.")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                        .padding(.bottom, 12)
                }

                Button(action: signIn) {
                    ZStack {
                        Text("Continue with Google")
                            .font(.body.weight(.semibold))
                            .opacity(isSigningIn ? 0 : 1)
                        if isSigningIn {
                            ProgressView()
                                .tint(Theme.background)
                        }
                    }
                    .foregroundStyle(Theme.background)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(Theme.foreground, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isSigningIn || !AppConfig.isAuthConfigured)

                Text("We only use your Google account to sign you in.")
                    .font(.caption)
                    .foregroundStyle(Theme.faintForeground)
                    .padding(.top, 14)
            }
            .padding(24)
            .padding(.bottom, 12)
        }
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.easeOut(duration: 0.25)) { appeared = true }
        }
    }

    private var glow: some View {
        ZStack {
            Circle()
                .fill(Theme.pastelSolid(32).opacity(0.35))
                .frame(width: 320, height: 320)
                .blur(radius: 90)
                .offset(x: -90, y: -170)
            Circle()
                .fill(Theme.pastelSolid(305).opacity(0.3))
                .frame(width: 300, height: 300)
                .blur(radius: 90)
                .offset(x: 110, y: -60)
        }
        .allowsHitTesting(false)
    }

    private func signIn() {
        isSigningIn = true
        errorMessage = nil
        Task {
            defer { isSigningIn = false }
            do {
                try await auth.signIn()
            } catch is CancellationError {
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
