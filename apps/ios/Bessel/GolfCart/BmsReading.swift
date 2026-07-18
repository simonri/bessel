import Foundation

/// A decoded snapshot of the Daly BMS state, mirroring the golfcart register
/// layout: cells at 0-31 (mV), temperature sensors at 32-39 (offset -40 °C),
/// pack metrics at 40-57, alarm registers at 58-61, balancing at 62+.
/// Currents use a 30000 offset in units of 0.1 A (positive = charging).
struct BmsReading: Equatable {
    enum Mode: Equatable {
        case idle
        case charging
        case discharging

        init(register: UInt16) {
            switch register {
            case 1: self = .charging
            case 2: self = .discharging
            default: self = .idle
            }
        }
    }

    struct Balancing: Equatable {
        var balanceCurrentA: Double
        var balancingCells: [Int]
        var mosfetTemperatureC: Double?
        var boardTemperatureC: Double?
    }

    var voltageV: Double
    var currentA: Double
    var powerW: Double
    var socPercent: Double
    var remainingCapacityAh: Double
    var ratedCapacityAh: Double?
    var mode: Mode
    var cycles: Int
    var cellCount: Int
    var cellVoltages: [Double]
    var cellVoltageMaxV: Double
    var cellVoltageMinV: Double
    var cellVoltageAvgV: Double
    var cellVoltageDeltaV: Double
    var temperatureSensorCount: Int
    var temperatures: [Double]
    var temperatureMaxC: Double
    var temperatureMinC: Double
    var balancerActive: Bool
    var chargingMosfet: Bool
    var dischargingMosfet: Bool
    var alarmMask: UInt64
    var alarmMessages: [String]
    var balancing: Balancing?
    var deviceModel: String?

    var hasAlarms: Bool { alarmMask != 0 }

    static func decode(main: [UInt16], info: [UInt16]?, settings: [UInt16]?) throws -> BmsReading {
        guard main.count >= 62 else { throw BmsError.malformedData }

        let cellCount = min(Int(main[49]), 32)
        let sensorCount = min(Int(main[50]), 8)
        let voltage = Double(main[40]) / 10
        let current = (Double(main[41]) - 30000) / 10

        let alarmMask = UInt64(main[58]) << 48 | UInt64(main[59]) << 32
            | UInt64(main[60]) << 16 | UInt64(main[61])

        var balancing: Balancing?
        if main.count > 66 {
            balancing = Balancing(
                balanceCurrentA: (Double(main[64]) - 30000) / 10,
                balancingCells: (0..<16).compactMap { main[65] & (1 << $0) != 0 ? $0 + 1 : nil }
            )
            if main[66] != 0xFFFF {
                balancing?.mosfetTemperatureC = Double(main[66]) - 40
            }
            if main.count > 67, main[67] != 0xFFFF {
                balancing?.boardTemperatureC = Double(main[67]) - 40
            }
        }

        var deviceModel: String?
        if let info {
            let bytes = info.flatMap { [UInt8($0 >> 8), UInt8($0 & 0xFF)] }
            let trimmed = bytes.drop { $0 == 0x00 || $0 == 0xFF }
                .reversed().drop { $0 == 0x00 || $0 == 0xFF }.reversed()
            let model = String(decoding: Array(trimmed), as: UTF8.self)
            deviceModel = model.isEmpty ? nil : model
        }

        return BmsReading(
            voltageV: voltage,
            currentA: current,
            powerW: (voltage * current * 10).rounded() / 10,
            socPercent: Double(main[42]) / 10,
            remainingCapacityAh: Double(main[48]) / 10,
            ratedCapacityAh: settings.flatMap { $0.first.map { Double($0) / 10 } },
            mode: Mode(register: main[47]),
            cycles: Int(main[51]),
            cellCount: cellCount,
            cellVoltages: main[0..<cellCount].map { Double($0) / 1000 },
            cellVoltageMaxV: Double(main[43]) / 1000,
            cellVoltageMinV: Double(main[44]) / 1000,
            cellVoltageAvgV: Double(main[55]) / 1000,
            cellVoltageDeltaV: Double(main[56]) / 1000,
            temperatureSensorCount: sensorCount,
            temperatures: main[32..<(32 + sensorCount)].map { Double($0) - 40 },
            temperatureMaxC: Double(main[45]) - 40,
            temperatureMinC: Double(main[46]) - 40,
            balancerActive: main[52] != 0,
            chargingMosfet: main[53] != 0,
            dischargingMosfet: main[54] != 0,
            alarmMask: alarmMask,
            alarmMessages: (0..<64).compactMap { bit in
                guard alarmMask & (1 << bit) != 0 else { return nil }
                let message = Self.alarmMessages[bit]
                return message.isEmpty ? nil : message
            },
            balancing: balancing,
            deviceModel: deviceModel
        )
    }

    // Alarm registers 58-61 (Alarm1-4) form one 64-bit bitmask, MSB-first
    // (Alarm1 << 48 | Alarm2 << 32 | Alarm3 << 16 | Alarm4). Bit-to-message
    // mapping reverse-engineered by https://github.com/syssi/esphome-daly-bms
    // (not officially documented by Daly); "" marks unused bits, "Reserved"
    // marks bits Daly reserved but hasn't assigned a meaning to.
    static let alarmMessages: [String] =
        Array(repeating: "", count: 16) + [
            "Charging MOS over-temperature warning",
            "Discharging MOS over-temperature warning",
            "Charging MOS temperature sensor failure",
            "Discharging MOS temperature sensor failure",
            "Charging MOS adhesion failure",
            "Discharging MOS adhesion failure",
            "Charging MOS circuit fault",
            "Discharging MOS circuit fault",
            "AFE acquisition chip failure",
            "Single unit collection is offline",
            "Single temperature sensor failure",
            "EEPROM storage failure",
            "RTC clock failure",
            "Precharge failed",
            "Vehicle communication failed",
            "Internal network communication module failure",
            "Warning: Charging current too high",
            "Critical: Charging current too high",
            "Warning: Discharging current too low",
            "Critical: Discharging current too low",
            "Warning: SOC too high",
            "Critical: SOC too high",
            "Warning: SOC too low",
            "Critical: SOC too low",
            "Warning: Voltage difference too high",
            "Critical: Voltage difference too high",
            "Warning: Temperature difference too high",
            "Critical: Temperature difference too high",
            "Reserved",
            "Reserved",
            "Reserved",
            "Reserved",
            "Warning: Cell voltage too high",
            "Critical: Cell voltage too high",
            "Warning: Cell voltage too low",
            "Critical: Cell voltage too low",
            "Warning: Total voltage too high",
            "Critical: Total voltage too high",
            "Warning: Total voltage too low",
            "Critical: Total voltage too low",
            "Warning: Charging temperature too high",
            "Critical: Charging temperature too high",
            "Warning: Charging temperature too low",
            "Critical: Charging temperature too low",
            "Warning: Discharging temperature too high",
            "Critical: Discharging temperature too high",
            "Warning: Discharging temperature too low",
            "Critical: Discharging temperature too low",
        ]
}
