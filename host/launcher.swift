import Darwin
import Foundation

func fail(_ message: String) -> Never {
    fputs("Replicator launcher: \(message)\n", stderr)
    exit(1)
}

guard let bundleResources = Bundle.main.resourceURL else {
    fail("bundle resources are unavailable")
}

let fileManager = FileManager.default
let resources = bundleResources
let dataRoot = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("Replicator", isDirectory: true)

func seedPreparedDemoIfNeeded() throws {
    let registry = dataRoot.appendingPathComponent("registry.json")
    guard !fileManager.fileExists(atPath: registry.path) else { return }

    let preparedResources = resources.appendingPathComponent("prepared-demo", isDirectory: true)
    let preparedData = preparedResources.appendingPathComponent("data", isDirectory: true)
    let preparedArtifact = preparedResources.appendingPathComponent("Focus Sprint.app", isDirectory: true)
    guard fileManager.fileExists(atPath: preparedData.appendingPathComponent("registry.json").path),
          fileManager.fileExists(atPath: preparedArtifact.path) else {
        throw LauncherError.failed("Prepared Demo resources are unavailable")
    }

    let parent = dataRoot.deletingLastPathComponent()
    try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)
    if fileManager.fileExists(atPath: dataRoot.path) {
        guard try fileManager.contentsOfDirectory(atPath: dataRoot.path).isEmpty else { return }
    }

    let staging = parent.appendingPathComponent(".replicator-prepared-\(UUID().uuidString)", isDirectory: true)
    do {
        try fileManager.copyItem(at: preparedData, to: staging)
        let artifactDestination = staging
            .appendingPathComponent("utilities/focus-sprint/artifacts/d55e6460-01b9-40d3-82ea-efbf3ea8717d", isDirectory: true)
            .appendingPathComponent("Generated App.app", isDirectory: true)
        try fileManager.createDirectory(at: artifactDestination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try fileManager.copyItem(at: preparedArtifact, to: artifactDestination)

        if fileManager.fileExists(atPath: dataRoot.path) {
            guard !fileManager.fileExists(atPath: registry.path),
                  try fileManager.contentsOfDirectory(atPath: dataRoot.path).isEmpty else {
                try? fileManager.removeItem(at: staging)
                return
            }
            try fileManager.removeItem(at: dataRoot)
        }
        try fileManager.moveItem(at: staging, to: dataRoot)
    } catch {
        try? fileManager.removeItem(at: staging)
        throw error
    }
}

do {
    try seedPreparedDemoIfNeeded()
    try fileManager.createDirectory(at: dataRoot, withIntermediateDirectories: true)
    try fileManager.changeCurrentDirectoryPath(dataRoot.path).orThrow("could not enter Application Support")
} catch {
    fail("could not prepare Application Support")
}

let builder = resources.appendingPathComponent("bin/ReplicatorBuilder")
let picker = resources.appendingPathComponent("bin/ReferencePicker")
let node = resources.appendingPathComponent("toolchains/node/bin/node")
let worker = resources.appendingPathComponent("worker/index.js")
let native = resources.appendingPathComponent("toolchains/native-cli/bin/native.js")
let templateRoot = resources.appendingPathComponent("templates", isDirectory: true)
let nativeHome = dataRoot.appendingPathComponent("native-sdk", isDirectory: true)
let nativeLogs = dataRoot.appendingPathComponent("native-logs", isDirectory: true)
let commands = dataRoot.appendingPathComponent("commands", isDirectory: true)

for required in [builder, picker, node] where !fileManager.isExecutableFile(atPath: required.path) {
    fail("a packaged executable is unavailable")
}
for required in [worker, native] where !fileManager.fileExists(atPath: required.path) {
    fail("a packaged resource is unavailable")
}
do {
    try fileManager.createDirectory(at: nativeHome, withIntermediateDirectories: true)
    try fileManager.createDirectory(at: nativeLogs, withIntermediateDirectories: true)
    try fileManager.createDirectory(at: commands, withIntermediateDirectories: true)
} catch {
    fail("could not prepare Native SDK storage")
}

let environment = [
    "REPLICATOR_RESOURCES_ROOT": resources.path,
    "REPLICATOR_DATA_ROOT": dataRoot.path,
    "REPLICATOR_PICKER_PATH": picker.path,
    "REPLICATOR_NODE_PATH": node.path,
    "REPLICATOR_WORKER_PATH": worker.path,
    "REPLICATOR_NATIVE_PATH": native.path,
    "REPLICATOR_TEMPLATE_ROOT": templateRoot.path,
    "NATIVE_SDK_HOME": nativeHome.path,
    "NATIVE_SDK_ZIG": resources.appendingPathComponent("toolchains/zig/zig").path,
    "NATIVE_SDK_LOG_DIR": nativeLogs.path,
    "PATH": "\(resources.appendingPathComponent("toolchains/node/bin").path):\(resources.appendingPathComponent("toolchains/zig").path):/usr/bin:/bin:/usr/sbin:/sbin",
]
for (name, value) in environment where setenv(name, value, 1) != 0 {
    fail("could not set the launch environment")
}

let arguments = [builder.path] + CommandLine.arguments.dropFirst()
let cArguments: [UnsafeMutablePointer<CChar>?] = arguments.map { strdup($0) } + [nil]
defer { cArguments.dropLast().forEach { free($0) } }
_ = cArguments.withUnsafeBufferPointer { buffer in
    execv(builder.path, UnsafeMutablePointer(mutating: buffer.baseAddress))
}
fail("could not start the Native UI")

private extension Bool {
    func orThrow(_ message: String) throws {
        if !self { throw LauncherError.failed(message) }
    }
}

private enum LauncherError: Error {
    case failed(String)
}
