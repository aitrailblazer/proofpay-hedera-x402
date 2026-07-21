export const normalizeForwardedRequest = (request: Request): Request => {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  const url = new URL(request.url);

  if (forwardedProto !== "https" || url.protocol !== "http:") {
    return request;
  }

  url.protocol = "https:";
  return new Request(url, request);
};
