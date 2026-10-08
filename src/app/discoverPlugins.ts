import type {
  InstrumentManifest,
  PluginDescriptor,
  PluginModule,
} from "../contracts/instrument";

const manifestLoaders = import.meta.glob<{ manifest: InstrumentManifest }>(
  "../instruments/*/manifest.ts",
);
const pluginLoaders = import.meta.glob<PluginModule>(
  "../instruments/*/index.ts",
);

export async function discoverPlugins(
  onlyId?: string,
): Promise<PluginDescriptor[]> {
  const paths = Object.keys(manifestLoaders)
    .sort()
    .filter(
      (path) => onlyId === undefined || path.split("/").at(-2) === onlyId,
    );
  const descriptors = await Promise.all(
    paths.map(async (path) => {
      const { manifest } = await manifestLoaders[path]!();
      const directory = path.split("/").at(-2);
      if (manifest.id !== directory)
        throw new Error(`Plugin id must match its directory: ${directory}`);
      const load = pluginLoaders[path.replace("/manifest.ts", "/index.ts")];
      if (!load) throw new Error(`Missing plugin entry: ${manifest.id}`);
      return { manifest, load };
    }),
  );
  if (onlyId !== undefined && !descriptors.length)
    throw new Error(`找不到 Plugin：${onlyId}`);
  return descriptors;
}
