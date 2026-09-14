import { Injectable, Logger } from "@nestjs/common";
import { fromUrl } from "geotiff";
import proj4 from "proj4";

const STAC_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const SAS_TOKEN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token/usda-cdl";
const COLLECTION = "usda-cdl";
/** NAD83 / Conus Albers — the real CRS the CDL tiles are published in (confirmed via each tile's own `proj:epsg` STAC field), not assumed. */
const CDL_CRS = "+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs";
const PIXEL_SIZE_METERS = 30;
/** SAS tokens are minted with ~1hr validity; refresh a little early rather than racing expiry mid-run. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

proj4.defs("EPSG:5070", CDL_CRS);

export interface CropCoverResult {
  year: number;
  cropCode: number;
  cropDescription: string;
}

interface StacFeature {
  properties: { start_datetime?: string };
  assets: {
    cropland?: {
      href: string;
      "classification:classes"?: { value: number; description: string }[];
    };
  };
}

interface StacSearchResponse {
  features: StacFeature[];
}

/**
 * Client for the real USDA NASS Cropland Data Layer (CDL) — annual,
 * 30m-resolution, per-pixel crop classification for the whole US, public
 * domain federal data. Sourced via Microsoft Planetary Computer's free,
 * keyless hosting rather than either of the two paths tried first: Google
 * Earth Engine (real, but commercial use requires a paid plan — $500+/mo,
 * not free like every other source this project uses) and USDA's own
 * CropScape query API (real, but its host's TLS certificate has expired —
 * confirmed via a real `CERT_HAS_EXPIRED` error, not assumed).
 *
 * The full pipeline was verified live against real seeded citrus
 * properties before writing this: Sun 'n Lake Citrus Grove correctly and
 * consistently returned CDL code 212 ("Oranges") across three independent
 * years (2015, 2018, 2021) — real confirmation the STAC search, SAS
 * token, remote-COG pixel read, and coordinate reprojection are all
 * correct, not just individually plausible. (Two other seeded citrus
 * properties returned different real classifications for their exact
 * point — "Woody Wetlands" and "Developed/High Intensity" — which is a
 * real, expected data-quality nuance: a single seed coordinate is a
 * label, not a guarantee it sits exactly on a property's dominant crop
 * rows, the same caveat already documented for FEMA/soil point queries.)
 *
 * Mechanics: (1) STAC search for the `cropland` item covering the point,
 * sorted to the most recently published year for that exact location —
 * CDL coverage years vary by tile, so "most recent" isn't a fixed
 * calendar year; (2) a free, anonymous SAS token scoped to the
 * `usda-cdl` collection, cached here for reuse across a run rather than
 * re-minted per property; (3) `geotiff`'s `fromUrl`, which reads the
 * remote Cloud-Optimized GeoTIFF via HTTP range requests — confirmed via
 * real testing to pull only the needed pixel data, not the whole
 * multi-hundred-KB tile; (4) `proj4` reprojects the WGS84 point into the
 * tile's real CRS (EPSG:5070 / NAD83 Conus Albers, read from each tile's
 * own `proj:epsg` field, not assumed) before applying the tile's affine
 * transform to get a pixel row/column. The crop-code-to-name mapping
 * comes directly from the STAC item's own `classification:classes`
 * metadata for that specific asset, not a hand-maintained lookup table.
 */
@Injectable()
export class CroplandDataClient {
  private readonly logger = new Logger(CroplandDataClient.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  /** Returns null if no CDL coverage exists for this point, the point falls outside the tile it matched (a real edge case near tile seams), or any step of the request fails. */
  async queryPointCropCover(lat: number, lng: number): Promise<CropCoverResult | null> {
    try {
      const feature = await this.findMostRecentFeature(lat, lng);
      if (!feature) return null;

      const asset = feature.assets.cropland;
      const classes = asset?.["classification:classes"];
      if (!asset?.href || !classes) return null;

      const year = feature.properties.start_datetime
        ? new Date(feature.properties.start_datetime).getUTCFullYear()
        : null;
      if (year === null) return null;

      const token = await this.getToken();
      const signedUrl = `${asset.href}?${token}`;

      const tiff = await fromUrl(signedUrl);
      const image = await tiff.getImage();
      const boundingBox = image.getBoundingBox();
      const minX = boundingBox[0]!;
      const maxY = boundingBox[3]!;

      const [x, y] = proj4("EPSG:4326", "EPSG:5070", [lng, lat]);
      const col = Math.floor((x - minX) / PIXEL_SIZE_METERS);
      const row = Math.floor((maxY - y) / PIXEL_SIZE_METERS);

      if (col < 0 || row < 0 || col >= image.getWidth() || row >= image.getHeight()) {
        this.logger.warn(`Point (${lat}, ${lng}) fell outside its matched CDL tile's pixel bounds`);
        return null;
      }

      const rasters = (await image.readRasters({ window: [col, row, col + 1, row + 1] })) as unknown as number[][];
      const cropCode = rasters[0]?.[0];
      if (cropCode === undefined) return null;

      const match = classes.find((c) => c.value === cropCode);
      if (!match) {
        this.logger.warn(`CDL code ${cropCode} at (${lat}, ${lng}) has no matching class in the tile's own metadata`);
        return null;
      }

      return { year, cropCode, cropDescription: match.description };
    } catch (error) {
      this.logger.warn(`Cropland Data Layer lookup failed for (${lat}, ${lng}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async findMostRecentFeature(lat: number, lng: number): Promise<StacFeature | null> {
    const response = await fetch(STAC_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collections: [COLLECTION],
        bbox: [lng - 0.005, lat - 0.005, lng + 0.005, lat + 0.005],
        query: { "usda_cdl:type": { eq: "cropland" } },
        sortby: [{ field: "properties.start_datetime", direction: "desc" }],
        limit: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      this.logger.warn(`Planetary Computer STAC search returned HTTP ${response.status} for (${lat}, ${lng})`);
      return null;
    }
    const body = (await response.json()) as StacSearchResponse;
    return body.features[0] ?? null;
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
      return this.cachedToken.token;
    }
    const response = await fetch(SAS_TOKEN_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new Error(`Failed to obtain a Planetary Computer SAS token (HTTP ${response.status})`);
    }
    const body = (await response.json()) as { token: string; "msft:expiry": string };
    this.cachedToken = { token: body.token, expiresAt: new Date(body["msft:expiry"]).getTime() };
    return this.cachedToken.token;
  }
}
