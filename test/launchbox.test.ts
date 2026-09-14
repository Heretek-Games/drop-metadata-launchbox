import test from "node:test";
import assert from "node:assert/strict";
import { MockPluginContext } from "@droposs/plugin-sdk";
import Plugin, { mapGameDetails, mapSearchResults } from "../src/index.js";

const SEARCH_FIXTURE = {
  count: 2,
  data: [
    {
      gameKey: 112360,
      name: "Hollow Knight",
      platformName: "Nintendo Switch",
      thumbName: "58b87b24-046f-4025-9b6b-24b9499e55a6.jpg",
    },
    {
      gameKey: 73770,
      name: "Hollow Knight",
      platformName: "Windows",
      thumbName: null,
    },
  ],
};

const DETAIL_FIXTURE = {
  gameKey: 112360,
  name: "Hollow Knight",
  overview: "Forge your own path in Hollow Knight!",
  releaseDate: "2018-06-12",
  releaseYear: null,
  platform: { name: "Nintendo Switch", key: 211 },
  gameGenres: [
    { name: "Action", key: 1 },
    { name: "Platform", key: 10 },
    { name: "Adventure", key: 2 },
  ],
  gameDevelopers: [{ name: "Team Cherry", key: 8547 }],
  gamePublishers: [{ name: "Team Cherry", key: 4810 }],
  gameImages: [
    {
      imageFileName: "cover-thumb.jpg",
      fullGameImageFileName: "cover-big.jpg",
      imageTypeName: "Box - Front Thumb",
      imageTypeKey: 11,
      regionName: "North America",
    },
    {
      imageFileName: "cover-thumb-eu.jpg",
      imageTypeName: "Box - Front Thumb",
      imageTypeKey: 11,
      regionName: "Europe",
    },
    {
      imageFileName: "shot-thumb.jpg",
      fullGameImageFileName: "shot.jpg",
      imageTypeName: "Screenshot - Gameplay Thumb",
      imageTypeKey: 15,
      regionName: "World",
    },
    {
      imageFileName: "duplicate-shot-thumb.jpg",
      fullGameImageFileName: "shot.jpg",
      imageTypeName: "Screenshot - Gameplay Thumb",
      imageTypeKey: 15,
      regionName: "World",
    },
    {
      imageFileName: "logo-thumb.png",
      imageTypeName: "Clear Logo Thumb",
      imageTypeKey: 13,
    },
    {
      imageFileName: "background-thumb.jpg",
      fullGameImageFileName: "background.jpg",
      imageTypeName: "Fanart - Background Thumb",
      imageTypeKey: 14,
    },
    {
      imageFileName: "fanart-box.png",
      imageTypeName: "Fanart - Box - Front",
      imageTypeKey: 45,
    },
  ],
  backgroundImage: { imageFileName: "bg-main.jpg", imageTypeKey: 5, gameImageKey: 799836 },
  esrbName: { esrbkey: 3, name: "E10+ - Everyone 10+" },
  communityRating: 4.326086956521739,
  maxPlayers: 1,
  cooperative: false,
  steamAppId: 367520,
  wikipediaUrl: "https://en.wikipedia.org/wiki/Hollow_Knight",
  videoUrl: "https://www.youtube.com/watch?v=Pk98MeQWUTw",
};

interface FetchCall {
  url: string;
}

function createFetchStub(fixtures: Array<{ match: string; body: unknown; status?: number }>): {
  calls: FetchCall[];
  fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
} {
  const calls: FetchCall[] = [];
  const fetch = async (input: string | URL): Promise<Response> => {
    const url = String(input);
    calls.push({ url });
    const fixture = fixtures.find((entry) => url.includes(entry.match));
    if (!fixture) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(fixture.body), {
      status: fixture.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch };
}

async function createProviderContext(
  fixtures: Array<{ match: string; body: unknown; status?: number }>,
): Promise<{ ctx: MockPluginContext; calls: FetchCall[]; messages: string[] }> {
  const ctx = new MockPluginContext("drop-metadata-launchbox", ["metadata:provider", "network"]);
  const messages: string[] = [];
  ctx.logger = {
    info: (message: string) => messages.push(message),
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  const stub = createFetchStub(fixtures);
  (ctx as { fetch: typeof stub.fetch }).fetch = stub.fetch;
  await new Plugin().init(ctx);
  return { ctx, calls: stub.calls, messages };
}

test("drop-metadata-launchbox registers a metadata provider", async () => {
  const { ctx } = await createProviderContext([]);
  assert.equal(ctx.metadataProviders.size, 1);
  assert.equal(ctx.metadataProviders.get("launchbox")?.name, "LaunchBox Games Database");
});

test("drop-metadata-launchbox maps a search payload", () => {
  const results = mapSearchResults(SEARCH_FIXTURE);
  assert.equal(results.length, 2);
  assert.equal(results[0].id, "112360");
  assert.equal(results[0].title, "Hollow Knight");
  assert.equal(results[0].coverUrl, "https://images.launchbox-app.com/58b87b24-046f-4025-9b6b-24b9499e55a6.jpg");
  assert.equal(results[1].coverUrl, undefined);
  assert.equal(results[0].provider, "launchbox");
});

test("drop-metadata-launchbox searches the GamesDB API with an encoded query", async () => {
  const { ctx, calls } = await createProviderContext([
    { match: "/search/hollow%20knight", body: SEARCH_FIXTURE },
  ]);
  const results = await ctx.metadataProviders.get("launchbox")?.search("hollow knight");
  assert.equal(results?.length, 2);
  assert.equal(calls[0].url, "https://gamesdb-api.launchbox-app.com/api/search/hollow%20knight");
});

test("drop-metadata-launchbox maps a game detail payload", async () => {
  const { ctx } = await createProviderContext([
    { match: "/games/details/112360", body: DETAIL_FIXTURE },
  ]);
  const details = await ctx.metadataProviders.get("launchbox")?.getDetails("112360");
  assert.ok(details);
  assert.equal(details.title, "Hollow Knight");
  assert.equal(details.releaseYear, 2018);
  assert.equal(details.description, "Forge your own path in Hollow Knight!");
  assert.equal(details.coverUrl, "https://images.launchbox-app.com/cover-big.jpg");
  assert.equal(details.bannerUrl, "https://images.launchbox-app.com/background.jpg");
  assert.equal(details.iconUrl, "https://images.launchbox-app.com/logo-thumb.png");
  assert.deepEqual(details.screenshots, ["https://images.launchbox-app.com/shot.jpg"]);
  assert.deepEqual(details.genres, ["Action", "Platform", "Adventure"]);
  assert.deepEqual(details.developers, ["Team Cherry"]);
  assert.deepEqual(details.publishers, ["Team Cherry"]);
  assert.equal(details.metadata?.platform, "Nintendo Switch");
  assert.equal(details.metadata?.esrb, "E10+ - Everyone 10+");
  assert.equal(details.metadata?.steamAppId, 367520);
});

test("drop-metadata-launchbox detail mapper returns null for empty payloads", () => {
  assert.equal(mapGameDetails(undefined), null);
  assert.equal(mapGameDetails({}), null);
});

test("drop-metadata-launchbox throws on failed requests", async () => {
  const { ctx } = await createProviderContext([
    { match: "/games/details/112360", body: { error: "nope" }, status: 500 },
  ]);
  await assert.rejects(
    () => ctx.metadataProviders.get("launchbox")?.getDetails("112360") ?? Promise.resolve(null),
    /LaunchBox Games Database request failed with status 500/,
  );
});
