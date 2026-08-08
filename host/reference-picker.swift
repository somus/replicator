import AppKit
import Foundation
import UniformTypeIdentifiers

let maximumSelections = 4
let maximumLineBytes = 3 * 1024

func emit(_ value: [String: Any]) -> Bool {
    guard let data = try? JSONSerialization.data(withJSONObject: value), data.count + 1 < maximumLineBytes else {
        return false
    }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
    return true
}

func emitSelection(_ path: String) -> Bool {
    emit(["type": "selected", "path": path])
}

func finish(count: Int) -> Never {
    guard emit(["type": "done", "count": count]) else { exit(1) }
    exit(0)
}

if CommandLine.arguments.count > 1 {
    switch CommandLine.arguments[1] {
    case "--probe-dismiss":
        finish(count: 0)
    case "--probe-paths":
        let paths = Array(CommandLine.arguments.dropFirst(2))
        guard paths.count <= maximumSelections else {
            _ = emit(["type": "error", "reason": "too many Reference Images"])
            exit(1)
        }
        for path in paths where !emitSelection(path) {
            _ = emit(["type": "error", "reason": "selected path exceeds output limit"])
            exit(1)
        }
        finish(count: paths.count)
    default:
        _ = emit(["type": "error", "reason": "unknown picker probe"])
        exit(1)
    }
}

let panel = NSOpenPanel()
panel.allowedContentTypes = [.png, .jpeg, .webP]
panel.allowsMultipleSelection = true
panel.canChooseFiles = true
panel.canChooseDirectories = false
panel.resolvesAliases = false
panel.prompt = "Attach"
panel.message = "Choose up to four PNG, JPEG, or WebP Reference Images."

guard panel.runModal() == .OK else { finish(count: 0) }
let selections = Array(panel.urls.prefix(maximumSelections))
guard panel.urls.count <= maximumSelections else {
    _ = emit(["type": "error", "reason": "choose at most four Reference Images"])
    exit(1)
}
for selection in selections where !emitSelection(selection.path) {
    _ = emit(["type": "error", "reason": "selected path exceeds output limit"])
    exit(1)
}
finish(count: selections.count)
