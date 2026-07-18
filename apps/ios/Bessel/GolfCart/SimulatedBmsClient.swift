import Foundation

/// Canned readings for the iOS Simulator, which has no Bluetooth radio.
@MainActor
final class SimulatedBmsClient: BmsClient {
    static var simulateAlarms = false

    private var soc = 76.4

    func connect() async throws -> String? {
        try await Task.sleep(for: .seconds(1.5))
        return "DL-40D63C321EF6"
    }

    func readAll() async throws -> BmsReading {
        try await Task.sleep(for: .milliseconds(400))
        soc = max(soc - 0.1, 5)

        let cellCount = 16
        var main = [UInt16](repeating: 0, count: 80)
        for i in 0..<cellCount {
            main[i] = UInt16(3310 + (i * 7 + Int(soc * 10)) % 25)
        }
        let cells = main[0..<cellCount]
        main[32] = 40 + 18
        main[33] = 40 + 21
        main[40] = UInt16((Double(cells.reduce(0) { $0 + Int($1) }) / 100).rounded())
        main[41] = 30000 - 124
        main[42] = UInt16(soc * 10)
        main[43] = cells.max()!
        main[44] = cells.min()!
        main[45] = 40 + 21
        main[46] = 40 + 18
        main[47] = 2
        main[48] = UInt16(soc / 100 * 105 * 10)
        main[49] = UInt16(cellCount)
        main[50] = 2
        main[51] = 42
        main[52] = 1
        main[53] = 1
        main[54] = 1
        main[55] = UInt16(cells.reduce(0) { $0 + Int($1) } / cellCount)
        main[56] = main[43] - main[44]
        if Self.simulateAlarms {
            main[58] = 0x0004
        }
        main[64] = 30000 + 4
        main[65] = 0b0000_0000_0010_0100
        main[66] = 40 + 24
        main[67] = 0xFFFF

        let model = "DL-XY24S150A"
        let modelBytes = [UInt8](model.utf8)
        let info = stride(from: 0, to: 32, by: 1).map { i -> UInt16 in
            let hi = i * 2 < modelBytes.count ? modelBytes[i * 2] : 0
            let lo = i * 2 + 1 < modelBytes.count ? modelBytes[i * 2 + 1] : 0
            return UInt16(hi) << 8 | UInt16(lo)
        }

        return try BmsReading.decode(main: main, info: info, settings: [1050] + [UInt16](repeating: 0, count: 15))
    }

    func disconnect() {}
}
