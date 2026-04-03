import Testing
@testable import SoraVpnController

@Test
func parsedCommandAcceptsPayloadAfterConnectSubcommand() throws {
    let command = try ParsedCommand(arguments: [
        "sora-vpn-controller",
        "connect",
        #"{"sessionId":"abc"}"#,
    ])

    #expect(command.command == .connect)
    #expect(command.payload == #"{"sessionId":"abc"}"#)
}

@Test
func parsedCommandIgnoresJsonFlagWhenReadingPayload() throws {
    let command = try ParsedCommand(arguments: [
        "sora-vpn-controller",
        "connect",
        "--json",
        #"{"sessionId":"abc"}"#,
    ])

    #expect(command.command == .connect)
    #expect(command.payload == #"{"sessionId":"abc"}"#)
}
