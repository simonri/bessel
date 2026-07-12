import SwiftUI

/// Bessel dark palette, ported from packages/ui/src/styles/globals.css (.dark, oklch → sRGB).
/// The app is dark-only, matching DESIGN.md.
enum Theme {
    static let background = Color(hex: 0x060708)        // oklch(0.125 0.004 250)
    static let card = Color(hex: 0x101213)              // oklch(0.18 0.004 250)
    static let popover = Color(hex: 0x151618)           // oklch(0.20 0.004 250)
    static let foreground = Color(hex: 0xF1F2F3)        // oklch(0.96 0.002 250)
    static let mutedForeground = Color(hex: 0x8B8E91)   // oklch(0.645 0.006 250)
    static let primary = Color(hex: 0xF86F3C)           // oklch(0.70 0.18 40)
    static let primary400 = Color(hex: 0xFF8D5E)        // oklch(0.78 0.17 40)
    static let destructive = Color(hex: 0xF93F4E)       // oklch(0.65 0.22 22)
    static let border = Color.white.opacity(0.11)       // oklch(1 0 0 / 11%)
    static let input = Color.white.opacity(0.14)

    // Priority colors, mirroring apps/web/src/lib/task-format.ts
    static func priorityColor(_ priority: Int) -> Color {
        switch priority {
        case 1: .white.opacity(0.4)
        case 2: Color(hex: 0x60A5FA)
        case 3: primary400
        case 4: Color(hex: 0xF87171)
        default: .white.opacity(0.2)
        }
    }

    static let dueOverdue = Color(hex: 0xF87171)
    static let dueToday = primary400
    static let dueLater = Color.white.opacity(0.4)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
