import { json } from "../_lib/http.js";

export const APP_VERSAO = "2.1.2";
export const APP_BUILD = "2026-09-25-03";

export async function onRequestGet() {
  return json(
    {
      versao: APP_VERSAO,
      build: APP_BUILD,
      timestamp: Date.now(),
    },
    200,
    {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    }
  );
}
