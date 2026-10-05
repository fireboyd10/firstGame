import Foundation
import Security
import Network
import CryptoKit

/// Temporary identity for one Wi-Fi room. App Store signing credentials are never accessed.
final class PartyTLSIdentity {
    private let label = "RedFlagRush-party-" + UUID().uuidString
    private var certificate: SecCertificate?
    private(set) var identity: SecIdentity!
    private(set) var fingerprint = ""

    init() throws {
        let tag = Data(label.utf8)
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                kSecAttrLabel as String: label,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            ]
        ]
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error),
              let publicKey = SecKeyCopyPublicKey(key),
              let point = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else { cleanup(); throw Failure.identity }
        do {
            let certificateData = try Self.selfSignedCertificate(key: key, publicPoint: point, name: label)
            guard let certificate = SecCertificateCreateWithData(nil, certificateData as CFData) else { throw Failure.identity }
            self.certificate = certificate
            let addition: [String: Any] = [kSecClass as String: kSecClassCertificate, kSecValueRef as String: certificate,
                                          kSecAttrLabel as String: label, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
            guard SecItemAdd(addition as CFDictionary, nil) == errSecSuccess else { throw Failure.identity }
            // iOS represents a matching certificate/private key pair as an identity.
            let query: [String: Any] = [kSecClass as String: kSecClassIdentity, kSecAttrLabel as String: label,
                                       kSecReturnRef as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
            var result: CFTypeRef?
            guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
                  let value = result, CFGetTypeID(value) == SecIdentityGetTypeID() else { throw Failure.identity }
            identity = (value as! SecIdentity)
            fingerprint = Self.digest(certificateData)
        } catch { cleanup(); throw error }
    }

    deinit { cleanup() }
    private func cleanup() {
        SecItemDelete([kSecClass as String: kSecClassCertificate, kSecAttrLabel as String: label] as CFDictionary)
        SecItemDelete([kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: Data(label.utf8)] as CFDictionary)
    }

    func serverParameters(wifiOnly: Bool = true) throws -> NWParameters {
        let tls = NWProtocolTLS.Options()
        sec_protocol_options_set_min_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
        sec_protocol_options_add_tls_application_protocol(tls.securityProtocolOptions, "rfr-party/3")
        guard let localIdentity = sec_identity_create(identity) else { throw Failure.identity }
        sec_protocol_options_set_local_identity(tls.securityProtocolOptions, localIdentity)
        let parameters = NWParameters(tls: tls, tcp: NWProtocolTCP.Options())
        if wifiOnly { parameters.requiredInterfaceType = .wifi }
        return parameters
    }

    static func clientParameters(pin: String, queue: DispatchQueue, pairingProbe: Bool = false, wifiOnly: Bool = true,
                                 verified: @escaping (String) -> Void = { _ in }) throws -> NWParameters {
        guard pin.range(of: pairingProbe ? "^[0-9a-f]{12}$" : "^[0-9a-f]{64}$", options: .regularExpression) != nil else { throw Failure.pin }
        let tls = NWProtocolTLS.Options()
        sec_protocol_options_set_min_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
        sec_protocol_options_add_tls_application_protocol(tls.securityProtocolOptions, "rfr-party/3")
        sec_protocol_options_set_verify_block(tls.securityProtocolOptions, { _, trust, complete in
            let reference = sec_trust_copy_ref(trust).takeRetainedValue()
            guard let certificate = SecTrustGetCertificateAtIndex(reference, 0) else { complete(false); return }
            let fingerprint = Self.digest(SecCertificateCopyData(certificate) as Data)
            let actual = pairingProbe ? String(fingerprint.prefix(12)) : fingerprint
            // Pin comes from the host's screen before the first join, then stays pinned for reconnects.
            guard actual.utf8.count == pin.utf8.count,
                  zip(actual.utf8, pin.utf8).reduce(UInt8(0), { $0 | ($1.0 ^ $1.1) }) == 0 else { complete(false); return }
            SecTrustSetPolicies(reference, SecPolicyCreateBasicX509())
            SecTrustSetAnchorCertificates(reference, [certificate] as CFArray)
            SecTrustSetAnchorCertificatesOnly(reference, true)
            SecTrustSetNetworkFetchAllowed(reference, false)
            guard SecTrustEvaluateWithError(reference, nil) else { complete(false); return }
            verified(fingerprint); complete(true)
        }, queue)
        let parameters = NWParameters(tls: tls, tcp: NWProtocolTCP.Options())
        if wifiOnly { parameters.requiredInterfaceType = .wifi }
        return parameters
    }

    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    enum Failure: Error { case identity, pin }

    // DER encoding only; key generation and ECDSA signatures use Apple's Security framework.
    private static func der(_ tag: UInt8, _ content: Data) -> Data {
        var length = content.count
        var bytes = Data()
        if length < 128 { bytes.append(UInt8(length)) }
        else {
            var encoded = [UInt8]()
            while length > 0 { encoded.insert(UInt8(length & 255), at: 0); length >>= 8 }
            bytes.append(0x80 | UInt8(encoded.count)); bytes.append(contentsOf: encoded)
        }
        return Data([tag]) + bytes + content
    }
    private static func sequence(_ content: Data) -> Data { der(0x30, content) }
    private static func oid(_ content: [UInt8]) -> Data { der(0x06, Data(content)) }
    private static func selfSignedCertificate(key: SecKey, publicPoint: Data, name: String) throws -> Data {
        let signatureAlgorithm = sequence(oid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02])) // ecdsa-with-SHA256
        let distinguishedName = sequence(der(0x31, sequence(oid([0x55, 0x04, 0x03]) + der(0x0c, Data(name.utf8)))))
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian); formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyMMddHHmmss'Z'"
        let now = Date()
        let validity = sequence(der(0x17, Data(formatter.string(from: now.addingTimeInterval(-300)).utf8)) +
                                der(0x17, Data(formatter.string(from: now.addingTimeInterval(86400)).utf8)))
        var serial = [UInt8](repeating: 0, count: 16)
        guard SecRandomCopyBytes(kSecRandomDefault, serial.count, &serial) == errSecSuccess else { throw Failure.identity }
        serial[0] = (serial[0] & 0x7f) | 1
        let algorithm = sequence(oid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]) + oid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]))
        let publicInfo = sequence(algorithm + der(0x03, Data([0]) + publicPoint))
        let body = sequence(der(0xa0, der(0x02, Data([2]))) + der(0x02, Data(serial)) + signatureAlgorithm +
                            distinguishedName + validity + distinguishedName + publicInfo)
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, body as CFData, &error) as Data? else { throw Failure.identity }
        return sequence(body + signatureAlgorithm + der(0x03, Data([0]) + signature))
    }
}
