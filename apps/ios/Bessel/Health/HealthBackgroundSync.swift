import BackgroundTasks
import Foundation
import os

/// Uploads new workouts and sleep now and then while the app is closed, so the
/// web and desktop are up to date without opening the phone app first. iOS
/// decides when it runs; Health can't be read while the phone is locked, in
/// which case it tries again next time.
enum HealthBackgroundSync {
    static let identifier = (Bundle.main.bundleIdentifier ?? "app.bessel") + ".health-sync"
    private static let log = Logger(subsystem: "app.bessel", category: "health-sync")

    /// Must run before the app finishes launching.
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            handle(task)
        }
    }

    /// Asks for the next run, no sooner than an hour from now.
    static func schedule() {
        guard WorkoutSyncAnchor.lastSyncedAt != nil else { return }
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            log.error("Couldn't schedule Health sync: \(String(describing: error), privacy: .public)")
        }
    }

    private static func handle(_ task: BGAppRefreshTask) {
        schedule()
        let work = Task { @MainActor in
            let auth = AuthSession.shared
            if auth.state == .restoring { auth.restore() }
            guard auth.state == .signedIn else { return true }
            let store = HealthStore(client: APIClient(auth: auth), cache: nil)
            return await store.syncInBackground()
        }
        task.expirationHandler = { work.cancel() }
        Task {
            let success = await work.value
            task.setTaskCompleted(success: success)
        }
    }
}
