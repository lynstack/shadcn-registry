import type { FoundItem, PlannedFile } from "./discover.ts";
import type { ImportResolver, Resolved } from "./resolve.ts";
import { compact, detailsOf } from "./item-fields.ts";
import type { Config } from "./config.ts";
import type { DependencyReader } from "./dependencies.ts";
import type { InstalledFile } from "./placement.ts";
import type { ItemFields } from "./item-fields.ts";
import type { Problems } from "./problems.ts";
import type { SourceImport } from "./source.ts";
import { createResolver } from "./resolve.ts";
import { itemInfoOf } from "./item-info.ts";
import { placementProblem } from "./placement.ts";
import { readScript } from "./source.ts";
import { sorted } from "./order.ts";

/** One file of the registry, with the item that ships it. */
interface OwnedFile extends InstalledFile, PlannedFile {
  readonly owner: string;
}

/** A local import, kept until every item's dependencies are known. */
interface PendingImport {
  readonly from: OwnedFile;
  readonly to: OwnedFile;
  readonly import: SourceImport;
}

/** What the files of one item import. */
interface ItemImports {
  readonly dependencies: Set<string>;
  readonly devDependencies: Set<string>;
  readonly registryDependencies: Set<string>;
}

/** Where an import sits, for a problem about it. */
interface ImportSite {
  readonly file: string;
  readonly line: number;
}

/** One import of a file, being followed. */
interface FollowedImport {
  readonly file: OwnedFile;
  readonly imports: ItemImports;
  readonly sourceImport: SourceImport;
}

function siteOf(followed: FollowedImport): ImportSite {
  return { file: followed.file.path, line: followed.sourceImport.line };
}

/** What one build gives the component items. */
interface ComponentBuild {
  readonly config: Config;
  readonly dependencies: DependencyReader;
  readonly problems: Problems;
  /** The folder the configuration's paths start from. */
  readonly root: string;
  /** The text of a file, from the root. */
  readonly textOf: (file: string) => string;
}

/** What component items share while they are built. */
interface ComponentContext extends ComponentBuild {
  readonly resolver: ImportResolver;
}

/** Builds the items of the rules, following the imports of every file. */
class ComponentItems {
  readonly #context: ComponentContext;
  readonly #files = new Map<string, OwnedFile>();
  /** The local imports, checked once every item's dependencies are known. */
  readonly #pending: PendingImport[] = [];
  /** The items of this registry each item depends on. */
  readonly #dependsOn = new Map<string, ReadonlySet<string>>();
  readonly #names: ReadonlySet<string>;

  public constructor(
    build: ComponentBuild,
    items: readonly FoundItem[],
    names: ReadonlySet<string>,
  ) {
    this.#context = {
      ...build,
      resolver: createResolver(
        build.root,
        build.config.tsconfig ?? "tsconfig.json",
      ),
    };
    this.#names = names;
    for (const item of items) {
      for (const file of item.files) {
        this.#files.set(file.path, {
          ...file,
          copiedAsIs: item.rule.type === "registry:file",
          owner: item.name,
        });
      }
    }
  }

  /** How an item names another item of this registry. */
  public address(name: string): string {
    const { config } = this.#context;
    return config.url === undefined
      ? `${config.namespace ?? `@${config.name}`}/${name}`
      : config.url.replaceAll("{name}", name);
  }

  /** The item's fields, with its files listed by path. */
  public build(item: FoundItem): ItemFields {
    const imports: ItemImports = {
      dependencies: new Set(),
      devDependencies: new Set(),
      registryDependencies: new Set(),
    };
    for (const file of item.files) {
      const owned = this.#files.get(file.path);
      if (owned !== undefined) {
        this.#followImports(owned, imports);
      }
    }
    const ruleDependencies = (item.rule.registryDependencies ?? []).filter(
      (dependency) => this.#ownItemOf(dependency) !== item.name,
    );
    this.#dependsOn.set(
      item.name,
      new Set([
        ...imports.registryDependencies,
        ...ruleDependencies.flatMap((dependency) => {
          const own = this.#ownItemOf(dependency);
          return own === undefined ? [] : [own];
        }),
      ]),
    );
    const info = itemInfoOf(item, this.#context.textOf);
    const details = { ...info.documentation, ...item.rule.describe?.(info) };
    return compact({
      ...detailsOf(details, item.name),
      dependencies: sorted(imports.dependencies),
      devDependencies: sorted(imports.devDependencies),
      files: item.files.map((file) => ({
        path: file.path,
        target: file.target,
        type: item.rule.type,
      })),
      name: item.name,
      registryDependencies: sorted([
        ...[...imports.registryDependencies].map((name) => this.address(name)),
        ...ruleDependencies.map((name) => this.#ruleDependency(name)),
      ]),
      type: item.rule.type,
    });
  }

  /**
   * Checks every local import against how the shadcn CLI rewrites it when
   * it installs the importing item, with the items that item depends on.
   */
  public checkInstalls(): void {
    for (const pending of this.#pending) {
      const problem = placementProblem({
        ...pending,
        installed: this.#installedWith(pending.from.owner),
      });
      if (problem !== undefined) {
        this.#context.problems.add({
          file: pending.from.path,
          line: pending.import.line,
          message: problem,
        });
      }
    }
  }

  /** The targets of every file one install of an item writes. */
  #installedWith(name: string): string[] {
    const items = new Set([name]);
    for (const item of items) {
      for (const dependency of this.#dependsOn.get(item) ?? []) {
        items.add(dependency);
      }
    }
    return [...this.#files.values()]
      .filter((file) => items.has(file.owner))
      .map((file) => file.target);
  }

  /** The item of this registry that a rule's dependency names, by name or address. */
  #ownItemOf(dependency: string): string | undefined {
    return this.#names.has(dependency)
      ? dependency
      : [...this.#names].find((name) => this.address(name) === dependency);
  }

  /** The address of an item a rule adds, checked against the registry's items. */
  #ruleDependency(name: string): string {
    const isAddress =
      name.startsWith("@") ||
      /^https?:\/\//u.test(name) ||
      name.endsWith(".json");
    if (!isAddress && !this.#names.has(name)) {
      this.#context.problems.add({
        message: `An item rule depends on "${name}", which is no item of this registry; name another registry's item by its @namespace/name or URL.`,
      });
    }
    return isAddress ? name : this.address(name);
  }

  #followImports(file: OwnedFile, imports: ItemImports): void {
    const { problems, resolver, textOf } = this.#context;
    const source = readScript(file.path, textOf(file.path), problems);
    for (const sourceImport of source?.imports ?? []) {
      const resolved = resolver.resolve(file.path, sourceImport.specifier);
      this.#record({ file, imports, sourceImport }, resolved);
    }
  }

  /** Records what one import adds to its item, or the problem it has. */
  #record(followed: FollowedImport, resolved: Resolved): void {
    if (resolved.kind === "missing") {
      this.#context.problems.add({
        ...siteOf(followed),
        message: `cannot resolve "${followed.sourceImport.specifier}": ${resolved.reason}.`,
      });
    } else if (resolved.kind === "package") {
      this.#recordPackage(followed, resolved.name);
    } else if (resolved.kind === "file") {
      this.#recordFile(followed, resolved.file);
    }
  }

  #recordPackage(followed: FollowedImport, name: string): void {
    const { imports, sourceImport } = followed;
    const dependency = this.#context.dependencies.dependencyOf(
      name,
      sourceImport.typeOnly,
    );
    if (dependency.kind === "problem") {
      this.#context.problems.add({
        ...siteOf(followed),
        message: dependency.message,
      });
    } else if (dependency.kind === "dependency") {
      imports.dependencies.add(dependency.spec);
    } else if (dependency.kind === "devDependency") {
      imports.devDependencies.add(dependency.spec);
    }
  }

  #recordFile(followed: FollowedImport, imported: string): void {
    const target = this.#files.get(imported);
    if (target === undefined) {
      this.#context.problems.add({
        ...siteOf(followed),
        message: `imports ${imported}, which no item ships; add it to an item's source, or stop ignoring it.`,
      });
      return;
    }
    this.#pending.push({
      from: followed.file,
      import: followed.sourceImport,
      to: target,
    });
    if (target.owner !== followed.file.owner) {
      followed.imports.registryDependencies.add(target.owner);
    }
  }
}

export { ComponentItems };
export type { ComponentBuild };
