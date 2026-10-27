import SwiftUI
import UIKit

/// Confetti over the whole screen, above sheets and the tab bar: its own
/// transparent window, so it isn't clipped to the dialog that set it off.
@MainActor
enum Confetti {
    private static var window: UIWindow?
    static let duration: TimeInterval = 4.5

    static func fire() {
        guard !UIAccessibility.isReduceMotionEnabled,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive })
        else { return }

        window?.isHidden = true
        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        window.backgroundColor = .clear
        window.isUserInteractionEnabled = false
        let host = UIHostingController(rootView: ConfettiView())
        host.view.backgroundColor = .clear
        host.view.isUserInteractionEnabled = false
        window.rootViewController = host
        window.isHidden = false
        self.window = window

        DispatchQueue.main.asyncAfter(deadline: .now() + duration + 0.2) {
            guard Self.window === window else { return }
            window.isHidden = true
            Self.window = nil
        }
    }
}

/// A burst of paper pieces falling from above the top edge, spread across the
/// whole width, each with its own drift, spin and delay.
private struct ConfettiView: View {
    private struct Piece {
        let x: Double
        let delay: Double
        let drift: Double
        let fall: Double
        let size: CGSize
        let spin: Double
        let phase: Double
        let color: Color
    }

    private static let colors: [Color] = [
        Color(red: 0.93, green: 0.45, blue: 0.36),
        Color(red: 0.98, green: 0.74, blue: 0.40),
        Color(red: 0.55, green: 0.80, blue: 0.66),
        Color(red: 0.60, green: 0.70, blue: 0.95),
        Color(red: 0.85, green: 0.65, blue: 0.90),
    ]

    private let pieces: [Piece] = (0..<110).map { _ in
        let wide = Bool.random()
        return Piece(
            x: .random(in: 0...1),
            delay: .random(in: 0...0.7),
            drift: .random(in: -50...50),
            fall: .random(in: 150...260),
            size: wide ? CGSize(width: 10, height: 6) : CGSize(width: 7, height: 11),
            spin: .random(in: -5...5),
            phase: .random(in: 0...6.28),
            color: colors.randomElement()!
        )
    }

    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let now = timeline.date.timeIntervalSince(start)
                for piece in pieces {
                    let t = now - piece.delay
                    guard t > 0 else { continue }
                    // Quick start, then a slow flutter down.
                    let y = -20 + piece.fall * t + 60 * t * t
                    let x = piece.x * size.width + piece.drift * t + sin(t * 3 + piece.phase) * 14
                    guard y < size.height + 20 else { continue }
                    let fade = min(1, max(0, (Confetti.duration - now) / 1.2))
                    var layer = context
                    layer.opacity = fade
                    layer.translateBy(x: x, y: y)
                    layer.rotate(by: .radians(piece.phase + piece.spin * t))
                    // Turning over as it falls: the piece thins and widens.
                    layer.scaleBy(x: 1, y: 0.35 + 0.65 * abs(cos(t * 4 + piece.phase)))
                    let rect = CGRect(x: -piece.size.width / 2, y: -piece.size.height / 2, width: piece.size.width, height: piece.size.height)
                    layer.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(piece.color))
                }
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
        .onAppear { start = Date() }
    }
}
