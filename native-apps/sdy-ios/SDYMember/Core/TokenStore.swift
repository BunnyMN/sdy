// Adapted from Gerege Nexus native-apps/desktop/macos/Core/Keychain/KeychainManager.swift
// Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation.
// Licensed under the Apache License, Version 2.0.

import Foundation
import Security

/// The bearer session token, kept in the Keychain only.
///
/// AfterFirstUnlockThisDeviceOnly: readable after the first unlock so a
/// background-resumed eID poll can still authenticate, and never synced or
/// restored to another device.
final class TokenStore {
    static let shared = TokenStore()

    private let service = "mn.esdy.member"
    private let account = "session_token"
    private let lock = NSLock()
    private var cached: String?
    private var loaded = false

    /// Tests and fixture mode use an in-memory store so the real Keychain is untouched.
    private let inMemory: Bool

    init(inMemory: Bool = false) {
        self.inMemory = inMemory
    }

    var token: String? {
        lock.lock(); defer { lock.unlock() }
        if !loaded && !inMemory {
            cached = readKeychain()
            loaded = true
        }
        return cached
    }

    var hasToken: Bool { !(token ?? "").isEmpty }

    func save(_ token: String) {
        lock.lock(); defer { lock.unlock() }
        cached = token
        loaded = true
        guard !inMemory, let data = token.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    func clear() {
        lock.lock(); defer { lock.unlock() }
        cached = nil
        loaded = true
        guard !inMemory else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func readKeychain() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
