import SwiftUI

struct LoginView: View {
    let auth: AuthSession

    @State private var isSigningIn = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            Text("Bessel")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Theme.foreground)
            Text("Personal life dashboard")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedForeground)
                .padding(.top, 4)

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
                HStack {
                    if isSigningIn {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Continue with Google")
                            .font(.body.weight(.medium))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
            }
            .background(Theme.primary)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .disabled(isSigningIn || !AppConfig.isAuthConfigured)
        }
        .padding(24)
        .padding(.bottom, 24)
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
