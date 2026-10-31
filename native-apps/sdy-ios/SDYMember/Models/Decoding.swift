import Foundation

/// A list the Go API may send as `null` (a nil slice) or leave out. Decodes
/// either as an empty list, so one missing array never blanks a screen.
@propertyWrapper
struct DefaultEmpty<T: Decodable & Hashable>: Decodable, Hashable {
    var wrappedValue: [T]
    init(wrappedValue: [T] = []) { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        wrappedValue = container.decodeNil() ? [] : try container.decode([T].self)
    }
}

extension KeyedDecodingContainer {
    func decode<T>(_ type: DefaultEmpty<T>.Type, forKey key: Key) throws -> DefaultEmpty<T> {
        try decodeIfPresent(type, forKey: key) ?? DefaultEmpty()
    }
}

/// A boolean that is false when absent or null.
@propertyWrapper
struct DefaultFalse: Decodable, Hashable {
    var wrappedValue: Bool
    init(wrappedValue: Bool = false) { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        wrappedValue = container.decodeNil() ? false : try container.decode(Bool.self)
    }
}

extension KeyedDecodingContainer {
    func decode(_ type: DefaultFalse.Type, forKey key: Key) throws -> DefaultFalse {
        try decodeIfPresent(type, forKey: key) ?? DefaultFalse()
    }
}

/// A string that is "" when absent or null.
@propertyWrapper
struct DefaultText: Decodable, Hashable {
    var wrappedValue: String
    init(wrappedValue: String = "") { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        wrappedValue = container.decodeNil() ? "" : try container.decode(String.self)
    }
}

extension KeyedDecodingContainer {
    func decode(_ type: DefaultText.Type, forKey key: Key) throws -> DefaultText {
        try decodeIfPresent(type, forKey: key) ?? DefaultText()
    }
}

/// A number that is 0 when absent or null.
@propertyWrapper
struct DefaultZero: Decodable, Hashable {
    var wrappedValue: Double
    init(wrappedValue: Double = 0) { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        wrappedValue = container.decodeNil() ? 0 : try container.decode(Double.self)
    }
}

extension KeyedDecodingContainer {
    func decode(_ type: DefaultZero.Type, forKey key: Key) throws -> DefaultZero {
        try decodeIfPresent(type, forKey: key) ?? DefaultZero()
    }
}
