import { createMessageConnection, ErrorCodes, ResponseError } from "vscode-jsonrpc/node";

import type {
  CloseProjectParams,
  InitializeParams,
  InitializeResult,
  OpenProjectParams,
  OpenProjectResult,
  TransformParams,
  TransformResult,
} from "./protocol.ts";
import { parseOptions } from "./options.ts";
import { transform } from "./transform.ts";
import type { TransformOptions } from "./transform.ts";

const projects = new Map<string, TransformOptions>();

const connection = createMessageConnection(process.stdin, process.stdout);

connection.onRequest("initialize", (params: InitializeParams): InitializeResult => {
  if (!params.positionEncodings.includes("utf-16")) {
    throw new ResponseError(ErrorCodes.InvalidParams, "The host does not support UTF-16 positions");
  }
  return { protocolVersion: 1, positionEncoding: "utf-16", diagnosticSource: "css-modules" };
});

connection.onRequest("openProject", (params: OpenProjectParams): OpenProjectResult => {
  const { options, optionDiagnostics } = parseOptions(params.options ?? {});
  projects.set(params.projectHandle, options);
  return optionDiagnostics.length ? { optionDiagnostics } : {};
});

connection.onRequest("closeProject", (params: CloseProjectParams) => {
  projects.delete(params.projectHandle);
  return null;
});

connection.onRequest("transform", (params: TransformParams): TransformResult => {
  const options = projects.get(params.projectHandle);
  if (!options) {
    throw new ResponseError(ErrorCodes.InvalidParams, `Unknown project: ${params.projectHandle}`);
  }
  return transform(params.content, options);
});

connection.listen();
