import { describe, expect, it } from "vitest";
import { isDeezerShortLink, parseDeezerPlaylistId, parseSpotifyPlaylistId } from "@/lib/import/links";

describe("parseDeezerPlaylistId", () => {
  it.each([
    ["https://www.deezer.com/bg/playlist/1276787711", "1276787711"],
    ["https://www.deezer.com/playlist/14686504381?utm_source=x", "14686504381"],
    ["deezer.com/en-gb/playlist/123456", "123456"],
    ["1276787711", "1276787711"],
  ])("%s", (input, expected) => expect(parseDeezerPlaylistId(input)).toBe(expected));

  it("отхвърля други линкове", () => {
    expect(parseDeezerPlaylistId("https://www.deezer.com/bg/album/123")).toBeNull();
    expect(parseDeezerPlaylistId("здрасти")).toBeNull();
  });

  it("разпознава кратки линкове", () => {
    expect(isDeezerShortLink("https://link.deezer.com/s/30abc")).toBe(true);
    expect(isDeezerShortLink("https://www.deezer.com/playlist/1")).toBe(false);
  });
});

describe("parseSpotifyPlaylistId", () => {
  it.each([
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc", "37i9dQZF1DXcBWIGoYBM5M"],
    ["https://open.spotify.com/intl-bg/playlist/37i9dQZF1DXcBWIGoYBM5M", "37i9dQZF1DXcBWIGoYBM5M"],
    ["https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M", "37i9dQZF1DXcBWIGoYBM5M"],
    ["spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", "37i9dQZF1DXcBWIGoYBM5M"],
  ])("%s", (input, expected) => expect(parseSpotifyPlaylistId(input)).toBe(expected));

  it("отхвърля албуми и боклук", () => {
    expect(parseSpotifyPlaylistId("https://open.spotify.com/album/37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
    expect(parseSpotifyPlaylistId("abc")).toBeNull();
  });
});
