import SwiftUI

struct LoginView: View {
    let auth: AuthSession

    @State private var isSigningIn = false
    @State private var errorMessage: String?
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            BesselMark(size: 64)
            Text("Bessel")
                .font(.system(size: 30, weight: .semibold))
                .kerning(-0.5)
                .foregroundStyle(Theme.foreground)
                .padding(.top, 16)
            Text("Personal life dashboard")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedForeground)
                .padding(.top, 6)

            Spacer()

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Theme.destructive)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 12)
            }

            if !AppConfig.isAuthConfigured {
                Text("Fill in AUTH0_CLIENT_ID and AUTH0_AUDIENCE in apps/ios/Config/Config.xcconfig, then rebuild.")
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 12)
            }

            Button {
                signIn()
            } label: {
                ZStack {
                    Text("Continue with Google")
                        .font(.body.weight(.medium))
                        .opacity(isSigningIn ? 0 : 1)
                    if isSigningIn {
                        ProgressView()
                            .tint(.white)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
            }
            .background(Theme.primary)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .disabled(isSigningIn || !AppConfig.isAuthConfigured)
        }
        .padding(24)
        .padding(.bottom, 24)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.easeOut(duration: 0.15)) { appeared = true }
        }
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
