import Foundation
@preconcurrency import NetworkExtension
import SystemExtensions

private let controllerKind = "macos-network-extension"
private let controllerVersion = "1.0.0"
private let defaultProviderBundleId = "org.sora.wallet.demo.packet-tunnel"
private let defaultAppGroupId = "group.org.sora.wallet.demo.vpn"
private let defaultManagerDescription = "SORA Wallet VPN"
private let connectPollTimeoutNs: UInt64 = 15_000_000_000
private let disconnectPollTimeoutNs: UInt64 = 10_000_000_000
private let systemExtensionRequestTimeoutNs: UInt64 = 20_000_000_000
private let pollIntervalNs: UInt64 = 250_000_000
private let legacyStatePath =
    "\(NSHomeDirectory())/Library/Application Support/TAIRA Wallet/vpn-controller-state.json"

private struct ConnectPayload: Codable {
    let sessionId: String
    let relayEndpoint: String
    let exitClass: String
    let helperTicketHex: String
    let routePushes: [String]
    let excludedRoutes: [String]
    let dnsServers: [String]
    let tunnelAddresses: [String]
    let mtuBytes: Int
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

private struct ControllerResponse: Codable {
    let installed: Bool
    let active: Bool
    let controller_kind: String
    let interface_name: String?
    let network_service: String?
    let version: String
    let controller_path: String?
    let repair_required: Bool
    let bytes_in: Int
    let bytes_out: Int
    let message: String
}

private struct ResolvedPaths {
    let controllerPath: String?
    let extensionBundleId: String
    let appGroupId: String
    let managerDescription: String
    let stateFilePath: String
    let enginePath: String?
    let extensionPath: String?
}

enum ControllerCommand: String {
    case installCheck = "install-check"
    case status
    case connect
    case disconnect
    case repair
}

private enum ControllerError: LocalizedError {
    case invalidCommand(String)
    case invalidPayload(String)
    case missingPayload
    case managerUnavailable(String)
    case packetTunnelUnavailable(String)
    case systemExtensionApprovalRequired(String)
    case sessionUnavailable
    case timeout(String)

    var errorDescription: String? {
        switch self {
        case .invalidCommand(let value):
            return "unknown command \(value)"
        case .invalidPayload(let detail):
            return detail
        case .missingPayload:
            return "connect payload missing"
        case .managerUnavailable(let detail):
            return detail
        case .packetTunnelUnavailable(let detail):
            return detail
        case .systemExtensionApprovalRequired(let detail):
            return detail
        case .sessionUnavailable:
            return "NETunnelProviderSession is unavailable for the configured manager."
        case .timeout(let detail):
            return detail
        }
    }
}

private extension NEVPNStatus {
    var message: String {
        switch self {
        case .connected:
            return "connected"
        case .connecting:
            return "connecting"
        case .disconnecting:
            return "disconnecting"
        case .reasserting:
            return "reasserting"
        case .invalid:
            return "invalid"
        case .disconnected:
            return "idle"
        @unknown default:
            return "unknown"
        }
    }
}

@main
private enum SoraVpnControllerMain {
    static func main() async {
        do {
            let parsed = try ParsedCommand(arguments: CommandLine.arguments)
            let controller = PacketTunnelController(paths: resolvePaths())
            let response = try await controller.run(command: parsed.command, rawPayload: parsed.payload)
            let data = try JSONEncoder().encode(response)
            FileHandle.standardOutput.write(data)
        } catch {
            let message = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
            FileHandle.standardError.write(Data(message.utf8))
            FileHandle.standardError.write(Data("\n".utf8))
            exit(1)
        }
    }
}

struct ParsedCommand {
    let command: ControllerCommand
    let payload: String?

    init(arguments: [String]) throws {
        let rawCommand = arguments.dropFirst().first ?? ControllerCommand.status.rawValue
        guard let command = ControllerCommand(rawValue: rawCommand) else {
            throw ControllerError.invalidCommand(rawCommand)
        }
        self.command = command
        let remaining = Array(arguments.dropFirst(2)).filter { $0 != "--json" }
        self.payload = remaining.last
    }
}

private final class PacketTunnelController {
    private let paths: ResolvedPaths
    private let fileManager = FileManager.default

    init(paths: ResolvedPaths) {
        self.paths = paths
    }

    func run(command: ControllerCommand, rawPayload: String?) async throws -> ControllerResponse {
        switch command {
        case .installCheck:
            return try await statusResponse(overrideMessage: nil)
        case .status:
            return try await statusResponse(overrideMessage: nil)
        case .connect:
            let payload = try parsePayload(rawPayload)
            return try await connect(payload: payload)
        case .disconnect:
            return try await disconnect(message: nil)
        case .repair:
            return try await repair()
        }
    }

    private func connect(payload: ConnectPayload) async throws -> ControllerResponse {
        try ensureBundledArtifacts()
        let manager = try await loadOrCreateManager()
        try configure(manager: manager, payload: payload)
        try await save(manager: manager)
        try await load(manager: manager)

        guard let session = manager.connection as? NETunnelProviderSession else {
            throw ControllerError.sessionUnavailable
        }

        do {
            try session.startVPNTunnel()
        } catch {
            throw ControllerError.managerUnavailable(
                "Failed to start the macOS PacketTunnel extension: \(error.localizedDescription)"
            )
        }

        _ = try await waitForStatus(
            manager: manager,
            timeoutNs: connectPollTimeoutNs,
            successStatuses: [.connected],
            failureStatuses: [.invalid]
        )
        return try await statusResponse(overrideMessage: nil)
    }

    private func disconnect(message: String?) async throws -> ControllerResponse {
        guard let manager = try await loadManagerIfPresent() else {
            return baseResponse(
                installed: bundledArtifactsAvailable(),
                active: false,
                runtime: loadRuntimeState(),
                overrideMessage: message ?? "idle"
            )
        }
        manager.connection.stopVPNTunnel()
        _ = try? await waitForStatus(
            manager: manager,
            timeoutNs: disconnectPollTimeoutNs,
            successStatuses: [.disconnected, .invalid],
            failureStatuses: []
        )
        return try await statusResponse(overrideMessage: message ?? "idle")
    }

    private func repair() async throws -> ControllerResponse {
        if let manager = try await loadManagerIfPresent() {
            manager.connection.stopVPNTunnel()
            _ = try? await waitForStatus(
                manager: manager,
                timeoutNs: disconnectPollTimeoutNs,
                successStatuses: [.disconnected, .invalid],
                failureStatuses: []
            )
            try await remove(manager: manager)
        }
        try? await deactivateSystemExtension()
        try? fileManager.removeItem(atPath: paths.stateFilePath)
        return try await statusResponse(overrideMessage: "repaired")
    }

    private func statusResponse(overrideMessage: String?) async throws -> ControllerResponse {
        let runtime = loadRuntimeState()
        if !bundledArtifactsAvailable() {
            return baseResponse(
                installed: false,
                active: false,
                runtime: runtime,
                overrideMessage: unavailableMessage()
            )
        }

        guard let manager = try await loadManagerIfPresent() else {
            return baseResponse(
                installed: true,
                active: false,
                runtime: runtime,
                overrideMessage: overrideMessage ?? runtime?.message ?? "ready"
            )
        }

        let status = manager.connection.status
        return baseResponse(
            installed: true,
            active: status == .connected,
            runtime: runtime,
            overrideMessage: overrideMessage ?? runtime?.message ?? status.message,
            managerStatus: status
        )
    }

    private func baseResponse(
        installed: Bool,
        active: Bool,
        runtime: RuntimeState?,
        overrideMessage: String,
        managerStatus: NEVPNStatus? = nil
    ) -> ControllerResponse {
        let repairRequired =
            runtime?.repairRequired == true || managerStatus == .invalid
        return ControllerResponse(
            installed: installed,
            active: active,
            controller_kind: controllerKind,
            interface_name: runtime?.interfaceName,
            network_service: runtime?.networkService,
            version: controllerVersion,
            controller_path: paths.controllerPath,
            repair_required: repairRequired,
            bytes_in: runtime?.bytesIn ?? 0,
            bytes_out: runtime?.bytesOut ?? 0,
            message: overrideMessage
        )
    }

    private func parsePayload(_ rawPayload: String?) throws -> ConnectPayload {
        guard let rawPayload, !rawPayload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ControllerError.missingPayload
        }
        guard let data = rawPayload.data(using: .utf8) else {
            throw ControllerError.invalidPayload("connect payload is not valid UTF-8")
        }
        let payload = try JSONDecoder().decode(ConnectPayload.self, from: data)
        guard !payload.sessionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ControllerError.invalidPayload("sessionId must not be empty")
        }
        guard !payload.relayEndpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ControllerError.invalidPayload("relayEndpoint must not be empty")
        }
        guard !payload.helperTicketHex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ControllerError.invalidPayload("helperTicketHex must not be empty")
        }
        guard payload.mtuBytes > 0 else {
            throw ControllerError.invalidPayload("mtuBytes must be greater than zero")
        }
        return payload
    }

    private func ensureBundledArtifacts() throws {
        if paths.extensionPath == nil {
            throw ControllerError.packetTunnelUnavailable(unavailableMessage())
        }
        if paths.enginePath == nil {
            throw ControllerError.packetTunnelUnavailable(unavailableMessage())
        }
    }

    private func bundledArtifactsAvailable() -> Bool {
        paths.extensionPath != nil && paths.enginePath != nil
    }

    private func unavailableMessage() -> String {
        if paths.extensionPath == nil {
            return "Bundled VPN system extension is not installed. Build or package the macOS VPN extension first."
        }
        if paths.enginePath == nil {
            return "Bundled VPN packet engine is not installed. Build or package the macOS packet engine first."
        }
        return "Bundled VPN controller is not installed."
    }

    private func activateSystemExtension() async throws {
        let request = OSSystemExtensionRequest.activationRequest(
            forExtensionWithIdentifier: paths.extensionBundleId,
            queue: .main
        )
        let bridge = SystemExtensionRequestBridge()
        try await bridge.submit(request)
    }

    private func deactivateSystemExtension() async throws {
        let request = OSSystemExtensionRequest.deactivationRequest(
            forExtensionWithIdentifier: paths.extensionBundleId,
            queue: .main
        )
        let bridge = SystemExtensionRequestBridge(ignoreNotFoundErrors: true)
        try await bridge.submit(request)
    }

    private func configure(manager: NETunnelProviderManager, payload: ConnectPayload) throws {
        let config = NETunnelProviderProtocol()
        config.providerBundleIdentifier = paths.extensionBundleId
        config.serverAddress = payload.relayEndpoint
        config.disconnectOnSleep = false
        config.providerConfiguration = [
            "sessionId": payload.sessionId,
            "relayEndpoint": payload.relayEndpoint,
            "exitClass": payload.exitClass,
            "helperTicketHex": payload.helperTicketHex,
            "routePushes": payload.routePushes,
            "excludedRoutes": payload.excludedRoutes,
            "dnsServers": payload.dnsServers,
            "tunnelAddresses": payload.tunnelAddresses,
            "mtuBytes": payload.mtuBytes,
            "stateFilePath": paths.stateFilePath,
            "packetEnginePath": paths.enginePath ?? "",
            "appGroupId": paths.appGroupId,
        ]
        manager.protocolConfiguration = config
        manager.localizedDescription = paths.managerDescription
        manager.isEnabled = true
    }

    private func loadRuntimeState() -> RuntimeState? {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: paths.stateFilePath)) else {
            return nil
        }
        return try? JSONDecoder().decode(RuntimeState.self, from: data)
    }

    private func loadOrCreateManager() async throws -> NETunnelProviderManager {
        if let manager = try await loadManagerIfPresent() {
            return manager
        }
        return NETunnelProviderManager()
    }

    private func loadManagerIfPresent() async throws -> NETunnelProviderManager? {
        let managers = try loadAllManagers()
        return managers.first(where: { manager in
            guard let proto = manager.protocolConfiguration as? NETunnelProviderProtocol else {
                return false
            }
            return proto.providerBundleIdentifier == paths.extensionBundleId
        })
    }

    private func loadAllManagers() throws -> [NETunnelProviderManager] {
        let semaphore = DispatchSemaphore(value: 0)
        var result: [NETunnelProviderManager] = []
        var capturedError: Error?
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error {
                capturedError = ControllerError.managerUnavailable(
                    "Failed to load PacketTunnel preferences: \(error.localizedDescription)"
                )
            } else {
                result = managers ?? []
            }
            semaphore.signal()
        }
        semaphore.wait()
        if let capturedError {
            throw capturedError
        }
        return result
    }

    private func save(manager: NETunnelProviderManager) async throws {
        try performBlockingNetworkExtensionCall {
            manager.saveToPreferences(completionHandler: $0)
        } errorBuilder: {
            ControllerError.managerUnavailable(
                "Failed to save PacketTunnel preferences: \($0.localizedDescription)"
            )
        }
    }

    private func load(manager: NETunnelProviderManager) async throws {
        try performBlockingNetworkExtensionCall {
            manager.loadFromPreferences(completionHandler: $0)
        } errorBuilder: {
            ControllerError.managerUnavailable(
                "Failed to reload PacketTunnel preferences: \($0.localizedDescription)"
            )
        }
    }

    private func remove(manager: NETunnelProviderManager) async throws {
        try performBlockingNetworkExtensionCall {
            manager.removeFromPreferences(completionHandler: $0)
        } errorBuilder: {
            ControllerError.managerUnavailable(
                "Failed to remove PacketTunnel preferences: \($0.localizedDescription)"
            )
        }
    }

    private func waitForStatus(
        manager: NETunnelProviderManager,
        timeoutNs: UInt64,
        successStatuses: Set<NEVPNStatus>,
        failureStatuses: Set<NEVPNStatus>
    ) async throws -> NEVPNStatus {
        let deadline = DispatchTime.now().uptimeNanoseconds + timeoutNs
        while DispatchTime.now().uptimeNanoseconds < deadline {
            let status = manager.connection.status
            if successStatuses.contains(status) {
                return status
            }
            if failureStatuses.contains(status) {
                let runtime = loadRuntimeState()
                throw ControllerError.managerUnavailable(
                    runtime?.message ?? "PacketTunnel entered \(status.message) state."
                )
            }
            try await Task.sleep(nanoseconds: pollIntervalNs)
        }
        throw ControllerError.timeout("Timed out waiting for the macOS PacketTunnel to reach the requested state.")
    }
}

private func performBlockingNetworkExtensionCall(
    _ operation: (@escaping (Error?) -> Void) -> Void,
    errorBuilder: @escaping (Error) -> Error
) throws {
    let semaphore = DispatchSemaphore(value: 0)
    var capturedError: Error?
    operation { error in
        if let error {
            capturedError = errorBuilder(error)
        }
        semaphore.signal()
    }
    semaphore.wait()
    if let capturedError {
        throw capturedError
    }
}

private final class SystemExtensionRequestBridge: NSObject, OSSystemExtensionRequestDelegate {
    private let ignoreNotFoundErrors: Bool
    private var continuation: CheckedContinuation<Void, Error>?
    private var timeoutWorkItem: DispatchWorkItem?

    init(ignoreNotFoundErrors: Bool = false) {
        self.ignoreNotFoundErrors = ignoreNotFoundErrors
    }

    func submit(_ request: OSSystemExtensionRequest) async throws {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let timeoutWorkItem = DispatchWorkItem { [weak self] in
                self?.finish(
                    error: ControllerError.timeout(
                        "Timed out waiting for the macOS VPN system extension request to complete."
                    )
                )
            }
            self.timeoutWorkItem = timeoutWorkItem
            DispatchQueue.main.asyncAfter(
                deadline: .now() + .nanoseconds(Int(systemExtensionRequestTimeoutNs)),
                execute: timeoutWorkItem
            )
            request.delegate = self
            OSSystemExtensionManager.shared.submitRequest(request)
        }
    }

    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        finish(
            error: ControllerError.systemExtensionApprovalRequired(
                "Approve the SORA Wallet VPN system extension in System Settings, then retry the connection."
            )
        )
    }

    func request(
        _ request: OSSystemExtensionRequest,
        actionForReplacingExtension existing: OSSystemExtensionProperties,
        withExtension ext: OSSystemExtensionProperties
    ) -> OSSystemExtensionRequest.ReplacementAction {
        .replace
    }

    func request(
        _ request: OSSystemExtensionRequest,
        foundProperties properties: [OSSystemExtensionProperties]
    ) {}

    func request(
        _ request: OSSystemExtensionRequest,
        didFailWithError error: Error
    ) {
        let nsError = error as NSError
        if ignoreNotFoundErrors && nsError.code == OSSystemExtensionError.extensionNotFound.rawValue {
            finish()
            return
        }
        finish(
            error: ControllerError.managerUnavailable(
                "Failed to activate the macOS VPN system extension: \(error.localizedDescription)"
            )
        )
    }

    func request(
        _ request: OSSystemExtensionRequest,
        didFinishWithResult result: OSSystemExtensionRequest.Result
    ) {
        switch result {
        case .completed:
            finish()
        case .willCompleteAfterReboot:
            finish(
                error: ControllerError.managerUnavailable(
                    "macOS accepted the VPN system extension but requires a reboot before it can connect."
                )
            )
        @unknown default:
            finish(
                error: ControllerError.managerUnavailable(
                    "macOS returned an unknown VPN system extension activation result."
                )
            )
        }
    }

    private func finish(error: Error? = nil) {
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        guard let continuation else {
            return
        }
        self.continuation = nil
        if let error {
            continuation.resume(throwing: error)
        } else {
            continuation.resume()
        }
    }
}

private func resolvePaths(environment: [String: String] = ProcessInfo.processInfo.environment) -> ResolvedPaths {
    let controllerURL = URL(fileURLWithPath: CommandLine.arguments.first ?? "")
    let contentsURL = deriveContentsURL(from: controllerURL)
    let resourcesVpnURL = contentsURL?.appendingPathComponent("Resources").appendingPathComponent("vpn")
    let systemExtensionsURL =
        contentsURL?.appendingPathComponent("Library").appendingPathComponent("SystemExtensions")
    let extensionBundleId = environment["SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID"]
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .flatMap(nonEmpty)
        ?? bundleInfoString("SoraVpnPacketTunnelBundleId")
        ?? defaultProviderBundleId

    let extensionPath = resolveExistingPath(
        explicit: environment["SORANET_VPN_PACKET_TUNNEL"]?.trimmingCharacters(in: .whitespacesAndNewlines),
        fallbacks: [
            systemExtensionsURL?.appendingPathComponent("\(extensionBundleId).systemextension").path,
            contentsURL?.appendingPathComponent("PlugIns").appendingPathComponent("SoraVpnPacketTunnel.appex").path,
        ]
    )
    let enginePath = resolveExistingPath(
        explicit: environment["SORANET_VPN_PACKET_ENGINE"]?.trimmingCharacters(in: .whitespacesAndNewlines),
        fallbacks: [
            resourcesVpnURL?
                .appendingPathComponent("SoraVpnPacketEngine.app")
                .appendingPathComponent("Contents")
                .appendingPathComponent("MacOS")
                .appendingPathComponent("sora-vpn-packet-engine")
                .path,
            resourcesVpnURL?.appendingPathComponent("sora-vpn-packet-engine").path,
        ]
    )
    let appGroupId = environment["SORANET_VPN_APP_GROUP_ID"]
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .flatMap(nonEmpty)
        ?? bundleInfoString("SoraVpnAppGroupId")
        ?? defaultAppGroupId
    let stateFilePath =
        environment["SORANET_VPN_STATE_FILE"]
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .flatMap(nonEmpty)
        ?? appGroupStatePath(appGroupId: appGroupId)
        ?? legacyStatePath

    return ResolvedPaths(
        controllerPath: controllerURL.path.isEmpty ? nil : controllerURL.path,
        extensionBundleId: extensionBundleId,
        appGroupId: appGroupId,
        managerDescription: environment["SORANET_VPN_MANAGER_DESCRIPTION"]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .flatMap(nonEmpty)
            ?? bundleInfoString("SoraVpnManagerDescription")
            ?? defaultManagerDescription,
        stateFilePath: stateFilePath,
        enginePath: enginePath,
        extensionPath: extensionPath
    )
}

private func deriveContentsURL(from controllerURL: URL) -> URL? {
    let bundleURL = Bundle.main.bundleURL.standardizedFileURL
    if bundleURL.pathExtension == "app" || bundleURL.pathExtension == "bundle" {
        let contentsURL = bundleURL.appendingPathComponent("Contents", isDirectory: true)
        if FileManager.default.fileExists(atPath: contentsURL.path) {
            return contentsURL
        }
    }
    let components = controllerURL.pathComponents
    guard let contentsIndex = components.lastIndex(of: "Contents") else {
        return nil
    }
    let prefix = components.prefix(contentsIndex + 1)
    return prefix.dropFirst().reduce(URL(fileURLWithPath: "/")) { partial, component in
        partial.appendingPathComponent(component)
    }
}

private func resolveExistingPath(explicit: String?, fallbacks: [String?]) -> String? {
    if let explicit = explicit.flatMap(nonEmpty), FileManager.default.fileExists(atPath: explicit) {
        return explicit
    }
    for fallback in fallbacks {
        if let path = fallback.flatMap(nonEmpty), FileManager.default.fileExists(atPath: path) {
            return path
        }
    }
    return nil
}

private func appGroupStatePath(appGroupId: String) -> String? {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        return nil
    }
    return containerURL.appendingPathComponent("vpn-controller-state.json").path
}

private func nonEmpty(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

private func bundleInfoString(_ key: String) -> String? {
    guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String else {
        return nil
    }
    return nonEmpty(value)
}
