import Foundation

/// Daly BMS Modbus-over-GATT wire protocol: frame encoding, CRC, and
/// notification reassembly. Pure functions, no CoreBluetooth.
enum DalyBms {
    static let serviceUUIDString = "FFF0"
    static let notifyUUIDString = "FFF1"
    static let writeUUIDString = "FFF2"

    struct Block {
        let start: UInt16
        let count: UInt16
    }

    static let mainBlock = Block(start: 0x0000, count: 0x50)
    static let mainBlockFallback = Block(start: 0x0000, count: 0x3E)
    static let infoBlock = Block(start: 0x0050, count: 0x20)
    static let settingsBlock = Block(start: 0x0080, count: 0x10)

    static let scanTimeout: Duration = .seconds(10)
    static let connectTimeout: Duration = .seconds(20)
    static let responseTimeout: Duration = .seconds(5)

    static func looksLikeDaly(_ name: String?) -> Bool {
        guard let upper = name?.uppercased() else { return false }
        return upper.hasPrefix("DL-") || upper.contains("DALY")
    }

    static func crc16Modbus<S: Sequence>(_ data: S) -> UInt16 where S.Element == UInt8 {
        var crc: UInt16 = 0xFFFF
        for byte in data {
            crc ^= UInt16(byte)
            for _ in 0..<8 {
                crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xA001 : crc >> 1
            }
        }
        return crc
    }

    /// Read-holding-registers request: `D2 03 startHi startLo countHi countLo`
    /// followed by a little-endian Modbus CRC16.
    static func request(_ block: Block) -> Data {
        let frame: [UInt8] = [
            0xD2, 0x03,
            UInt8(block.start >> 8), UInt8(block.start & 0xFF),
            UInt8(block.count >> 8), UInt8(block.count & 0xFF),
        ]
        let crc = crc16Modbus(frame)
        return Data(frame + [UInt8(crc & 0xFF), UInt8(crc >> 8)])
    }

    /// Parses an accumulated notification buffer. Returns nil while the frame
    /// is still incomplete; throws on a corrupt header or CRC. A complete
    /// frame is `D2 03 <byteCount> <payload...> <crcLo crcHi>` where payload
    /// holds big-endian uint16 registers.
    static func parseFrame(_ buffer: Data) throws -> [UInt16]? {
        guard buffer.count >= 3 else { return nil }
        let bytes = [UInt8](buffer)
        let expected = 3 + Int(bytes[2]) + 2
        guard bytes.count >= expected else { return nil }
        guard bytes[0] == 0xD2, bytes[1] == 0x03 else { throw BmsError.badFrame }
        let crc = UInt16(bytes[expected - 2]) | (UInt16(bytes[expected - 1]) << 8)
        guard crc == crc16Modbus(bytes[0..<(expected - 2)]) else { throw BmsError.badFrame }
        return stride(from: 3, to: expected - 3, by: 2).map { i in
            UInt16(bytes[i]) << 8 | UInt16(bytes[i + 1])
        }
    }
}

enum BmsError: Error, LocalizedError, Equatable {
    case bluetoothOff
    case unauthorized
    case unsupported
    case deviceNotFound
    case connectFailed
    case disconnected
    case timeout
    case badFrame
    case malformedData

    var errorDescription: String? {
        switch self {
        case .bluetoothOff: "Bluetooth is turned off."
        case .unauthorized: "Bessel doesn't have Bluetooth access."
        case .unsupported: "Bluetooth is not available on this device."
        case .deviceNotFound: "No battery monitor found nearby."
        case .connectFailed: "Couldn't connect to the battery monitor."
        case .disconnected: "The connection to the battery monitor was lost."
        case .timeout: "The battery monitor didn't respond in time."
        case .badFrame: "Received a corrupt response from the battery monitor."
        case .malformedData: "The battery monitor sent an unexpected response."
        }
    }
}
