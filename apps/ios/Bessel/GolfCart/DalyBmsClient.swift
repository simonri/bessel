import CoreBluetooth
import Foundation

/// CoreBluetooth client for the Daly BMS. The central manager is created with
/// `queue: nil`, so every delegate callback arrives on the main queue and the
/// whole class stays in the MainActor isolation domain — continuations and
/// timeouts never race.
@MainActor
final class DalyBmsClient: NSObject, BmsClient {
    private static let serviceUUID = CBUUID(string: DalyBms.serviceUUIDString)
    private static let notifyUUID = CBUUID(string: DalyBms.notifyUUIDString)
    private static let writeUUID = CBUUID(string: DalyBms.writeUUIDString)

    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?

    private var powerContinuation: CheckedContinuation<Void, Error>?
    private var scanContinuation: CheckedContinuation<CBPeripheral, Error>?
    private var connectContinuation: CheckedContinuation<Void, Error>?
    private var setupContinuation: CheckedContinuation<Void, Error>?
    private var frameContinuation: CheckedContinuation<[UInt16], Error>?
    private var timeoutTask: Task<Void, Never>?
    private var rxBuffer = Data()

    func connect() async throws -> String? {
        disconnect()
        let central = CBCentralManager(delegate: self, queue: nil)
        self.central = central

        try await awaitPoweredOn(central)
        let peripheral = try await scan(central)
        self.peripheral = peripheral
        peripheral.delegate = self

        try await withTimeout(DalyBms.connectTimeout, onTimeout: BmsError.connectFailed) { cont in
            self.connectContinuation = cont
            central.connect(peripheral)
        }
        try await withTimeout(DalyBms.connectTimeout, onTimeout: BmsError.connectFailed) { cont in
            self.setupContinuation = cont
            peripheral.discoverServices([Self.serviceUUID])
        }
        return peripheral.name
    }

    func readAll() async throws -> BmsReading {
        let main: [UInt16]
        do {
            main = try await readRegisters(DalyBms.mainBlock)
        } catch BmsError.timeout, BmsError.badFrame {
            main = try await readRegisters(DalyBms.mainBlockFallback)
        }
        let info = try? await readRegisters(DalyBms.infoBlock)
        let settings = try? await readRegisters(DalyBms.settingsBlock)
        return try BmsReading.decode(main: main, info: info, settings: settings)
    }

    func disconnect() {
        timeoutTask?.cancel()
        timeoutTask = nil
        failPending(with: CancellationError())
        if let central {
            if central.isScanning { central.stopScan() }
            if let peripheral { central.cancelPeripheralConnection(peripheral) }
        }
        central?.delegate = nil
        central = nil
        peripheral = nil
        writeCharacteristic = nil
        rxBuffer.removeAll()
    }

    // MARK: - Connection phases

    private func awaitPoweredOn(_ central: CBCentralManager) async throws {
        if let error = Self.powerError(central.state) { throw error }
        guard central.state != .poweredOn else { return }
        // State is .unknown while CoreBluetooth starts up (or while the user
        // answers the first-launch permission prompt) — wait, no timeout.
        try await withCheckedThrowingContinuation { cont in
            powerContinuation = cont
        }
    }

    private static func powerError(_ state: CBManagerState) -> BmsError? {
        switch state {
        case .poweredOff: .bluetoothOff
        case .unauthorized: .unauthorized
        case .unsupported: .unsupported
        default: nil
        }
    }

    private func scan(_ central: CBCentralManager) async throws -> CBPeripheral {
        // Daly advertisements don't reliably include the FFF0 service, so
        // scan unfiltered and match on name.
        defer { if central.isScanning { central.stopScan() } }
        return try await withTimeout(DalyBms.scanTimeout, onTimeout: BmsError.deviceNotFound) { cont in
            self.scanContinuation = cont
            central.scanForPeripherals(withServices: nil)
        }
    }

    // MARK: - Register reads

    private func readRegisters(_ block: DalyBms.Block) async throws -> [UInt16] {
        guard let peripheral, let writeCharacteristic else { throw BmsError.disconnected }
        rxBuffer.removeAll()
        peripheral.writeValue(DalyBms.request(block), for: writeCharacteristic, type: .withResponse)
        return try await withTimeout(DalyBms.responseTimeout, onTimeout: BmsError.timeout) { cont in
            self.frameContinuation = cont
        }
    }

    // MARK: - Continuation plumbing

    private func withTimeout<T>(
        _ timeout: Duration,
        onTimeout error: BmsError,
        start: @escaping (CheckedContinuation<T, Error>) -> Void
    ) async throws -> T {
        defer {
            timeoutTask?.cancel()
            timeoutTask = nil
        }
        return try await withCheckedThrowingContinuation { cont in
            start(cont)
            timeoutTask = Task { [weak self] in
                try? await Task.sleep(for: timeout)
                guard !Task.isCancelled else { return }
                self?.failPending(with: error)
            }
        }
    }

    /// Resumes whichever phase continuation is pending with an error.
    /// Take-and-nil on the MainActor guarantees each resumes at most once.
    private func failPending(with error: Error) {
        if let cont = powerContinuation { powerContinuation = nil; cont.resume(throwing: error) }
        if let cont = scanContinuation { scanContinuation = nil; cont.resume(throwing: error) }
        if let cont = connectContinuation { connectContinuation = nil; cont.resume(throwing: error) }
        if let cont = setupContinuation { setupContinuation = nil; cont.resume(throwing: error) }
        if let cont = frameContinuation { frameContinuation = nil; cont.resume(throwing: error) }
    }
}

// The central manager is created with `queue: nil`, so every callback below
// arrives on the main queue; `MainActor.assumeIsolated` makes that explicit.
extension DalyBmsClient: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        MainActor.assumeIsolated {
            if central.state == .poweredOn {
                if let cont = powerContinuation {
                    powerContinuation = nil
                    cont.resume()
                }
            } else if let error = Self.powerError(central.state) {
                failPending(with: error)
            }
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        guard DalyBms.looksLikeDaly(peripheral.name) || DalyBms.looksLikeDaly(advertisedName) else {
            return
        }
        MainActor.assumeIsolated {
            if let cont = scanContinuation {
                scanContinuation = nil
                central.stopScan()
                cont.resume(returning: peripheral)
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        MainActor.assumeIsolated {
            if let cont = connectContinuation {
                connectContinuation = nil
                cont.resume()
            }
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            failPending(with: BmsError.connectFailed)
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            writeCharacteristic = nil
            failPending(with: BmsError.disconnected)
        }
    }
}

extension DalyBmsClient: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        MainActor.assumeIsolated {
            guard error == nil,
                  let service = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID })
            else {
                failPending(with: BmsError.connectFailed)
                return
            }
            peripheral.discoverCharacteristics([Self.notifyUUID, Self.writeUUID], for: service)
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            let characteristics = service.characteristics ?? []
            guard error == nil,
                  let notify = characteristics.first(where: { $0.uuid == Self.notifyUUID }),
                  let write = characteristics.first(where: { $0.uuid == Self.writeUUID })
            else {
                failPending(with: BmsError.connectFailed)
                return
            }
            writeCharacteristic = write
            peripheral.setNotifyValue(true, for: notify)
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            guard let cont = setupContinuation else { return }
            setupContinuation = nil
            if error == nil, characteristic.isNotifying {
                cont.resume()
            } else {
                cont.resume(throwing: BmsError.connectFailed)
            }
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            guard frameContinuation != nil, error == nil, let data = characteristic.value else { return }
            rxBuffer.append(data)
            do {
                guard let registers = try DalyBms.parseFrame(rxBuffer) else { return }
                if let cont = frameContinuation {
                    frameContinuation = nil
                    cont.resume(returning: registers)
                }
            } catch {
                failPending(with: error)
            }
        }
    }
}
