import Foundation

/// Build-time configuration injected from Config/Config.xcconfig via Info.plist.
enum AppConfig {
    static let apiBaseURL = URL(string: infoValue("API_BASE_URL"))!
    static let auth0Domain = infoValue("AUTH0_DOMAIN")
    static let auth0ClientID = infoValue("AUTH0_CLIENT_ID")
    static let auth0Audience = infoValue("AUTH0_AUDIENCE")

    /// Baked in at build time rather than derived from Bundle.main.bundleIdentifier:
    /// AltStore rewrites the bundle ID when re-signing, but the URL scheme it
    /// registers (CFBundleURLTypes) and the Auth0 allowlist keep the original value.
    static let authCallbackScheme = infoValue("AUTH_CALLBACK_SCHEME")

    /// Auth0 native callback: <scheme>://<domain>/ios/<scheme>/callback
    static var auth0RedirectURI: String {
        "\(authCallbackScheme)://\(auth0Domain)/ios/\(authCallbackScheme)/callback"
    }

    static var isAuthConfigured: Bool {
        !auth0ClientID.hasPrefix("YOUR_") && !auth0Audience.hasPrefix("YOUR_")
    }

    private static func infoValue(_ key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, !value.isEmpty else {
            fatalError("Missing \(key) — fill in apps/ios/Config/Config.xcconfig and regenerate the project")
        }
        return value
    }
}
