import SwiftUI

struct GolfCartView: View {
    /// Panes in MainTabView stay mounted with opacity toggling, so tab
    /// selection is passed in and drives the session task instead of
    /// onAppear/onDisappear.
    let isActive: Bool

    @State private var store = GolfCartStore()
    @Environment(\.scenePhase) private var scenePhase

    private struct SessionID: Equatable {
        var active: Bool
        var attempt: Int
    }

    var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.background)
                .navigationTitle("Golf cart")
                .navigationBarTitleDisplayMode(.inline)
                .task(id: SessionID(active: isActive && scenePhase == .active, attempt: store.attempt)) {
                    guard isActive && scenePhase == .active else { return }
                    await store.run()
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch store.phase {
        case .idle, .connecting:
            VStack(spacing: 12) {
                ProgressView()
                    .tint(Theme.mutedForeground)
                Text("Reading battery over Bluetooth…")
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
            }
        case .live(let reading):
            liveContent(reading)
        case .failed(let error):
            failedState(error)
        }
    }

    private func liveContent(_ reading: BmsReading) -> some View {
        ScrollView {
            VStack(spacing: 28) {
                header(reading)
                if reading.hasAlarms {
                    alarmBanner(reading)
                }
                VStack(spacing: 16) {
                    SocGaugeView(socPercent: reading.socPercent)
                    ModeIndicator(mode: reading.mode)
                }
                PackStatGrid(reading: reading)
                CellVoltagesView(reading: reading)
                detailRows(reading)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .refreshable { await store.refresh() }
    }

    private func header(_ reading: BmsReading) -> some View {
        HStack {
            Text(reading.deviceModel ?? store.deviceName ?? "Unknown device")
            Spacer()
            if let lastUpdated = store.lastUpdated {
                Text("Updated \(lastUpdated.formatted(.relative(presentation: .named)))")
            }
        }
        .font(.footnote)
        .foregroundStyle(Theme.mutedForeground)
    }

    private func alarmBanner(_ reading: BmsReading) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 15, weight: .medium))
            VStack(alignment: .leading, spacing: 4) {
                Text(reading.alarmMessages.isEmpty ? "Unrecognized alarm" : "Active alarm")
                    .font(.footnote.weight(.semibold))
                ForEach(reading.alarmMessages, id: \.self) { message in
                    Text(message)
                        .font(.footnote)
                }
                if reading.alarmMessages.isEmpty {
                    Text("The BMS reported an alarm that couldn't be decoded.")
                        .font(.footnote)
                }
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(Theme.destructive)
        .padding(12)
        .background(Theme.destructive.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
    }

    private func detailRows(_ reading: BmsReading) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Details")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Theme.mutedForeground)
                .padding(.bottom, 4)
            row("Alarms",
                value: reading.hasAlarms
                    ? (reading.alarmMessages.isEmpty ? "Unrecognized" : reading.alarmMessages.joined(separator: ", "))
                    : "None",
                tone: reading.hasAlarms ? Theme.destructive : Theme.positive)
            row("Pack temperature", value: temperatureRange(reading))
            if let mosfetTemp = reading.balancing?.mosfetTemperatureC {
                row("MOSFET temperature", value: "\(formatTemp(mosfetTemp)) °C")
            }
            row("Balancer", value: reading.balancerActive ? "Active" : "Inactive",
                tone: reading.balancerActive ? Theme.positive : nil)
            row("Charging MOSFET", value: reading.chargingMosfet ? "On" : "Off",
                tone: reading.chargingMosfet ? Theme.positive : nil)
            row("Discharging MOSFET", value: reading.dischargingMosfet ? "On" : "Off",
                tone: reading.dischargingMosfet ? Theme.positive : nil)
            row("Cycles", value: String(reading.cycles))
            row("Cells", value: String(reading.cellCount))
            row("Temperature sensors", value: String(reading.temperatureSensorCount))
        }
    }

    private func row(_ label: String, value: String, tone: Color? = nil) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
                Spacer()
                Text(value)
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(tone ?? Theme.foreground)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.vertical, 11)
            Theme.border.frame(height: 0.5)
        }
    }

    private func temperatureRange(_ reading: BmsReading) -> String {
        if reading.temperatureMinC == reading.temperatureMaxC {
            return "\(formatTemp(reading.temperatureMaxC)) °C"
        }
        return "\(formatTemp(reading.temperatureMinC))–\(formatTemp(reading.temperatureMaxC)) °C"
    }

    private func formatTemp(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0)))
    }

    private func failedState(_ error: BmsError) -> some View {
        VStack(spacing: 12) {
            Image(systemName: failedIcon(error))
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(Theme.mutedForeground.opacity(0.4))
            VStack(spacing: 4) {
                Text(failedTitle(error))
                    .font(.body.weight(.medium))
                    .foregroundStyle(Theme.foreground)
                Text(failedHint(error))
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
                    .multilineTextAlignment(.center)
            }
            if error == .unauthorized {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .font(.footnote.weight(.medium))
                .tint(Theme.primary)
                .padding(.top, 4)
            } else {
                Button("Try again") {
                    store.retry()
                }
                .font(.footnote.weight(.medium))
                .tint(Theme.primary)
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 32)
    }

    private func failedIcon(_ error: BmsError) -> String {
        switch error {
        case .bluetoothOff, .unauthorized, .unsupported: "antenna.radiowaves.left.and.right.slash"
        default: "bolt.car"
        }
    }

    private func failedTitle(_ error: BmsError) -> String {
        switch error {
        case .bluetoothOff: "Bluetooth is off"
        case .unauthorized: "Bluetooth access needed"
        case .unsupported: "Bluetooth unavailable"
        default: "Battery not reachable"
        }
    }

    private func failedHint(_ error: BmsError) -> String {
        switch error {
        case .bluetoothOff: "Turn on Bluetooth to read the battery."
        case .unauthorized: "Allow Bluetooth access in Settings to read the battery."
        case .unsupported: "This device can't connect to the battery monitor."
        default: "Make sure the cart is nearby and no other app is connected to it."
        }
    }
}
