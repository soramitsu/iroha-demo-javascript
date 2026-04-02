// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "sora-vpn-controller",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .executable(name: "sora-vpn-controller", targets: ["SoraVpnController"]),
    ],
    targets: [
        .executableTarget(
            name: "SoraVpnController",
            path: "Sources/SoraVpnController"
        ),
        .testTarget(
            name: "SoraVpnControllerTests",
            dependencies: ["SoraVpnController"],
            path: "Tests/SoraVpnControllerTests"
        ),
    ]
)
