import SwiftUI
import UIKit

extension View {
    /// Ends text editing when the user taps anywhere that isn't a text field,
    /// text view or date picker. The tap still reaches whatever was under it,
    /// so buttons, pills and menus keep working.
    func dismissKeyboardOnOutsideTap() -> some View {
        background(OutsideTapRecognizer())
    }
}

/// Installs a tap recognizer on the hosting window for as long as the view is
/// on screen. A window-level recognizer sees taps on every row and control,
/// which a SwiftUI gesture on the container would not without stealing them.
private struct OutsideTapRecognizer: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WindowObservingView {
        let view = WindowObservingView()
        view.isUserInteractionEnabled = false
        view.onWindowChange = { [coordinator = context.coordinator] window in
            coordinator.attach(to: window)
        }
        return view
    }

    func updateUIView(_ uiView: WindowObservingView, context: Context) {}

    static func dismantleUIView(_ uiView: WindowObservingView, coordinator: Coordinator) {
        coordinator.attach(to: nil)
    }

    final class WindowObservingView: UIView {
        var onWindowChange: ((UIWindow?) -> Void)?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            onWindowChange?(window)
        }
    }

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        private lazy var recognizer: UITapGestureRecognizer = {
            let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleTap))
            recognizer.cancelsTouchesInView = false
            recognizer.delegate = self
            return recognizer
        }()

        func attach(to window: UIWindow?) {
            recognizer.view?.removeGestureRecognizer(recognizer)
            window?.addGestureRecognizer(recognizer)
        }

        @objc private func handleTap() {
            recognizer.view?.endEditing(true)
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var view = touch.view
            while let current = view {
                if current is UITextField || current is UITextView || current is UIDatePicker { return false }
                view = current.superview
            }
            return true
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }
    }
}
