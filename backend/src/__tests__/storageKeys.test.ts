import {
  deviceImageKey,
  deviceThumbnailKey,
  exportKey,
  settingsImageKey,
} from "../lib/storage";

/**
 * Object storage has no row-level security, so the workspace in the key and
 * the application's own check before signing are the only things keeping one
 * shop's objects out of another's reach. These four functions are where the
 * first half of that lives.
 */
describe("storage keys", () => {
  it("puts the workspace first for device images", () => {
    expect(deviceImageKey(7, 42, "a.webp")).toBe(
      "workspaces/7/devices/42/a.webp",
    );
  });

  it("keeps a thumbnail beside its image under its own segment", () => {
    // Its own segment rather than a suffix on the filename, so thumbnails can
    // be counted or swept separately from the photographs.
    expect(deviceThumbnailKey(7, 42, "a.webp")).toBe(
      "workspaces/7/devices/42/thumbs/a.webp",
    );
  });

  it("puts the workspace first for settings images", () => {
    expect(settingsImageKey(7, "logo-x.webp")).toBe(
      "workspaces/7/settings/logo-x.webp",
    );
  });

  it("leads exports with their own prefix, not the workspace's", () => {
    // ArvanCloud's lifecycle rules match a plain prefix and not a wildcard,
    // so `workspaces/{id}/exports/` could only be targeted as `workspaces/`
    // — which would expire every shop's photographs along with it.
    //
    // The tenant is still in the key, one level down. What actually keeps
    // shops apart is the application scoping the row before it signs
    // anything, not the shape of the string.
    expect(exportKey(7, "1234-export.zip")).toBe("exports/7/1234-export.zip");
  });
});
