import Foundation
import os

/// A list that decodes element by element and skips the ones that don't, so
/// one item the app can't read yet doesn't blank the whole screen.
@propertyWrapper
struct Lossy<Element: Decodable>: Decodable {
    var wrappedValue: [Element]

    init(wrappedValue: [Element]) {
        self.wrappedValue = wrappedValue
    }

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var elements: [Element] = []
        var dropped = 0
        while !container.isAtEnd {
            do {
                elements.append(try container.decode(Element.self))
            } catch {
                // A failed decode doesn't move the container on; this does.
                _ = try container.decode(Skipped.self)
                dropped += 1
                LenientDecoding.log.error("Skipped a \(String(describing: Element.self), privacy: .public): \(String(describing: error), privacy: .public)")
            }
        }
        wrappedValue = elements
    }

    private struct Skipped: Decodable {
        init(from decoder: Decoder) throws {}
    }
}

extension Lossy: Encodable where Element: Encodable {
    func encode(to encoder: Encoder) throws {
        try wrappedValue.encode(to: encoder)
    }
}

extension Lossy: Equatable where Element: Equatable {}
extension Lossy: Hashable where Element: Hashable {}

/// A string enum the server may add cases to. Values this build doesn't know
/// decode to `unknown` instead of failing the whole response, which would make
/// a save that worked look like it failed.
protocol LenientEnum: RawRepresentable, Decodable where RawValue == String {
    static var unknown: Self { get }
}

extension LenientEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? .unknown
    }
}

enum LenientDecoding {
    static let log = Logger(subsystem: "app.bessel", category: "decoding")
}
