import Foundation
import Security

/// Errors from the Keychain wrapper.
enum KeychainError: LocalizedError {
    case unexpectedStatus(OSStatus)

    var errorDescription: String? {
        switch self {
        case let .unexpectedStatus(status):
            if let message = SecCopyErrorMessageString(status, nil) as String? {
                return "Keychain error \(status): \(message)"
            }
            return "Keychain error \(status)."
        }
    }
}

/// Minimal generic-password Keychain wrapper for the server API key.
///
/// Items use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so polling can read the key while
/// the app runs in the background, and the key never leaves the device through backups.
struct Keychain {
    let service: String

    static let stemMaster = Keychain(service: "com.mpaudio.stemmaster")
    static let apiKeyAccount = "api-key"

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    /// The stored string, or `nil` if there is none (or it can't be read).
    func string(for account: String) -> String? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Stores `value`, or deletes the item when `value` is `nil` or empty.
    func set(_ value: String?, for account: String) throws {
        let query = baseQuery(account: account)
        guard let value, !value.isEmpty else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                throw KeychainError.unexpectedStatus(status)
            }
            return
        }
        let data = Data(value.utf8)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(updateStatus)
        }
        var addQuery = query
        for (key, item) in attributes {
            addQuery[key] = item
        }
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw KeychainError.unexpectedStatus(addStatus)
        }
    }
}
