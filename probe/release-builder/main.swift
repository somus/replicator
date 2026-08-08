import AppKit
import Foundation

let app = NSApplication.shared
app.setActivationPolicy(.regular)

let window = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: 520, height: 320),
    styleMask: [.titled, .closable, .miniaturizable],
    backing: .buffered,
    defer: false
)
window.title = "Replicator Package Probe"
window.center()
window.makeKeyAndOrderFront(nil)

let support: URL
if let configured = ProcessInfo.processInfo.environment["REPLICATOR_DATA_ROOT"] {
    support = URL(fileURLWithPath: configured, isDirectory: true)
} else {
    support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Replicator", isDirectory: true)
}
try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
try "launch=PASS\n".write(
    to: support.appendingPathComponent("package-launch.txt"),
    atomically: true,
    encoding: .utf8
)

app.activate(ignoringOtherApps: true)
app.run()
