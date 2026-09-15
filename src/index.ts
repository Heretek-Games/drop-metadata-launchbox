import type {
  MetadataDetails,
  MetadataProvider,
  MetadataSearchResult,
  PluginContext,
  ServerPlugin,
} from "@droposs/plugin-sdk";

export type HttpFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

const API_BASE = "https://gamesdb-api.launchbox-app.com/api";
const IMAGE_BASE = "https://images.launchbox-app.com/";
// Newer game images are stored with an `r2_` prefix and served from the R2 host.
const R2_IMAGE_BASE = "https://gamesdb-images.launchbox.gg/";

export interface LaunchBoxSearchRecord {
  gameKey?: string | number;
  name?: string;
  platformName?: string;
  thumbName?: string | null;
}

export interface LaunchBoxGameImage {
  imageFileName?: string;
  fullGameImageFileName?: string | null;
  imageTypeName?: string;
  imageTypeKey?: number;
  regionName?: string | null;
}

export interface LaunchBoxNamedRecord {
  key?: number;
  name?: string;
}

export interface LaunchBoxGame {
  gameKey?: string | number;
  name?: string;
  overview?: string | null;
  releaseDate?: string | null;
  releaseYear?: number | null;
  platform?: LaunchBoxNamedRecord;
  gameGenres?: LaunchBoxNamedRecord[];
  gameDevelopers?: LaunchBoxNamedRecord[];
  gamePublishers?: LaunchBoxNamedRecord[];
  gameImages?: LaunchBoxGameImage[];
  backgroundImage?: { imageFileName?: string };
  esrbName?: { esrbkey?: number; name?: string };
  maxPlayers?: number | null;
  cooperative?: boolean;
  communityRating?: number | null;
  steamAppId?: number | null;
  wikipediaUrl?: string | null;
  videoUrl?: string | null;
}

/**
 * Image URL candidates for a GamesDB file name, in preference order.
 *
 * `r2_`-prefixed names are normally served from the R2 host, but LaunchBox
 * still serves some of them from the legacy host, so the legacy URL is
 * appended as a fallback. Consumers that can retry (image proxies, clients)
 * should try the candidates in order; the plugin itself only returns URLs and
 * never fetches image bytes, so it cannot probe them.
 */
export function imageUrlCandidates(fileName: string | null | undefined): string[] {
  if (!fileName) return [];
  if (fileName.startsWith("r2_")) {
    return [`${R2_IMAGE_BASE}${fileName}`, `${IMAGE_BASE}${fileName}`];
  }
  return [`${IMAGE_BASE}${fileName}`];
}

/** Primary image URL: the first entry of {@link imageUrlCandidates}. */
export function imageUrl(fileName: string | null | undefined): string | undefined {
  return imageUrlCandidates(fileName)[0];
}

function parseYear(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = /\d{4}/.exec(value);
  return match ? Number.parseInt(match[0], 10) : undefined;
}

export function mapSearchResults(payload: unknown): MetadataSearchResult[] {
  const data = (payload as { data?: LaunchBoxSearchRecord[] } | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((record) => record?.gameKey !== undefined && Boolean(record?.name))
    .map((record) => ({
      id: String(record.gameKey),
      title: String(record.name),
      coverUrl: imageUrl(record.thumbName),
      provider: "launchbox",
    }));
}

function pickImageFileName(
  images: LaunchBoxGameImage[],
  matches: (typeName: string) => boolean,
): string | undefined {
  const image = images.find((candidate) => candidate.imageTypeName && matches(candidate.imageTypeName));
  return image?.fullGameImageFileName ?? image?.imageFileName ?? undefined;
}

export function mapGameDetails(payload: unknown): MetadataDetails | null {
  const game = payload as LaunchBoxGame | undefined;
  if (!game?.gameKey || !game.name) return null;

  const images = Array.isArray(game.gameImages) ? game.gameImages : [];
  const screenshotNames = images
    .filter((image) => image.imageTypeName?.startsWith("Screenshot"))
    .map((image) => image.fullGameImageFileName ?? image.imageFileName)
    .filter((name): name is string => Boolean(name));
  const screenshots = Array.from(
    new Set(screenshotNames.map((name) => imageUrl(name))),
  ).filter((url): url is string => Boolean(url));

  const coverName =
    pickImageFileName(images, (name) => name === "Box - Front Thumb" || name === "Box - Front") ??
    pickImageFileName(images, (name) => /^Box - Front/.test(name)) ??
    game.backgroundImage?.imageFileName;
  const bannerName = pickImageFileName(
    images,
    (name) => name === "Fanart - Background Thumb" || name === "Fanart - Background",
  );
  const iconName = pickImageFileName(images, (name) => name === "Clear Logo Thumb" || name === "Clear Logo");

  return {
    id: String(game.gameKey),
    title: game.name,
    releaseYear: game.releaseYear ?? parseYear(game.releaseDate),
    coverUrl: imageUrl(coverName),
    bannerUrl: imageUrl(bannerName),
    iconUrl: imageUrl(iconName),
    description: game.overview ?? undefined,
    genres: game.gameGenres?.map((genre) => genre.name).filter((name): name is string => Boolean(name)),
    developers: game.gameDevelopers?.map((company) => company.name).filter((name): name is string => Boolean(name)),
    publishers: game.gamePublishers?.map((company) => company.name).filter((name): name is string => Boolean(name)),
    screenshots: Array.from(new Set(screenshots)),
    provider: "launchbox",
    metadata: {
      platform: game.platform?.name,
      maxPlayers: game.maxPlayers ?? undefined,
      cooperative: game.cooperative,
      communityRating: game.communityRating ?? undefined,
      esrb: game.esrbName?.name,
      steamAppId: game.steamAppId ?? undefined,
      wikipediaUrl: game.wikipediaUrl ?? undefined,
      videoUrl: game.videoUrl ?? undefined,
      // `MetadataDetails` has no typed alternates field, so the ordered image
      // candidates (R2 host first, legacy host fallback) are exposed here for
      // consumers that can retry a failed image load.
      imageCandidates: {
        coverUrl: imageUrlCandidates(coverName),
        bannerUrl: imageUrlCandidates(bannerName),
        iconUrl: imageUrlCandidates(iconName),
        screenshots: screenshotNames.flatMap((name) => imageUrlCandidates(name)),
      },
    },
  };
}

export class LaunchBoxProvider implements MetadataProvider {
  id = "launchbox";
  name = "LaunchBox Games Database";

  constructor(private readonly fetchFn: HttpFetch) {}

  async search(query: string): Promise<MetadataSearchResult[]> {
    const url = new URL(`${API_BASE}/search/${encodeURIComponent(query)}`);
    const payload = await this.request(url);
    return mapSearchResults(payload);
  }

  async getDetails(id: string): Promise<MetadataDetails | null> {
    const url = new URL(`${API_BASE}/games/details/${encodeURIComponent(id)}`);
    const payload = await this.request(url);
    return mapGameDetails(payload);
  }

  private async request(url: URL): Promise<unknown> {
    const response = await this.fetchFn(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`LaunchBox Games Database request failed with status ${response.status}`);
    }
    return response.json();
  }
}

export default class LaunchBoxPlugin implements ServerPlugin {
  metadata = {
    id: "drop-metadata-launchbox",
    name: "LaunchBox Games Database",
    version: "0.1.0",
    apiVersion: 2,
    capabilities: ["metadata:provider" as const, "network" as const],
  };

  async init(ctx: PluginContext): Promise<void> {
    ctx.registerMetadataProvider(new LaunchBoxProvider(ctx.fetch.bind(ctx)));
    ctx.logger.info("LaunchBox Games Database metadata provider registered");
  }
}
