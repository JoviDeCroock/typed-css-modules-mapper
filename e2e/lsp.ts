import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import type { MessageConnection } from "vscode-jsonrpc/node";

export interface Position {
  line: number;
  character: number;
}

export interface Location {
  uri: string;
  range: { start: Position; end: Position };
}

export interface Server {
  open(path: string): void;
  request<T>(method: string, path: string, position: Position): Promise<T>;
  close(): Promise<void>;
}

/** Starts a compiler's language server with content mappers enabled. */
export async function startServer(bin: string, rootPath: string): Promise<Server> {
  const child = spawn(bin, ["--lsp", "--stdio"], { stdio: ["pipe", "pipe", "ignore"] });
  const connection: MessageConnection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  connection.onRequest(() => null);
  connection.onNotification(() => {});
  connection.listen();

  await connection.sendRequest("initialize", {
    processId: process.pid,
    rootUri: pathToFileURL(rootPath).href,
    capabilities: {},
    initializationOptions: { runExternalCode: true },
    workspaceFolders: [{ uri: pathToFileURL(rootPath).href, name: "fixture" }],
  });
  connection.sendNotification("initialized", {});

  return {
    open(path: string) {
      connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: pathToFileURL(path).href,
          languageId: "typescript",
          version: 1,
          text: readFileSync(path, "utf8"),
        },
      });
    },
    request<T>(method: string, path: string, position: Position): Promise<T> {
      return connection.sendRequest(method, {
        textDocument: { uri: pathToFileURL(path).href },
        position,
      });
    },
    async close() {
      await connection.sendRequest("shutdown").catch(() => {});
      connection.sendNotification("exit");
      connection.dispose();
      child.kill();
    },
  };
}
