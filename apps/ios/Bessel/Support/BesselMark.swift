import SwiftUI

/// The Bessel wave from the landing page logo (apps/landing/src/components/logo.tsx),
/// drawn in a 24×24 unit space and scaled to the smaller edge of the frame.
struct BesselWave: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / 24
        let originX = rect.midX - 12 * scale
        let originY = rect.midY - 12 * scale
        func point(_ x: Double, _ y: Double) -> CGPoint {
            CGPoint(x: originX + x * scale, y: originY + y * scale)
        }

        var path = Path()
        path.move(to: point(2, 12))
        path.addCurve(to: point(6, 12), control1: point(3.2, 5.5), control2: point(4.8, 5.5))
        path.addCurve(to: point(10, 12), control1: point(7.2, 18.5), control2: point(8.8, 18.5))
        path.addCurve(to: point(13, 12), control1: point(10.9, 7.4), control2: point(12.1, 7.4))
        path.addCurve(to: point(16, 12), control1: point(13.9, 15.4), control2: point(15.1, 15.4))
        path.addCurve(to: point(18.5, 12), control1: point(16.7, 9.6), control2: point(17.8, 9.6))
        path.addCurve(to: point(20.5, 12), control1: point(19.1, 13.8), control2: point(19.9, 13.8))
        path.addCurve(to: point(22, 12), control1: point(20.9, 10.9), control2: point(21.5, 10.9))
        return path
    }
}

struct BesselMark: View {
    var size: CGFloat = 24
    var color: Color = Theme.primary

    var body: some View {
        BesselWave()
            .stroke(color, style: StrokeStyle(lineWidth: size / 15, lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
