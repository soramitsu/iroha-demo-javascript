import Foundation

struct ControllerState: Codable {
    var installed: Bool
    var active: Bool
    var controllerKind: String
    var interfaceName: String?
    var networkService: String?
    var version: String
    var controllerPath: String?
    var repairRequired: Bool
    var bytesIn: Int
    var bytesOut: Int
    var message: String
}

struct ConnectPayload: Codable {
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

let statePath = ProcessInfo.processInfo.environment["SORANET_VPN_STATE_FILE"]
    ?? "\(NSHomeDirectory())/Library/Application Support/TAIRA Wallet/vpn-controller-state.json"

func loadState() -> ControllerState {
    guard
        let data = try? Data(contentsOf: URL(fileURLWithPath: statePath)),
        let state = try? JSONDecoder().decode(ControllerState.self, from: data)
    else {
        return ControllerState(
            installed: true,
            active: false,
            controllerKind: "macos-network-extension",
            interfaceName: ProcessInfo.processInfo.environment["SORANET_VPN_INTERFACE"],
            networkService: ProcessInfo.processInfo.environment["SORANET_VPN_NETWORK_SERVICE"],
            version: "0.1.0",
            controllerPath: CommandLine.arguments.first,
            repairRequired: false,
            bytesIn: 0,
            bytesOut: 0,
            message: "ready"
        )
    }
    return state
}

func saveState(_ state: ControllerState) {
    let url = URL(fileURLWithPath: statePath)
    try? FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    if let data = try? JSONEncoder().encode(state) {
        try? data.write(to: url)
    }
}

func printState(_ state: ControllerState) {
    struct Response: Codable {
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

    let response = Response(
        installed: state.installed,
        active: state.active,
        controller_kind: state.controllerKind,
        interface_name: state.interfaceName,
        network_service: state.networkService,
        version: state.version,
        controller_path: state.controllerPath,
        repair_required: state.repairRequired,
        bytes_in: state.bytesIn,
        bytes_out: state.bytesOut,
        message: state.message
    )
    let data = try! JSONEncoder().encode(response)
    FileHandle.standardOutput.write(data)
}

let command = CommandLine.arguments.dropFirst().first ?? "status"
var state = loadState()
state.controllerPath = CommandLine.arguments.first

switch command {
case "install-check":
    state.message = state.repairRequired ? "repair required" : "ready"
case "status":
    break
case "connect":
    if CommandLine.arguments.count > 3,
       let payloadData = CommandLine.arguments.last?.data(using: .utf8),
       let payload = try? JSONDecoder().decode(ConnectPayload.self, from: payloadData) {
        state.active = true
        state.message = "connected \(payload.sessionId)"
        if state.interfaceName == nil {
            state.interfaceName = ProcessInfo.processInfo.environment["SORANET_VPN_INTERFACE"] ?? "utun7"
        }
    } else {
        state.repairRequired = true
        state.message = "connect payload missing"
    }
case "disconnect":
    state.active = false
    state.message = "idle"
case "repair":
    state.repairRequired = false
    state.message = "repaired"
default:
    state.repairRequired = true
    state.message = "unknown command"
}

saveState(state)
printState(state)
