import Darwin
import Foundation
@preconcurrency import NetworkExtension
import OSLog

private struct PacketTunnelConfiguration: Codable {
    let sessionId: String
    let relayEndpoint: String
    let exitClass: String
    let helperTicketHex: String
    let routePushes: [String]
    let excludedRoutes: [String]
    let dnsServers: [String]
    let tunnelAddresses: [String]
    let mtuBytes: Int
    let stateFilePath: String
    let packetEnginePath: String
    let appGroupId: String
}

private struct RuntimeState: Codable {
    var active: Bool
    var repairRequired: Bool
    var bytesIn: Int
    var bytesOut: Int
    var message: String
    var interfaceName: String?
    var networkService: String?
    var sessionId: String?
}

private struct ParsedCidr {
    let address: String
    let prefix: Int
    let family: Int32
}

private struct PacketDecoder {
    private var buffer = Data()
    private var expectedLength: Int?

    mutating func ingest(_ data: Data) -> [Data] {
        buffer.append(data)
        var packets: [Data] = []
        while true {
            if expectedLength == nil {
                guard buffer.count >= 2 else { break }
                let length = Int(buffer.prefix(2).withUnsafeBytes { pointer in
                    pointer.load(as: UInt16.self).bigEndian
                })
                buffer.removeFirst(2)
                expectedLength = length
            }
            guard let expectedLength else { break }
            guard buffer.count >= expectedLength else { break }
            packets.append(buffer.prefix(expectedLength))
            buffer.removeFirst(expectedLength)
            self.expectedLength = nil
        }
        return packets
    }
}

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let logger = Logger(
        subsystem: "org.sora.wallet.demo.packet-tunnel",
        category: "PacketTunnel"
    )
    private var packetEngineProcess: Process?
    private var packetEngineInput: FileHandle?
    private var packetEngineOutput: FileHandle?
    private var packetEngineStderr: FileHandle?
    private var packetDecoder = PacketDecoder()
    private var configuration: PacketTunnelConfiguration?
    private var stopping = false

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        do {
            let configuration = try normalizedConfiguration(from: loadConfiguration())
            self.configuration = configuration
            self.stopping = false
            logger.notice(
                "startTunnel session=\(configuration.sessionId, privacy: .public) relay=\(configuration.relayEndpoint, privacy: .public) stateFile=\(configuration.stateFilePath, privacy: .public) engine=\(configuration.packetEnginePath, privacy: .public)"
            )
            writeRuntimeState(message: "connecting", active: false, repairRequired: false)
            let settings = try buildNetworkSettings(configuration: configuration)
            setTunnelNetworkSettings(settings) { [weak self] error in
                guard let self else {
                    completionHandler(nil)
                    return
                }
                if let error {
                    self.logger.error(
                        "setTunnelNetworkSettings failed: \(error.localizedDescription, privacy: .public)"
                    )
                    self.writeRuntimeState(
                        message: "Failed to apply macOS PacketTunnel network settings: \(error.localizedDescription)",
                        active: false,
                        repairRequired: true
                    )
                    completionHandler(error)
                    return
                }
                do {
                    self.logger.notice("setTunnelNetworkSettings succeeded")
                    try self.startPacketEngine(configuration: configuration)
                    self.beginPacketPump()
                    self.writeRuntimeState(
                        message: "connected",
                        active: true,
                        repairRequired: false,
                        networkService: "packet-tunnel",
                        sessionId: configuration.sessionId
                    )
                    self.logger.notice("startTunnel completed")
                    completionHandler(nil)
                } catch {
                    self.logger.error(
                        "startPacketEngine failed: \(error.localizedDescription, privacy: .public)"
                    )
                    self.writeRuntimeState(
                        message: "Failed to launch the VPN packet engine: \(error.localizedDescription)",
                        active: false,
                        repairRequired: true,
                        sessionId: configuration.sessionId
                    )
                    completionHandler(error)
                }
            }
        } catch {
            logger.error("startTunnel failed before configuration: \(error.localizedDescription, privacy: .public)")
            writeRuntimeState(
                message: "Failed to start the macOS PacketTunnel: \(error.localizedDescription)",
                active: false,
                repairRequired: true
            )
            completionHandler(error)
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        stopping = true
        packetEngineOutput?.readabilityHandler = nil
        packetEngineStderr?.readabilityHandler = nil
        packetEngineOutput = nil
        packetEngineStderr = nil
        packetEngineInput = nil

        if let process = packetEngineProcess, process.isRunning {
            logger.notice("stopTunnel terminating packet engine pid=\(process.processIdentifier)")
            process.terminate()
        }
        packetEngineProcess = nil
        writeRuntimeState(message: "idle", active: false, repairRequired: false)
        logger.notice("stopTunnel completed reason=\(String(describing: reason.rawValue), privacy: .public)")
        completionHandler()
    }

    private func loadConfiguration() throws -> PacketTunnelConfiguration {
        guard
            let tunnelProtocol = protocolConfiguration as? NETunnelProviderProtocol,
            let providerConfig = tunnelProtocol.providerConfiguration,
            JSONSerialization.isValidJSONObject(providerConfig)
        else {
            throw NSError(
                domain: "SoraVpnPacketTunnel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "PacketTunnel providerConfiguration is missing."]
            )
        }
        let data = try JSONSerialization.data(withJSONObject: providerConfig)
        return try JSONDecoder().decode(PacketTunnelConfiguration.self, from: data)
    }

    private func normalizedConfiguration(from configuration: PacketTunnelConfiguration) -> PacketTunnelConfiguration {
        let resolvedStateFilePath = resolvedStateFilePath(
            explicitPath: configuration.stateFilePath,
            appGroupId: configuration.appGroupId
        ) ?? configuration.stateFilePath
        return PacketTunnelConfiguration(
            sessionId: configuration.sessionId,
            relayEndpoint: configuration.relayEndpoint,
            exitClass: configuration.exitClass,
            helperTicketHex: configuration.helperTicketHex,
            routePushes: configuration.routePushes,
            excludedRoutes: configuration.excludedRoutes,
            dnsServers: configuration.dnsServers,
            tunnelAddresses: configuration.tunnelAddresses,
            mtuBytes: configuration.mtuBytes,
            stateFilePath: resolvedStateFilePath,
            packetEnginePath: configuration.packetEnginePath,
            appGroupId: configuration.appGroupId
        )
    }

    private func startPacketEngine(configuration: PacketTunnelConfiguration) throws {
        guard FileManager.default.isExecutableFile(atPath: configuration.packetEnginePath) else {
            throw NSError(
                domain: "SoraVpnPacketTunnel",
                code: 2,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Packet engine binary is not executable at \(configuration.packetEnginePath)."
                ]
            )
        }

        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        let payload = try JSONEncoder().encode(configuration)
        guard let payloadString = String(data: payload, encoding: .utf8) else {
            throw NSError(
                domain: "SoraVpnPacketTunnel",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "PacketTunnel payload is not valid UTF-8."]
            )
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: configuration.packetEnginePath)
        process.arguments = ["run-packet-engine", payloadString]
        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe
        process.environment = buildEnvironment(configuration: configuration)
        process.terminationHandler = { [weak self] process in
            guard let self, !self.stopping else { return }
            let stderrData = stderrPipe.fileHandleForReading.availableData
            let detail = String(data: stderrData, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            self.logger.error(
                "packet engine terminated status=\(process.terminationStatus) reason=\(String(describing: process.terminationReason.rawValue), privacy: .public) detail=\((detail ?? "").isEmpty ? "<empty>" : detail!, privacy: .public)"
            )
            let message = detail?.isEmpty == false
                ? "VPN packet engine exited unexpectedly: \(detail!)"
                : "VPN packet engine exited unexpectedly."
            self.writeRuntimeState(
                message: message,
                active: false,
                repairRequired: true,
                sessionId: configuration.sessionId
            )
            self.cancelTunnelWithError(
                NSError(
                    domain: "SoraVpnPacketTunnel",
                    code: Int(process.terminationStatus),
                    userInfo: [NSLocalizedDescriptionKey: message]
                )
            )
        }

        stderrPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            let text = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard let self, let text, !text.isEmpty else { return }
            self.logger.error("packet engine stderr: \(text, privacy: .public)")
        }

        logger.notice(
            "launching packet engine path=\(configuration.packetEnginePath, privacy: .public) stateFile=\(configuration.stateFilePath, privacy: .public)"
        )
        try process.run()
        packetEngineProcess = process
        packetEngineInput = stdinPipe.fileHandleForWriting
        packetEngineOutput = stdoutPipe.fileHandleForReading
        packetEngineStderr = stderrPipe.fileHandleForReading
        logger.notice("packet engine launched pid=\(process.processIdentifier)")
    }

    private func beginPacketPump() {
        guard let packetEngineOutput else { return }
        packetEngineOutput.readabilityHandler = { [weak self] handle in
            guard let self else { return }
            let data = handle.availableData
            if data.isEmpty {
                if !self.stopping {
                    self.logger.error("packet engine closed stdout")
                    self.writeRuntimeState(
                        message: "VPN packet engine closed its output stream.",
                        active: false,
                        repairRequired: true
                    )
                    self.cancelTunnelWithError(
                        NSError(
                            domain: "SoraVpnPacketTunnel",
                            code: 4,
                            userInfo: [NSLocalizedDescriptionKey: "VPN packet engine output closed unexpectedly."]
                        )
                    )
                }
                return
            }
            self.forwardPacketsToTunnel(data)
        }
        readPacketsFromSystem()
    }

    private func readPacketsFromSystem() {
        guard !stopping else { return }
        packetFlow.readPackets { [weak self] packets, _ in
            guard let self, !self.stopping else { return }
            do {
                try self.writePacketsToEngine(packets)
                self.readPacketsFromSystem()
            } catch {
                self.writeRuntimeState(
                    message: "Failed to forward system packets to the VPN engine: \(error.localizedDescription)",
                    active: false,
                    repairRequired: true
                )
                self.cancelTunnelWithError(error)
            }
        }
    }

    private func writePacketsToEngine(_ packets: [Data]) throws {
        guard let packetEngineInput else { return }
        for packet in packets {
            var length = UInt16(packet.count).bigEndian
            let prefix = Data(bytes: &length, count: MemoryLayout<UInt16>.size)
            try packetEngineInput.write(contentsOf: prefix)
            try packetEngineInput.write(contentsOf: packet)
        }
    }

    private func forwardPacketsToTunnel(_ data: Data) {
        let packets = packetDecoder.ingest(data)
        guard !packets.isEmpty else { return }
        let protocols = packets.map(protocolNumber(for:))
        packetFlow.writePackets(packets, withProtocols: protocols)
    }

    private func protocolNumber(for packet: Data) -> NSNumber {
        guard let version = packet.first.map({ $0 >> 4 }) else {
            return NSNumber(value: AF_INET)
        }
        return NSNumber(value: version == 6 ? AF_INET6 : AF_INET)
    }

    private func buildEnvironment(configuration: PacketTunnelConfiguration) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        environment["SORANET_VPN_STATE_FILE"] = FileManager.default.temporaryDirectory
            .appendingPathComponent("sora-vpn-packet-engine-state.json")
            .path
        environment["SORANET_VPN_APP_GROUP_ID"] = configuration.appGroupId
        return environment
    }

    private func buildNetworkSettings(configuration: PacketTunnelConfiguration) throws -> NEPacketTunnelNetworkSettings {
        let remoteAddress = parseRemoteAddress(configuration.relayEndpoint) ?? "127.0.0.1"
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: remoteAddress)
        settings.mtu = NSNumber(value: configuration.mtuBytes)
        applyAddresses(configuration.tunnelAddresses, to: settings)
        applyDns(configuration.dnsServers, to: settings)
        applyRoutes(
            included: configuration.routePushes,
            excluded: configuration.excludedRoutes,
            to: settings
        )
        return settings
    }

    private func applyAddresses(_ values: [String], to settings: NEPacketTunnelNetworkSettings) {
        let cidrs = values.compactMap(parseCidr(_:))
        let ipv4 = cidrs.filter { $0.family == AF_INET }
        let ipv6 = cidrs.filter { $0.family == AF_INET6 }

        if !ipv4.isEmpty {
            let addresses = ipv4.map(\.address)
            let masks = ipv4.map(ipv4Mask(for:))
            settings.ipv4Settings = NEIPv4Settings(addresses: addresses, subnetMasks: masks)
        }
        if !ipv6.isEmpty {
            let addresses = ipv6.map(\.address)
            let prefixes = ipv6.map { NSNumber(value: $0.prefix) }
            settings.ipv6Settings = NEIPv6Settings(addresses: addresses, networkPrefixLengths: prefixes)
        }
    }

    private func applyRoutes(
        included: [String],
        excluded: [String],
        to settings: NEPacketTunnelNetworkSettings
    ) {
        let includedCidrs = included.compactMap(parseCidr(_:))
        let excludedCidrs = excluded.compactMap(parseCidr(_:))

        if let ipv4Settings = settings.ipv4Settings {
            ipv4Settings.includedRoutes = includedCidrs
                .filter { $0.family == AF_INET }
                .map(ipv4Route(for:))
            ipv4Settings.excludedRoutes = excludedCidrs
                .filter { $0.family == AF_INET }
                .map(ipv4Route(for:))
        }
        if let ipv6Settings = settings.ipv6Settings {
            ipv6Settings.includedRoutes = includedCidrs
                .filter { $0.family == AF_INET6 }
                .map(ipv6Route(for:))
            ipv6Settings.excludedRoutes = excludedCidrs
                .filter { $0.family == AF_INET6 }
                .map(ipv6Route(for:))
        }
    }

    private func applyDns(_ servers: [String], to settings: NEPacketTunnelNetworkSettings) {
        guard !servers.isEmpty else { return }
        settings.dnsSettings = NEDNSSettings(servers: servers)
    }

    private func parseRemoteAddress(_ value: String) -> String? {
        let components = value.split(separator: "/")
        guard components.count >= 3 else { return nil }
        if components[0] == "ip4" || components[0] == "ip6" {
            return String(components[1])
        }
        if components.count >= 4 && (components[1] == "ip4" || components[1] == "ip6") {
            return String(components[2])
        }
        return nil
    }

    private func parseCidr(_ value: String) -> ParsedCidr? {
        let parts = value.split(separator: "/")
        guard parts.count == 2, let prefix = Int(parts[1]) else { return nil }
        let address = String(parts[0])
        if address.contains(":") {
            return ParsedCidr(address: address, prefix: prefix, family: AF_INET6)
        }
        return ParsedCidr(address: address, prefix: prefix, family: AF_INET)
    }

    private func ipv4Mask(for cidr: ParsedCidr) -> String {
        let prefix = max(0, min(32, cidr.prefix))
        let maskValue = prefix == 0 ? UInt32(0) : (~UInt32(0)) << (32 - prefix)
        return [24, 16, 8, 0]
            .map { String((maskValue >> $0) & 0xff) }
            .joined(separator: ".")
    }

    private func ipv4Route(for cidr: ParsedCidr) -> NEIPv4Route {
        if cidr.prefix == 0 {
            return .default()
        }
        return NEIPv4Route(destinationAddress: cidr.address, subnetMask: ipv4Mask(for: cidr))
    }

    private func ipv6Route(for cidr: ParsedCidr) -> NEIPv6Route {
        if cidr.prefix == 0 {
            return .default()
        }
        return NEIPv6Route(destinationAddress: cidr.address, networkPrefixLength: NSNumber(value: cidr.prefix))
    }

    private func writeRuntimeState(
        message: String,
        active: Bool,
        repairRequired: Bool,
        networkService: String? = nil,
        sessionId: String? = nil
    ) {
        let statePath = resolvedStateFilePath(
            explicitPath: configuration?.stateFilePath,
            appGroupId: configuration?.appGroupId
        )
        guard let statePath else {
            logger.error("runtime state path is unavailable for message=\(message, privacy: .public)")
            return
        }
        let url = URL(fileURLWithPath: statePath)
        let fileManager = FileManager.default
        let existing = (try? Data(contentsOf: url))
            .flatMap { try? JSONDecoder().decode(RuntimeState.self, from: $0) }
        let state = RuntimeState(
            active: active,
            repairRequired: repairRequired,
            bytesIn: existing?.bytesIn ?? 0,
            bytesOut: existing?.bytesOut ?? 0,
            message: message,
            interfaceName: existing?.interfaceName,
            networkService: networkService ?? existing?.networkService,
            sessionId: sessionId ?? existing?.sessionId
        )
        do {
            try fileManager.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let data = try JSONEncoder().encode(state)
            try data.write(to: url)
        } catch {
            logger.error(
                "failed to persist runtime state path=\(statePath, privacy: .public) message=\(message, privacy: .public) error=\(error.localizedDescription, privacy: .public)"
            )
        }
    }

    private func resolvedStateFilePath(explicitPath: String?, appGroupId: String?) -> String? {
        if let appGroupId, !appGroupId.isEmpty,
           let containerURL = FileManager.default.containerURL(
               forSecurityApplicationGroupIdentifier: appGroupId
           ) {
            return containerURL.appendingPathComponent("vpn-controller-state.json").path
        }
        guard let explicitPath, !explicitPath.isEmpty else {
            return nil
        }
        return explicitPath
    }
}
