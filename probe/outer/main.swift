import AppKit
import Foundation

enum ProbeFailure: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case .failed(let message): return message
        }
    }
}

struct CommandResult {
    let output: String
    let duration: TimeInterval
}

let fileManager = FileManager.default
let resources = Bundle.main.resourceURL!
let dataRoot = URL(fileURLWithPath: ProcessInfo.processInfo.environment["REPLICATOR_PROBE_DATA_ROOT"] ?? NSTemporaryDirectory())
let evidenceRoot = dataRoot.appendingPathComponent("evidence", isDirectory: true)
let utilityRoot = dataRoot.appendingPathComponent("Utilities/H1Probe/source", isDirectory: true)
let artifactRoot = dataRoot.appendingPathComponent("Utilities/H1Probe/ready", isDirectory: true)
let node = resources.appendingPathComponent("toolchains/node/bin/node")
let nativeCLI = resources.appendingPathComponent("toolchains/native-cli/bin/native.js")
let nativeSDK = resources.appendingPathComponent("toolchains/native-cli")
let zig = resources.appendingPathComponent("toolchains/zig/zig")
let worker = resources.appendingPathComponent("probe/echo-worker.js")
let template = resources.appendingPathComponent("probe/utility-template")

guard !fileManager.fileExists(atPath: dataRoot.path) else {
    throw ProbeFailure.failed("probe data root already exists: choose a fresh path")
}
try fileManager.createDirectory(at: evidenceRoot, withIntermediateDirectories: true)
try fileManager.createDirectory(at: utilityRoot.deletingLastPathComponent(), withIntermediateDirectories: true)
try fileManager.createDirectory(at: artifactRoot, withIntermediateDirectories: true)

var logLines: [String] = []
let started = Date()

func relativeToResources(_ url: URL) -> String {
    url.path.replacingOccurrences(of: resources.path + "/", with: "Contents/Resources/")
}

func run(_ executable: URL, _ arguments: [String], cwd: URL? = nil, input: Data? = nil) throws -> CommandResult {
    let process = Process()
    let stdout = Pipe()
    let stdin = Pipe()
    process.executableURL = executable
    process.arguments = arguments
    process.currentDirectoryURL = cwd
    process.standardOutput = stdout
    process.standardError = stdout
    process.standardInput = stdin
    process.environment = [
        "HOME": dataRoot.path,
        "PATH": "\(node.deletingLastPathComponent().path):/usr/bin:/bin:/usr/sbin:/sbin",
        "NATIVE_SDK_PATH": nativeSDK.path,
        "NATIVE_SDK_ZIG": zig.path,
        "TMPDIR": dataRoot.appendingPathComponent("tmp").path,
    ]
    try fileManager.createDirectory(atPath: process.environment!["TMPDIR"]!, withIntermediateDirectories: true)

    let commandStart = Date()
    try process.run()
    if let input {
        stdin.fileHandleForWriting.write(input)
    }
    try stdin.fileHandleForWriting.close()
    let outputData = stdout.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    let duration = Date().timeIntervalSince(commandStart)
    let output = String(decoding: outputData, as: UTF8.self)
    let rendered = ([relativeToResources(executable)] + arguments.map { $0.replacingOccurrences(of: resources.path, with: "Contents/Resources") }).joined(separator: " ")
    logLines.append("$ \(rendered)")
    logLines.append("duration_seconds=\(String(format: "%.3f", duration)) exit_code=\(process.terminationStatus)")
    logLines.append(output.trimmingCharacters(in: .whitespacesAndNewlines))
    if process.terminationStatus != 0 {
        throw ProbeFailure.failed("command failed (\(process.terminationStatus)): \(rendered)\n\(output)")
    }
    return CommandResult(output: output.trimmingCharacters(in: .whitespacesAndNewlines), duration: duration)
}

func assertEqual(_ actual: String, _ expected: String, _ label: String) throws {
    guard actual == expected else {
        throw ProbeFailure.failed("\(label): expected \(expected), got \(actual)")
    }
}

func writeLog(status: String) {
    logLines.append("status=\(status)")
    logLines.append("total_duration_seconds=\(String(format: "%.3f", Date().timeIntervalSince(started)))")
    try? (logLines.joined(separator: "\n") + "\n").write(
        to: evidenceRoot.appendingPathComponent("outer-probe.log"),
        atomically: true,
        encoding: .utf8
    )
}

do {
    logLines.append("resources=Contents/Resources")
    logLines.append("data_root=probe-data-root")
    logLines.append("node=\(relativeToResources(node))")
    logLines.append("native_cli=\(relativeToResources(nativeCLI))")
    logLines.append("native_sdk=\(relativeToResources(nativeSDK))")
    logLines.append("zig=\(relativeToResources(zig))")
    logLines.append("worker=\(relativeToResources(worker))")
    logLines.append("path_prefix=Contents/Resources/toolchains/node/bin")

    try assertEqual(try run(node, ["--version"]).output, "v24.18.1", "Node version")
    try assertEqual(try run(zig, ["version"]).output, "0.16.0", "Zig version")
    let nativeVersion = try run(node, [nativeCLI.path, "--version"]).output
    guard nativeVersion.hasPrefix("native 0.8.1 ") else {
        throw ProbeFailure.failed("Native version: expected 0.8.1, got \(nativeVersion)")
    }

    let echoRequest = "{\"kind\":\"echo\",\"value\":\"packaged-worker-ok\"}\n"
    let echoResponse = try run(node, [worker.path], input: Data(echoRequest.utf8)).output
    try assertEqual(echoResponse, "{\"kind\":\"echoed\",\"value\":\"packaged-worker-ok\"}", "worker echo")
    try echoResponse.write(to: evidenceRoot.appendingPathComponent("worker-echo.json"), atomically: true, encoding: .utf8)

    try fileManager.copyItem(at: template, to: utilityRoot)
    try fileManager.createDirectory(at: utilityRoot.appendingPathComponent("assets"), withIntermediateDirectories: true)
    try fileManager.copyItem(
        at: nativeSDK.appendingPathComponent("assets/icon.png"),
        to: utilityRoot.appendingPathComponent("assets/icon.png")
    )

    _ = try run(node, [nativeCLI.path, "check", utilityRoot.path], cwd: utilityRoot)
    _ = try run(node, [nativeCLI.path, "build", utilityRoot.path, "--yes"], cwd: utilityRoot)
    let binary = utilityRoot.appendingPathComponent("zig-out/bin/h1-package-probe")
    let packagedApp = artifactRoot.appendingPathComponent("H1 Package Probe.app")
    _ = try run(node, [
        nativeCLI.path, "package", "--target", "macos", "--output", packagedApp.path,
        "--binary", binary.path, "--assets", utilityRoot.appendingPathComponent("zig-out/assets.bundle").path,
        "--signing", "adhoc",
    ], cwd: utilityRoot)

    let launchStart = Date()
    guard NSWorkspace.shared.open(packagedApp) else {
        throw ProbeFailure.failed("NSWorkspace refused to launch packaged Utility")
    }
    logLines.append("launched_bundle=Utilities/H1Probe/ready/H1 Package Probe.app")
    logLines.append("launch_duration_seconds=\(String(format: "%.3f", Date().timeIntervalSince(launchStart)))")
    Thread.sleep(forTimeInterval: 3)
    guard let launched = NSRunningApplication.runningApplications(withBundleIdentifier: "dev.replicator.h1-package-probe").first else {
        throw ProbeFailure.failed("packaged Utility was not running after launch")
    }
    logLines.append("launched_pid=\(launched.processIdentifier)")
    _ = try run(URL(fileURLWithPath: "/usr/sbin/screencapture"), ["-x", evidenceRoot.appendingPathComponent("utility-launched.png").path])
    guard launched.isTerminated == false else {
        throw ProbeFailure.failed("packaged Utility terminated before launch proof")
    }
    launched.terminate()

    writeLog(status: "PASS")
    exit(0)
} catch {
    logLines.append("error=\(error)")
    writeLog(status: "FAIL")
    fputs("H1 packaged-toolchain probe failed: \(error)\n", stderr)
    exit(1)
}
