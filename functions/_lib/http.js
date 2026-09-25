export function json(data, status = 200, customHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...customHeaders },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}
