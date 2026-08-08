import readline from "node:readline";

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
  const message = JSON.parse(line);
  process.stdout.write(`${JSON.stringify({ kind: "echoed", value: message.value })}\n`);
}
