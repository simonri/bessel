import SwiftUI
import UIKit

/// Bessel's soft palette. Follows the system appearance: a warm cream light
/// theme and a calm near-black dark theme, with the same pastel hues the web
/// app uses (oklch values mirrored from apps/web) so a project, recipe type or
/// sleep stage is the same colour everywhere.
enum Theme {
    /// Space between the navigation bar and a page's first content.
    static let pageTop: CGFloat = 16

    static let background = adaptive(light: .oklch(0.985, 0.006, 70), dark: .oklch(0.15, 0.004, 285))
    static let card = adaptive(light: .oklch(1, 0, 0), dark: .oklch(0.205, 0.005, 285))
    static let fill = adaptive(light: .oklch(0.955, 0.008, 60), dark: .oklch(0.255, 0.006, 285))
    static let foreground = adaptive(light: .oklch(0.24, 0.012, 20), dark: .oklch(0.96, 0.003, 285))
    static let mutedForeground = adaptive(light: .oklch(0.55, 0.012, 30), dark: .oklch(0.68, 0.006, 285))
    static let faintForeground = adaptive(light: .oklch(0.72, 0.01, 30), dark: .oklch(0.5, 0.006, 285))
    static let border = adaptive(light: .oklch(0.24, 0.012, 20, alpha: 0.08), dark: .oklch(1, 0, 0, alpha: 0.09))

    /// Bessel's coral, used for interactive and selected states only.
    static let primary = adaptive(light: .oklch(0.68, 0.16, 32), dark: .oklch(0.74, 0.15, 35))
    static let primarySoft = adaptive(light: .oklch(0.68, 0.16, 32, alpha: 0.12), dark: .oklch(0.74, 0.15, 35, alpha: 0.16))
    static let destructive = adaptive(light: .oklch(0.6, 0.2, 20), dark: .oklch(0.7, 0.18, 20))

    static let positive = adaptive(light: .oklch(0.62, 0.14, 150), dark: .oklch(0.8, 0.15, 150))
    static let warning = adaptive(light: .oklch(0.7, 0.14, 75), dark: .oklch(0.83, 0.14, 80))
    static let info = adaptive(light: .oklch(0.62, 0.12, 240), dark: .oklch(0.76, 0.11, 240))

    static let dueOverdue = adaptive(light: .oklch(0.6, 0.17, 15), dark: .oklch(0.78, 0.12, 15))
    static let dueToday = primary
    static let dueLater = mutedForeground

    /// Text colour of a pastel chip or tint on the given hue.
    static func pastel(_ hue: Double) -> Color {
        adaptive(light: .oklch(0.5, 0.11, hue), dark: .oklch(0.86, 0.08, hue))
    }

    /// Background wash behind `pastel(_:)` text.
    static func pastelWash(_ hue: Double, strength: Double = 1) -> Color {
        adaptive(light: .oklch(0.9, 0.05, hue, alpha: 0.75 * strength), dark: .oklch(0.78, 0.09, hue, alpha: 0.16 * strength))
    }

    /// A solid pastel for dots, bars and fills.
    static func pastelSolid(_ hue: Double) -> Color {
        adaptive(light: .oklch(0.78, 0.1, hue), dark: .oklch(0.78, 0.11, hue))
    }

    static func priorityColor(_ priority: Int) -> Color {
        switch priority {
        case 2: info
        case 3: primary
        case 4: dueOverdue
        default: faintForeground
        }
    }

    private static func adaptive(light: UIColor, dark: UIColor) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }
}

/// Stable pastel hues, picked from a name so a project keeps its colour
/// without anyone choosing one (mirrors apps/web project-colors.ts).
enum PastelHue {
    private static let hues: [Double] = [305, 235, 165, 45, 0, 95, 270, 200]

    static func forName(_ name: String) -> Double {
        var hash: Int32 = 0
        for unit in name.lowercased().utf16 {
            hash = hash &* 31 &+ Int32(unit)
        }
        return hues[Int(hash.magnitude) % hues.count]
    }
}

extension UIColor {
    /// sRGB colour from OKLCH, so values can be copied straight from the web CSS.
    static func oklch(_ lightness: Double, _ chroma: Double, _ hue: Double, alpha: Double = 1) -> UIColor {
        let radians = hue * .pi / 180
        let a = chroma * cos(radians)
        let b = chroma * sin(radians)

        let l = pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
        let m = pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
        let s = pow(lightness - 0.0894841775 * a - 1.2914855480 * b, 3)

        let red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        let green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        let blue = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

        func encode(_ linear: Double) -> CGFloat {
            let clamped = min(max(linear, 0), 1)
            let gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * pow(clamped, 1 / 2.4) - 0.055
            return CGFloat(gamma)
        }
        return UIColor(red: encode(red), green: encode(green), blue: encode(blue), alpha: CGFloat(alpha))
    }
}
