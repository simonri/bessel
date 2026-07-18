import SwiftUI

struct CellVoltagesView: View {
    let reading: BmsReading

    @State private var selectedCell: Int?

    private static let tickSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            chart
            summary
        }
    }

    private var header: some View {
        HStack {
            if let selectedCell, selectedCell <= reading.cellVoltages.count {
                Text("Cell \(selectedCell)")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Theme.foreground)
                Text(reading.cellVoltages[selectedCell - 1], format: .number.precision(.fractionLength(3)))
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(Theme.mutedForeground)
                + Text(" V")
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
            } else {
                Text("Cell voltages")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Theme.mutedForeground)
            }
            Spacer()
            if reading.balancerActive {
                HStack(spacing: 5) {
                    Circle()
                        .fill(Theme.positive)
                        .frame(width: 6, height: 6)
                    Text("Balancing")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
        }
    }

    private var chart: some View {
        let voltages = reading.cellVoltages
        let axis = axisBounds(for: voltages)
        let balancingCells = Set(reading.balancing?.balancingCells ?? [])

        return VStack(spacing: 6) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(Array(voltages.enumerated()), id: \.offset) { index, voltage in
                    let cell = index + 1
                    let fraction = max((voltage - axis.lo) / (axis.hi - axis.lo), 0.02)
                    VStack(spacing: 0) {
                        Spacer(minLength: 0)
                        RoundedRectangle(cornerRadius: 2)
                            .fill(barColor(cell: cell))
                            .frame(height: max(120 * fraction, 3))
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        selectedCell = selectedCell == cell ? nil : cell
                    }
                }
            }
            .frame(height: 120)
            HStack(alignment: .top, spacing: 3) {
                ForEach(Array(voltages.indices), id: \.self) { index in
                    let cell = index + 1
                    VStack(spacing: 3) {
                        Text(cellLabel(cell) ?? " ")
                            .font(.system(size: 9))
                            .monospacedDigit()
                            .foregroundStyle(cell == selectedCell ? Theme.foreground : Theme.mutedForeground.opacity(0.7))
                        Circle()
                            .fill(Theme.positive)
                            .frame(width: 4, height: 4)
                            .opacity(balancingCells.contains(cell) ? 1 : 0)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var summary: some View {
        HStack(spacing: 0) {
            summaryStat("Min", value: reading.cellVoltageMinV.formatted(.number.precision(.fractionLength(3))), unit: "V")
            summaryStat("Avg", value: reading.cellVoltageAvgV.formatted(.number.precision(.fractionLength(3))), unit: "V")
            summaryStat("Max", value: reading.cellVoltageMaxV.formatted(.number.precision(.fractionLength(3))), unit: "V")
            summaryStat("Delta", value: "\(Int((reading.cellVoltageDeltaV * 1000).rounded()))", unit: "mV")
        }
    }

    private func summaryStat(_ label: String, value: String, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.mutedForeground)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(Theme.foreground)
                Text(unit)
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func barColor(cell: Int) -> Color {
        guard let selectedCell else { return Theme.positive.opacity(0.8) }
        return cell == selectedCell ? Theme.positive : Theme.positive.opacity(0.35)
    }

    /// Show every label up to 12 cells; above that, odd cells plus the selection.
    private func cellLabel(_ cell: Int) -> String? {
        if reading.cellVoltages.count <= 12 || cell % 2 == 1 || cell == selectedCell {
            return String(cell)
        }
        return nil
    }

    /// Auto-scaled axis matching the golfcart web chart: the first "nice" step
    /// yielding at most 4 intervals, bounds floored/ceiled to the step.
    private func axisBounds(for voltages: [Double]) -> (lo: Double, hi: Double) {
        guard let min = voltages.min(), let max = voltages.max() else { return (0, 1) }
        let span = Swift.max(max - min, 0.005)
        let step = Self.tickSteps.first { span / $0 <= 4 } ?? 1
        var lo = (min / step).rounded(.down) * step
        if min - lo < step / 4 { lo -= step }
        var hi = (max / step).rounded(.up) * step
        if hi - max < step / 10 { hi += step }
        return (lo, hi)
    }
}
