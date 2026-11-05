const MAX_HEADER_LENGTH = 2000;
const THROW_ON_MAX_HEADER_LENGTH_EXCEEDED = false;

function hasRel(x: Link | null | undefined) {
  return x && x.rel;
}

function intoRels(acc: Links, x: Link) {
  function splitRel(rel: string) {
    acc[rel] = Object.assign({}, x, { rel: rel });
  }

  x.rel.split(/\s+/).forEach(splitRel);

  return acc;
}

function createObjects(acc: any, p: string) {
  // rel="next" => 1: rel 2: next
  const m = p.match(/\s*(.+)\s*=\s*"?([^"]+)"?/);
  if (m) acc[m[1]] = m[2];
  return acc;
}

function parseLink(link: string) {
  try {
    const m = link.match(/<?([^>]*)>(.*)/);
    if (!m) return null;

    const linkUrl = m[1];
    const parts = m[2].split(";");
    const qry: { [queryParam: string]: string } = {};
    // The origin is unused but it's required to parse relative URLs
    const url = new URL(linkUrl, "https://example.com");

    for (const [key, value] of url.searchParams) {
      qry[key] = value;
    }

    parts.shift();

    let info = parts.reduce(createObjects, {});
    info = Object.assign({}, qry, info);
    info.url = linkUrl;
    return info;
  } catch {
    return null;
  }
}

function checkHeader(linkHeader: string | null | undefined, options?: Options): boolean {
  if (!linkHeader) return false;

  options = options || {};
  const maxHeaderLength = options.maxHeaderLength || MAX_HEADER_LENGTH;
  const throwOnMaxHeaderLengthExceeded =
    options.throwOnMaxHeaderLengthExceeded || THROW_ON_MAX_HEADER_LENGTH_EXCEEDED;

  if (linkHeader.length > maxHeaderLength) {
    if (throwOnMaxHeaderLengthExceeded) {
      throw new Error(
        "Input string too long, it should be under " + maxHeaderLength + " characters.",
      );
    } else {
      return false;
    }
  }
  return true;
}

function parseLinkHeader(linkHeader: string | null | undefined, options?: Options): Links | null {
  if (!checkHeader(linkHeader, options)) return null;

  return linkHeader!.split(/,\s*</).map(parseLink).filter(hasRel).reduce(intoRels, {});
}

export interface Link {
  url: string;
  rel: string;
  [queryParam: string]: string;
}

export interface Links {
  [rel: string]: Link;
}

export interface Options {
  maxHeaderLength?: number;
  throwOnMaxHeaderLengthExceeded?: boolean;
}

export { parseLinkHeader };
