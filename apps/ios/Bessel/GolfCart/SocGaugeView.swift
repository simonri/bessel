import SwiftUI

struct SocGaugeView: View {
    let socPercent: Double

    private var tone: Color {
        if socPercent <= 15 { Theme.destructive }
        else if socPercent <= 30 { Theme.warning }
        else { Theme.positive }
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.border, lineWidth: 12)
            Circle()
                .trim(from: 0, to: min(max(socPercent, 0), 100) / 100)
                .stroke(tone, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(socPercent, format: .number.precision(.fractionLength(1)))
                        .font(.system(size: 34, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.foreground)
                    Text("%")
                        .font(.headline)
                        .foregroundStyle(Theme.mutedForeground)
                }
                Text("State of charge")
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
        .frame(width: 176, height: 176)
        .animation(.easeOut(duration: 0.3), value: socPercent)
    }
}

struct ModeIndicator: View {
    let mode: BmsReading.Mode

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .medium))
            Text(label)
                .font(.footnote.weight(.medium))
        }
        .foregroundStyle(tone)
    }

    private var label: String {
        switch mode {
        case .charging: "Charging"
        case .discharging: "Discharging"
        case .idle: "Idle"
        }
    }

    private var icon: String {
        switch mode {
        case .charging: "bolt.fill"
        case .discharging: "bolt"
        case .idle: "moon"
        }
    }

    private var tone: Color {
        switch mode {
        case .charging: Theme.positive
        case .discharging: Theme.info
        case .idle: Theme.mutedForeground
        }
    }
}

struct PackStatGrid: View {
    let reading: BmsReading

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], spacing: 20) {
            stat("Voltage", value: reading.voltageV.formatted(.number.precision(.fractionLength(1))), unit: "V")
            stat("Current", value: reading.currentA.formatted(.number.precision(.fractionLength(1))), unit: "A")
            stat("Power", value: reading.powerW.formatted(.number.precision(.fractionLength(0))), unit: "W")
            stat("Remaining", value: reading.remainingCapacityAh.formatted(.number.precision(.fractionLength(1))), unit: "Ah")
        }
    }

    private func stat(_ label: String, value: String, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.footnote)
                .foregroundStyle(Theme.mutedForeground)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(.title3.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(Theme.foreground)
                Text(unit)
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
    }
}
