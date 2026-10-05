import Foundation
import Network

@main
enum PartyTLSCheck {
    static func main() throws {
        let identity = try PartyTLSIdentity()
        let queue = DispatchQueue(label: "party-tls-check")
        let listener = try NWListener(using: identity.serverParameters(wifiOnly: false), on: .any)
        let ready = DispatchSemaphore(value: 0)
        var port: NWEndpoint.Port?
        var handled = 0
        var connections = [NWConnection]()
        listener.stateUpdateHandler = { state in
            if case .ready = state { port = listener.port; ready.signal() }
            if case .failed(let error) = state { print("Listener failed: \(error)"); ready.signal() }
        }
        listener.newConnectionHandler = { connection in
            connections.append(connection)
            connection.start(queue: queue)
            func receive(_ buffer: Data) {
                connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, complete, error in
                    var next = buffer; if let data = data { next.append(data) }
                    if next.count > 4096 { connection.cancel(); return }
                    if next.contains(10) {
                        guard next == Data("private nickname and vote\n".utf8) else { connection.cancel(); return }
                        handled += 1
                        connection.send(content: next, completion: .contentProcessed { _ in connection.cancel() })
                    } else if complete || error != nil { connection.cancel() }
                    else { receive(next) }
                }
            }
            receive(Data())
        }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 10) == .success, let port = port else { fatalError("TLS listener did not start") }
        defer { queue.sync { listener.cancel(); for connection in connections { connection.cancel() } } }

        func exchange(_ pin: String, probe: Bool = false, destination: NWEndpoint.Port? = nil) throws -> Bool {
            let complete = DispatchSemaphore(value: 0)
            var finished = false
            var accepted = false
            var actualPin = ""
            let parameters = try PartyTLSIdentity.clientParameters(pin: pin, queue: queue, pairingProbe: probe, wifiOnly: false,
                                                                   verified: { actualPin = $0 })
            let connection = NWConnection(host: "127.0.0.1", port: destination ?? port, using: parameters)
            queue.async {
                func finish(_ success: Bool) {
                    guard !finished else { return }; finished = true; accepted = success
                    connection.stateUpdateHandler = nil; connection.cancel(); complete.signal()
                }
                connection.stateUpdateHandler = { state in
                    if case .failed = state { finish(false) }
                    if case .ready = state {
                        if probe { finish(actualPin == identity.fingerprint); return }
                        connection.send(content: Data("private nickname and vote\n".utf8), completion: .contentProcessed { error in if error != nil { finish(false) } })
                        func receive(_ buffer: Data) {
                            connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, complete, error in
                                var next = buffer; if let data = data { next.append(data) }
                                if next.contains(10) { finish(next == Data("private nickname and vote\n".utf8)) }
                                else if next.count > 4096 || complete || error != nil { finish(false) }
                                else { receive(next) }
                            }
                        }
                        receive(Data())
                    }
                }
                queue.asyncAfter(deadline: .now() + 8) { finish(false) }
                connection.start(queue: queue)
            }
            guard complete.wait(timeout: .now() + 10) == .success else { fatalError("TLS test timed out") }
            return accepted
        }
        guard try exchange(identity.fingerprint) else { fatalError("Pinned iOS TLS exchange failed") }
        guard try !exchange(String(repeating: "0", count: 64)) else { fatalError("Wrong certificate pin was accepted") }
        guard try exchange(String(identity.fingerprint.prefix(12)), probe: true) else { fatalError("Manual pairing probe failed") }
        guard try !exchange(String(repeating: "0", count: 12), probe: true) else { fatalError("Wrong pairing code was accepted") }
        guard queue.sync(execute: { handled }) == 1 else { fatalError("A failed/probe connection transmitted game data") }
        print("PASS: iOS identity creation, TLS echo, wrong-pin rejection, pairing verification and no user data during probes")
        if CommandLine.arguments.count == 3 {
            let java = (ProcessInfo.processInfo.environment["JAVA_HOME"] ?? "") + "/bin/java"
            let classpath = CommandLine.arguments[1]
            let client = Process(); client.executableURL = URL(fileURLWithPath: java)
            client.arguments = ["-cp", classpath, "com.fireboydroid.redflagrush.PartyTlsInterop", "client", String(port.rawValue), identity.fingerprint]
            try client.run(); client.waitUntilExit()
            guard client.terminationStatus == 0 else { fatalError("Android-to-iOS TLS interoperability failed") }
            let server = Process(); server.executableURL = URL(fileURLWithPath: java)
            server.arguments = ["-cp", classpath, "com.fireboydroid.redflagrush.PartyTlsInterop", "server", CommandLine.arguments[2]]
            let output = Pipe(); server.standardOutput = output
            try server.run()
            defer { if server.isRunning { server.terminate(); server.waitUntilExit() } }
            let line = String(data: output.fileHandleForReading.availableData, encoding: .utf8) ?? ""
            let fields = line.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ")
            guard fields.count == 2, let serverPort = UInt16(fields[0]), let destination = NWEndpoint.Port(rawValue: serverPort),
                  try exchange(String(fields[1]), destination: destination) else { fatalError("iOS-to-Android TLS interoperability failed") }
            print("PASS: iOS TLS client to Android TLS server")
        }
    }
}
