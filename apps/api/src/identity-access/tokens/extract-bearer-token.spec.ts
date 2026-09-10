import { Request } from "express";
import { extractBearerToken } from "./extract-bearer-token";

function req(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Bearer header", () => {
    expect(extractBearerToken(req("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the scheme", () => {
    expect(extractBearerToken(req("bearer abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("returns undefined when there is no Authorization header", () => {
    expect(extractBearerToken(req(undefined))).toBeUndefined();
  });

  it("returns undefined for a non-Bearer scheme", () => {
    expect(extractBearerToken(req("Basic dXNlcjpwYXNz"))).toBeUndefined();
  });

  it("returns undefined when the token part is missing", () => {
    expect(extractBearerToken(req("Bearer"))).toBeUndefined();
  });
});
