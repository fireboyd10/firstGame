import Foundation
import Capacitor
import Network
import UIKit

@objc(PhonePartyPlugin)
public class PhonePartyPlugin: CAPPlugin, CAPBridgedPlugin, NetServiceBrowserDelegate, NetServiceDelegate {
    public let identifier = "PhonePartyPlugin"
    public let jsName = "PhoneParty"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startHost", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopHost", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discover", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "inspectHost", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reply", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sha256", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "RedFlagRush.party")
    private var listener: NWListener?
    private var roomIdentity: PartyTLSIdentity?
    private var pending: [String: NWConnection] = [:]
    private var connections: [UUID: NWConnection] = [:]
    private var browser: NetServiceBrowser?
    private var services: [NetService] = []
    private var searchCall: CAPPluginCall?
    private var searchCode = ""
    private var searchTimeout: DispatchWorkItem?
    private var previousIdleTimer = false
    private var hosting = false

    @objc func startHost(_ call: CAPPluginCall) {
        guard let code = call.getString("code"), code.range(of: "^[A-Z2-9]{6}$", options: .regularExpression) != nil else { call.reject("Invalid room code."); return }
        queue.async {
            self.stopListener()
            do {
                let identity = try PartyTLSIdentity()
                self.roomIdentity = identity
                let parameters = try identity.serverParameters()
                let listener = try NWListener(using: parameters, on: .any)
                let txt = NetService.data(fromTXTRecord: ["version": Data("3".utf8), "fingerprint": Data(identity.fingerprint.utf8), "code": Data(code.utf8)])
                listener.service = NWListener.Service(name: "RFR-" + code, type: "_redflagrush._tcp", txtRecord: txt)
                self.listener = listener
                var completed = false
                let timeout = DispatchWorkItem {
                    guard !completed else { return }; completed = true
                    self.stopListener(); call.reject("Cannot host a room. Connect to Wi-Fi and allow Local Network access in Settings.")
                }
                listener.stateUpdateHandler = { state in
                    guard !completed else { return }
                    switch state {
                    case .ready:
                        guard let port = listener.port, let host = self.wifiAddress() else { completed = true; timeout.cancel(); self.stopListener(); call.reject("Connect this phone to Wi-Fi, then try again."); return }
                        completed = true; timeout.cancel()
                        DispatchQueue.main.async {
                            self.previousIdleTimer = UIApplication.shared.isIdleTimerDisabled
                            self.hosting = true; UIApplication.shared.isIdleTimerDisabled = true
                        }
                        call.resolve(["host": host, "port": Int(port.rawValue), "fingerprint": identity.fingerprint])
                    case .failed:
                        completed = true; timeout.cancel(); self.stopListener(); call.reject("Cannot share the room. Check Wi-Fi and Local Network access in Settings.")
                    default: break
                    }
                }
                listener.newConnectionHandler = { connection in
                    guard self.connections.count < 24 else { connection.cancel(); return }
                    let id = UUID(); self.connections[id] = connection
                    connection.stateUpdateHandler = { state in
                        if case .failed = state { self.connections.removeValue(forKey: id); connection.cancel() }
                        if case .cancelled = state { self.connections.removeValue(forKey: id) }
                    }
                    connection.start(queue: self.queue)
                    self.readMessage(connection, buffer: Data()) { data in
                        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                              let method = object["method"] as? String, ["GET", "POST"].contains(method),
                              let path = object["path"] as? String, path.hasPrefix("/api/") else { connection.cancel(); return }
                        let requestID = UUID().uuidString
                        self.pending[requestID] = connection
                        var event = object; event["id"] = requestID
                        if case let .hostPort(host, _) = connection.endpoint { event["peer"] = String(describing: host) }
                        DispatchQueue.main.async { self.notifyListeners("request", data: event) }
                        self.queue.asyncAfter(deadline: .now() + 7) {
                            if let waiting = self.pending.removeValue(forKey: requestID) { waiting.cancel() }
                        }
                    }
                    self.queue.asyncAfter(deadline: .now() + 8) { connection.cancel(); self.connections.removeValue(forKey: id) }
                }
                self.queue.asyncAfter(deadline: .now() + 8, execute: timeout)
                listener.start(queue: self.queue)
            } catch { self.stopListener(); call.reject("Could not create a secure Wi-Fi room.") }
        }
    }
    private func stopListener() {
        listener?.stateUpdateHandler = nil; listener?.newConnectionHandler = nil
        listener?.cancel(); listener = nil
        for connection in connections.values { connection.stateUpdateHandler = nil; connection.cancel() }
        connections.removeAll(); pending.removeAll()
        roomIdentity = nil
        DispatchQueue.main.async {
            if self.hosting { UIApplication.shared.isIdleTimerDisabled = self.previousIdleTimer; self.hosting = false }
        }
    }
    @objc func stopHost(_ call: CAPPluginCall) { queue.async { self.stopListener(); call.resolve() } }
    @objc func sha256(_ call: CAPPluginCall) {
        let value = call.getString("value") ?? ""
        guard value.count <= 64 else { call.reject("Input too long."); return }
        call.resolve(["digest": PartyTLSIdentity.digest(Data(value.utf8))])
    }
    @objc func reply(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing request ID."); return }
        let value: [String: Any] = ["status": call.getInt("status") ?? 500, "data": call.getObject("data") ?? [:]]
        queue.async {
            guard let connection = self.pending.removeValue(forKey: id), var data = try? JSONSerialization.data(withJSONObject: value), data.count <= 65536 else { call.resolve(); return }
            data.append(10)
            connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
            call.resolve()
        }
    }
    private func readMessage(_ connection: NWConnection, buffer: Data, done: @escaping (Data) -> Void) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, complete, error in
            var next = buffer; if let data = data { next.append(data) }
            if next.count > 65536 { connection.cancel(); return }
            if let end = next.firstIndex(of: 10) { done(Data(next[..<end])); return }
            if complete || error != nil { connection.cancel(); return }
            self.readMessage(connection, buffer: next, done: done)
        }
    }
    @objc func request(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), let port = call.getInt("port"), let tcpPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)), port > 0 && port <= 65535, isLocalAddress(host) else { call.reject("Use a local Wi-Fi address."); return }
        let request: [String: Any] = ["method": call.getString("method") ?? "GET", "path": call.getString("path") ?? "", "token": call.getString("token") ?? "", "body": call.getObject("body") ?? [:]]
        guard var data = try? JSONSerialization.data(withJSONObject: request), data.count <= 65536 else { call.reject("Invalid room request."); return }; data.append(10)
        queue.async {
            guard let parameters = try? PartyTLSIdentity.clientParameters(pin: call.getString("fingerprint") ?? "", queue: self.queue) else { call.reject("Missing verified room identity. Join again with the host's security code."); return }
            let connection = NWConnection(host: NWEndpoint.Host(host), port: tcpPort, using: parameters)
            var completed = false
            let fail = {
                guard !completed else { return }; completed = true; connection.stateUpdateHandler = nil; connection.cancel()
                call.reject("Secure connection failed. Check Wi-Fi and the host's security code. Rejoin if the host restarted the room.")
            }
            connection.stateUpdateHandler = { state in
                if case .failed = state { fail() }
                if case .ready = state {
                    connection.send(content: data, completion: .contentProcessed { error in if error != nil { fail() } })
                    self.readMessage(connection, buffer: Data()) { response in
                        guard !completed else { return }
                        guard let result = try? JSONSerialization.jsonObject(with: response) as? [String: Any] else { fail(); return }
                        completed = true; connection.stateUpdateHandler = nil; connection.cancel(); call.resolve(result)
                    }
                }
            }
            self.queue.asyncAfter(deadline: .now() + 8) { fail() }
            connection.start(queue: self.queue)
        }
    }
    @objc func inspectHost(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), let port = call.getInt("port"), port > 0 && port <= 65535,
              let tcpPort = NWEndpoint.Port(rawValue: UInt16(port)), isLocalAddress(host) else { call.reject("Use the host's local Wi-Fi address."); return }
        queue.async {
            var fingerprint = ""
            guard let parameters = try? PartyTLSIdentity.clientParameters(pin: call.getString("securityCode") ?? "", queue: self.queue, pairingProbe: true,
                                                                          verified: { fingerprint = $0 }) else { call.reject("Enter the security code shown on the host phone."); return }
            let connection = NWConnection(host: NWEndpoint.Host(host), port: tcpPort, using: parameters)
            var completed = false
            let fail = {
                guard !completed else { return }; completed = true; connection.stateUpdateHandler = nil; connection.cancel()
                call.reject("Cannot verify this host. Check its security code, Wi-Fi and Local Network access.")
            }
            connection.stateUpdateHandler = { state in
                if case .failed = state { fail() }
                if case .ready = state {
                    guard !completed, !fingerprint.isEmpty else { fail(); return }
                    completed = true; connection.stateUpdateHandler = nil; connection.cancel()
                    call.resolve(["host": host, "port": port, "fingerprint": fingerprint])
                }
            }
            self.queue.asyncAfter(deadline: .now() + 8) { fail() }
            connection.start(queue: self.queue)
        }
    }
    @objc func discover(_ call: CAPPluginCall) {
        guard let code = call.getString("code"), code.range(of: "^[A-Z2-9]{6}$", options: .regularExpression) != nil else { call.reject("Enter the six-character room code."); return }
        DispatchQueue.main.async {
            guard self.searchCall == nil else { call.reject("Already looking for a room. Try again shortly."); return }
            self.searchCall = call; self.searchCode = code; self.services = []
            let browser = NetServiceBrowser(); browser.delegate = self; self.browser = browser
            let timeout = DispatchWorkItem { self.finishSearch(nil, error: "Room not found. Keep the host game open, use the same Wi-Fi, and allow Local Network access in Settings. Guest Wi-Fi may block connections between phones.") }
            self.searchTimeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 7, execute: timeout)
            browser.searchForServices(ofType: "_redflagrush._tcp.", inDomain: "local.")
        }
    }
    public func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        guard service.name.hasPrefix("RFR-" + searchCode) else { return }
        services.append(service); service.delegate = self; service.resolve(withTimeout: 5)
    }
    public func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) { finishSearch(nil, error: "Cannot search Wi-Fi. Allow Local Network access in Settings.") }
    public func netServiceDidResolveAddress(_ service: NetService) {
        guard let data = service.txtRecordData() else { return }
        let txt = NetService.dictionary(fromTXTRecord: data)
        guard txt["version"] == Data("3".utf8), let pinData = txt["fingerprint"],
              let fingerprint = String(data: pinData, encoding: .utf8), fingerprint.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else { return }
        let addresses = service.addresses ?? []
        for family in [Int32(AF_INET), Int32(AF_INET6)] {
            for data in addresses {
                let host = data.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) -> String? in
                    guard let pointer = bytes.baseAddress?.assumingMemoryBound(to: sockaddr.self), Int32(pointer.pointee.sa_family) == family else { return nil }
                    var name = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    guard getnameinfo(pointer, socklen_t(data.count), &name, socklen_t(name.count), nil, 0, NI_NUMERICHOST) == 0 else { return nil }
                    return String(cString: name)
                }
                if let host = host, isLocalAddress(host) { finishSearch(["host": host, "port": service.port, "fingerprint": fingerprint], error: nil); return }
            }
        }
    }
    private func finishSearch(_ endpoint: [String: Any]?, error: String?) {
        let call = searchCall; searchCall = nil
        searchTimeout?.cancel(); searchTimeout = nil; browser?.stop(); browser = nil
        for service in services { service.stop(); service.delegate = nil }; services = []
        if let endpoint = endpoint { call?.resolve(endpoint) } else { call?.reject(error ?? "Room not found.") }
    }
    private func isLocalAddress(_ host: String) -> Bool {
        let parts = host.split(separator: ".").compactMap { Int($0) }
        if parts.count == 4 && parts.allSatisfy({ $0 >= 0 && $0 <= 255 }) {
            return parts[0] == 10 || parts[0] == 127 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] == 169 && parts[1] == 254)
        }
        let value = host.lowercased()
        return value.hasPrefix("fe80:") || value.hasPrefix("fc") && value.contains(":") || value.hasPrefix("fd") && value.contains(":") || value == "::1"
    }
    private func wifiAddress() -> String? {
        var interfaces: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&interfaces) == 0 else { return nil }; defer { freeifaddrs(interfaces) }
        var current = interfaces
        var fallback: String?
        while let pointer = current {
            defer { current = pointer.pointee.ifa_next }
            guard String(cString: pointer.pointee.ifa_name) == "en0", let address = pointer.pointee.ifa_addr else { continue }
            let family = Int32(address.pointee.sa_family)
            guard family == AF_INET || family == AF_INET6 else { continue }
            var name = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(address, socklen_t(address.pointee.sa_len), &name, socklen_t(name.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let host = String(cString: name)
            if isLocalAddress(host) { if family == AF_INET { return host }; fallback = host }
        }
        return fallback
    }
    deinit { listener?.cancel(); browser?.stop(); for connection in connections.values { connection.cancel() } }
}

class GameViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(PhonePartyPlugin()) }
}
