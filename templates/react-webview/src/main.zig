const std = @import("std");
const runner = @import("runner");
const native_sdk = @import("native_sdk");

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

const allowed_origins = [_][]const u8{
    "zero://app",
    "zero://inline",
    "http://127.0.0.1:5173",
};

const bridge_policies = [_]native_sdk.BridgeCommandPolicy{
    .{ .name = "replicator.scenario", .origins = &allowed_origins },
    .{ .name = "replicator.submitResult", .origins = &allowed_origins },
    .{ .name = "replicator.result", .origins = &allowed_origins },
};

const App = struct {
    env_map: *std.process.Environ.Map,
    handlers: [3]native_sdk.BridgeHandler = undefined,
    result: [64 * 1024]u8 = undefined,
    result_len: usize = 0,

    fn app(self: *@This()) native_sdk.App {
        return .{
            .context = self,
            .name = "generated-app",
            .source = native_sdk.frontend.productionSource(.{ .dist = "frontend/dist" }),
            .source_fn = source,
        };
    }

    fn source(context: *anyopaque) anyerror!native_sdk.WebViewSource {
        const self: *@This() = @ptrCast(@alignCast(context));
        return native_sdk.frontend.sourceFromEnv(self.env_map, .{
            .dist = "frontend/dist",
            .entry = "index.html",
        });
    }

    fn bridge(self: *@This()) native_sdk.BridgeDispatcher {
        self.handlers = .{
            .{ .name = "replicator.scenario", .context = self, .invoke_fn = scenario },
            .{ .name = "replicator.submitResult", .context = self, .invoke_fn = submitResult },
            .{ .name = "replicator.result", .context = self, .invoke_fn = readResult },
        };
        return .{
            .policy = .{ .enabled = true, .commands = &bridge_policies },
            .registry = .{ .handlers = &self.handlers },
        };
    }

    fn scenario(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
        _ = invocation;
        _ = output;
        const self: *@This() = @ptrCast(@alignCast(context));
        return self.env_map.get("REPLICATOR_SCENARIO_JSON") orelse "null";
    }

    fn submitResult(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
        const self: *@This() = @ptrCast(@alignCast(context));
        if (invocation.request.payload.len > self.result.len) return error.ResultTooLarge;
        @memcpy(self.result[0..invocation.request.payload.len], invocation.request.payload);
        self.result_len = invocation.request.payload.len;
        return std.fmt.bufPrint(output, "{{\"accepted\":true,\"bytes\":{d}}}", .{self.result_len});
    }

    fn readResult(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
        _ = invocation;
        _ = output;
        const self: *@This() = @ptrCast(@alignCast(context));
        if (self.result_len == 0) return "null";
        return self.result[0..self.result_len];
    }
};

pub fn main(init: std.process.Init) !void {
    var app = App{ .env_map = init.environ_map };
    try runner.runWithOptions(app.app(), .{
        .app_name = "Generated Web App",
        .window_title = "Generated Web App",
        .bundle_id = "dev.replicator.generated-app",
        .bridge = app.bridge(),
        .security = .{
            .navigation = .{ .allowed_origins = &allowed_origins },
        },
    }, init);
}
