import fs from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import ts from "typescript";

export const PUBLIC_ENTRYPOINTS = [
  "server/services/workspace/public.ts",
  "server/services/team/public.ts",
] as const;

// Exact edges, not directory/filename exemptions. New private wiring needs review.
export const COMPOSITION_EDGES: ReadonlyArray<readonly [string, string]> = [
  ...["workspace", "team", "ai", "metrics"].flatMap((service) => [
    [
      "server/routes.ts",
      `server/services/${service}/db/connection.ts`,
    ] as const,
    [
      "server/routes.ts",
      `server/services/${service}/db/migrations/index.ts`,
    ] as const,
  ]),
  ...["workspace", "team", "canvas", "ai", "metrics"].map(
    (service) =>
      ["server/routes.ts", `server/services/${service}/index.ts`] as const,
  ),
  ["server/routes.ts", "server/services/workspace/db/storage.ts"],
  ["server/routes.ts", "server/services/team/db/storage.ts"],
  ["server/index.ts", "server/services/workspace/db/connection.ts"],
  ["server/index.ts", "server/services/workspace/index.ts"],
  ["server/index.ts", "server/services/team/websocket/index.ts"],
  [
    "scripts/replay-workspace-outbox.ts",
    "server/services/workspace/db/connection.ts",
  ],
  [
    "scripts/replay-workspace-outbox.ts",
    "server/services/workspace/outbox-store.ts",
  ],
];

export interface BoundaryViolation {
  file: string;
  line: number;
  specifier: string;
  reason: string;
  chain?: string[];
}
interface Edge {
  file: string;
  line: number;
  specifier: string;
  target?: string;
  external?: string;
}
export interface BoundaryInput {
  root: string;
  /** Repository-relative file names; fixtures use the same resolver in memory. */
  sources: Readonly<Record<string, string>>;
  assets?: readonly string[];
  compilerOptions: ts.CompilerOptions;
  compositionEdges?: ReadonlyArray<readonly [string, string]>;
}

const slash = (value: string) => value.replaceAll("\\", "/");
const owner = (file: string) => /^server\/services\/([^/]+)\//.exec(file)?.[1];
const publicEntries = new Set<string>(PUBLIC_ENTRYPOINTS);
const contractFile = (file: string) =>
  file.startsWith("server/shared/") || publicEntries.has(file);
const pureLibrary = (file: string) => file === "server/lib/module-outcomes.ts";
const privatePackage =
  /^(?:(?:drizzle-orm|drizzle-zod|pg|express|ws|ioredis|openai)(?:$|\/)|@aws-sdk\/)/;

/** Parse every import form, including types and dynamic imports. Never executes code. */
function imports(file: string, source: ts.SourceFile): Edge[] {
  const edges: Edge[] = [];
  const add = (node: ts.Node, argument: ts.Node | undefined) => {
    const literal =
      argument &&
      (ts.isStringLiteral(argument) ||
        ts.isNoSubstitutionTemplateLiteral(argument));
    edges.push({
      file,
      line:
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      specifier: literal ? argument.text : "<computed import>",
    });
  };
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      add(node, node.moduleSpecifier);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      add(node, node.moduleReference.expression);
    if (ts.isImportTypeNode(node))
      add(
        node,
        ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined,
      );
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.getText(source) === "module.require"))
    )
      add(node, node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

export function checkServiceBoundaries(
  input: BoundaryInput,
): BoundaryViolation[] {
  const root = path.resolve(input.root);
  const absolute = (file: string) => slash(path.resolve(root, file));
  const relative = (file: string) => slash(path.relative(root, file));
  const sourceByPath = new Map(
    Object.entries(input.sources).map(([file, text]) => [absolute(file), text]),
  );
  const assets = new Set((input.assets ?? []).map(absolute));
  const directories = new Set<string>();
  for (const file of sourceByPath.keys()) {
    let parent = slash(path.dirname(file));
    while (!directories.has(parent)) {
      directories.add(parent);
      const next = slash(path.dirname(parent));
      if (next === parent) break;
      parent = next;
    }
  }
  const host: ts.ModuleResolutionHost = {
    fileExists: (file) => sourceByPath.has(slash(file)),
    readFile: (file) => sourceByPath.get(slash(file)),
    directoryExists: (dir) => directories.has(slash(dir)),
    getCurrentDirectory: () => root,
  };
  const options = {
    ...input.compilerOptions,
    baseUrl: input.compilerOptions.baseUrl ?? root,
  };
  const cache = ts.createModuleResolutionCache(root, (file) => file, options);
  const graph = new Map<string, Edge[]>();
  const violations: BoundaryViolation[] = [];
  const seen = new Set<string>();
  const report = (edge: Edge, reason: string, chain?: string[]) => {
    const key = `${edge.file}:${edge.line}:${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({
      file: edge.file,
      line: edge.line,
      specifier: edge.specifier,
      reason,
      ...(chain ? { chain } : {}),
    });
  };
  const composition = new Set(
    (input.compositionEdges ?? COMPOSITION_EDGES).map(
      ([from, to]) => `${from}\0${to}`,
    ),
  );
  for (const [file, text] of Object.entries(input.sources)) {
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const edges = imports(file, source);
    graph.set(file, edges);
    const checkDeclarations = (node: ts.Node) => {
      if (
        /^server\/services\/[^/]+\/index\.ts$/.test(file) &&
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier
      ) {
        report(
          {
            file,
            line:
              source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1,
            specifier: node.moduleSpecifier.getText(source),
          },
          "Service bootstraps must not re-export internals; use a declared public contract",
        );
      }
      if (
        contractFile(file) &&
        ((ts.isTypeReferenceNode(node) &&
          ["Date", "Buffer", "Uint8Array", "Map", "Set"].includes(
            node.typeName.getText(source),
          )) ||
          (ts.isTypeQueryNode(node) &&
            /\$infer(?:Select|Insert)/.test(node.exprName.getText(source))))
      ) {
        report(
          {
            file,
            line:
              source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1,
            specifier: node.getText(source),
          },
          "Public contracts must use JSON types, not runtime objects or inferred ORM rows",
        );
      }
      ts.forEachChild(node, checkDeclarations);
    };
    checkDeclarations(source);
    for (const edge of edges) {
      if (edge.specifier === "<computed import>") {
        report(
          edge,
          "Computed module loading cannot be checked; use a literal import",
        );
        continue;
      }
      const resolved = ts.resolveModuleName(
        edge.specifier,
        absolute(file),
        options,
        host,
        cache,
      ).resolvedModule;
      // Bundler assets are terminal data, never a blanket unresolved-import exemption.
      if (
        !resolved &&
        edge.specifier.startsWith(".") &&
        /\.(?:css|svg|png|jpe?g|webp|gif|json)(?:\?.*)?$/.test(
          edge.specifier,
        ) &&
        assets.has(
          slash(
            path.resolve(
              path.dirname(absolute(file)),
              edge.specifier.split("?")[0],
            ),
          ),
        )
      )
        continue;
      if (resolved) edge.target = relative(resolved.resolvedFileName);
      else if (
        /^(?:\.|\/|@services\/|@server\/|@shared(?:\/|$)|@\/)/.test(
          edge.specifier,
        ) ||
        Object.keys(options.paths ?? {}).some((alias) =>
          edge.specifier.startsWith(alias.split("*")[0]),
        )
      ) {
        report(edge, "Unresolved local import (fail closed)");
        continue;
      } else edge.external = edge.specifier;

      if (edge.target) {
        const targetOwner = owner(edge.target);
        const exactCompositionEdge = composition.has(`${file}\0${edge.target}`);
        if (
          targetOwner &&
          targetOwner !== owner(file) &&
          !publicEntries.has(edge.target) &&
          !exactCompositionEdge
        ) {
          report(
            edge,
            "Foreign service internals are private; use its declared public API",
          );
        }
        if (
          owner(file) &&
          ["server/index.ts", "server/routes.ts"].includes(edge.target)
        ) {
          report(
            edge,
            "A service cannot import the composition root to bypass its public API",
          );
        }
        if (
          file.startsWith("client/") &&
          edge.target.startsWith("server/") &&
          !contractFile(edge.target)
        ) {
          report(
            edge,
            "Browser code may import only shared/public server contracts",
          );
        }
      }
      if (
        file.startsWith("client/") &&
        edge.external &&
        (isBuiltin(edge.external) || privatePackage.test(edge.external))
      ) {
        report(
          edge,
          "Browser code cannot import server runtime/database/provider packages",
        );
      }
    }
  }

  // Follow re-exports AND imports, including type-only edges. A public facade
  // cannot launder a private schema, SQL type, SDK, or runtime initializer.
  for (const start of graph.keys()) {
    if (!contractFile(start)) continue;
    const visited = new Set<string>();
    const walk = (file: string, chain: string[]) => {
      if (visited.has(file)) return;
      visited.add(file);
      for (const edge of graph.get(file) ?? []) {
        if (edge.external && edge.external !== "zod")
          report(edge, "Public contract reaches a runtime/SDK package", chain);
        if (!edge.target) continue;
        const next = [...chain, edge.target];
        if (!contractFile(edge.target) && !pureLibrary(edge.target))
          report(
            edge,
            "Public contract reaches a private/runtime module",
            next,
          );
        walk(edge.target, next);
      }
    };
    walk(start, [start]);
  }
  return violations;
}

export function auditRepository(root: string): BoundaryViolation[] {
  const sources: Record<string, string> = {};
  const assets: string[] = [];
  const collect = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      if (["node_modules", "dist", "public", ".git"].includes(entry.name))
        continue;
      const file = slash(path.join(dir, entry.name));
      if (entry.isDirectory()) collect(file);
      else if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file))
        sources[file] = fs.readFileSync(path.join(root, file), "utf8");
      else assets.push(file);
    }
  };
  for (const dir of ["server", "client/src", "scripts"]) collect(dir);
  for (const file of fs.readdirSync(root)) {
    if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file))
      sources[file] = fs.readFileSync(path.join(root, file), "utf8");
  }
  const config = ts.readConfigFile(
    path.join(root, "tsconfig.json"),
    ts.sys.readFile,
  );
  if (config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  return checkServiceBoundaries({
    root,
    sources,
    assets,
    compilerOptions: parsed.options,
  });
}
