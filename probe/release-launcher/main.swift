import Foundation

guard let resources = Bundle.main.resourceURL else {
    fputs("Replicator resources are unavailable\n", stderr)
    exit(1)
}

let fileManager = FileManager.default
let configuredDataRoot = ProcessInfo.processInfo.environment["REPLICATOR_DATA_ROOT"]
let dataRoot = configuredDataRoot.map { URL(fileURLWithPath: $0, isDirectory: true) }
    ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Replicator", isDirectory: true)
try fileManager.createDirectory(at: dataRoot, withIntermediateDirectories: true)

let relativeReferencePath = "utilities/focus-sprint/references/focus-sprint-reference-dark.png"
let referenceURL = dataRoot.appendingPathComponent(relativeReferencePath)
let bundledReferenceURL = resources
    .appendingPathComponent("reference-images/focus-sprint-reference-dark.png")
try fileManager.createDirectory(
    at: referenceURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
)
if !fileManager.fileExists(atPath: referenceURL.path) {
    try fileManager.copyItem(at: bundledReferenceURL, to: referenceURL)
}
let referenceSize = try fileManager.attributesOfItem(atPath: referenceURL.path)[.size] as? NSNumber
let referencePayload: [[String: Any]] = [[
    "id": "focus-sprint-dark",
    "path": relativeReferencePath,
    "mediaType": "image/png",
    "size": referenceSize?.intValue ?? 0,
    "width": 1536,
    "height": 1024,
]]
let referenceData = try JSONSerialization.data(withJSONObject: referencePayload)
guard let referenceJSON = String(data: referenceData, encoding: .utf8) else {
    fputs("Replicator reference metadata is unavailable\n", stderr)
    exit(1)
}

let executable = Bundle.main.bundleURL
    .appendingPathComponent("Contents/MacOS/ReplicatorBuilder", isDirectory: false)
var environment = ProcessInfo.processInfo.environment
environment["REPLICATOR_NODE_PATH"] = resources
    .appendingPathComponent("toolchains/node/bin/node").path
environment["REPLICATOR_WORKER_PATH"] = resources
    .appendingPathComponent("worker/index.js").path
environment["REPLICATOR_NATIVE_PATH"] = resources
    .appendingPathComponent("toolchains/native-cli/node_modules/@native-sdk/cli-darwin-arm64/bin/native").path
environment["REPLICATOR_TEMPLATE_ROOT"] = resources
    .appendingPathComponent("templates", isDirectory: true).path
environment["REPLICATOR_DATA_ROOT"] = dataRoot.path
environment["REPLICATOR_REFERENCE_JSON"] = referenceJSON

let process = Process()
process.executableURL = executable
process.arguments = Array(CommandLine.arguments.dropFirst())
process.environment = environment
process.currentDirectoryURL = dataRoot
try process.run()
process.waitUntilExit()
exit(process.terminationStatus)
