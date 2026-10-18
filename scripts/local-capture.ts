import type { Plugin } from "vite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  writeFile,
  unlink,
  rmdir,
  mkdir,
  open,
} from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
const execute = promisify(execFile);
const powershell = join(
  process.env.SystemRoot || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
export function validCapture(bytes: Buffer) {
  return (
    bytes.length >= 24 &&
    bytes.length <= 64 * 1024 * 1024 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR" &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(20) > 0 &&
    bytes.readUInt32BE(16) <= 15000 &&
    bytes.readUInt32BE(20) <= 15000 &&
    bytes.readUInt32BE(16) * bytes.readUInt32BE(20) <= 32000000
  );
}
export function localCapture(): Plugin {
  let busy = false;
  return {
    name: "trp-local-windows-capture",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!url.pathname.startsWith("/__trp_capture/")) return next();
        const send = (status: number, data: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
        };
        if (process.platform !== "win32")
          return send(404, {
            error: "Windows preview capture is unavailable.",
          });
        const origin = req.headers.origin,
          host = req.headers.host;
        if (
          !["127.0.0.1:1420", "localhost:1420"].includes(host || "") ||
          (origin !== undefined && origin !== "http://" + host)
        )
          return send(403, {
            error: "This screenshot request is not allowed.",
          });
        if (url.pathname === "/__trp_capture/available" && req.method === "GET")
          return send(200, { available: true });
        if (
          req.method !== "POST" ||
          !["/__trp_capture/copy", "/__trp_capture/save"].includes(
            url.pathname,
          ) ||
          req.headers["x-trp-capture"] !== "1" ||
          !req.headers["content-type"]?.startsWith("image/png")
        )
          return send(400, { error: "Invalid screenshot request." });
        if (busy)
          return send(409, {
            error: "A screenshot is already being processed.",
          });
        busy = true;
        try {
          let length = 0;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 64 * 1024 * 1024)
              throw Error("Screenshot is too large.");
            chunks.push(Buffer.from(chunk));
          }
          const bytes = Buffer.concat(chunks);
          if (!validCapture(bytes)) throw Error("Invalid PNG screenshot.");
          if (url.pathname.endsWith("/copy")) {
            const directory = await mkdtemp(join(tmpdir(), "trp-capture-")),
              file = join(directory, "capture.png");
            try {
              await writeFile(file, bytes);
              await execute(
                powershell,
                [
                  "-NoProfile",
                  "-NonInteractive",
                  "-STA",
                  "-Command",
                  "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $image = [System.Drawing.Image]::FromFile($env:TRP_CAPTURE_FILE); try { [System.Windows.Forms.Clipboard]::SetImage($image) } finally { $image.Dispose() }",
                ],
                {
                  windowsHide: true,
                  timeout: 20000,
                  env: { ...process.env, TRP_CAPTURE_FILE: file },
                },
              );
            } finally {
              await unlink(file).catch(() => {});
              await rmdir(directory).catch(() => {});
            }
            return send(200, { ok: true });
          }
          let downloads = join(homedir(), "Downloads");
          try {
            const result = await execute(
              powershell,
              [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                String.raw`$ErrorActionPreference = 'Stop'; $folder = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}'; if ($folder) { [Environment]::ExpandEnvironmentVariables($folder) }`,
              ],
              { windowsHide: true, timeout: 10000 },
            );
            if (result.stdout.trim()) downloads = result.stdout.trim();
          } catch {}
          await mkdir(downloads, { recursive: true });
          const raw =
            typeof req.headers["x-trp-filename"] === "string"
              ? req.headers["x-trp-filename"]
              : "Screenshot.png";
          const stem =
            raw
              .replace(/\.png$/i, "")
              .replace(/[^a-z0-9_-]/gi, "-")
              .slice(0, 100) || "Screenshot";
          for (let index = 0; index < 1000; index++) {
            const name = stem + (index ? "-" + index : "") + ".png",
              path = join(downloads, name);
            let handle;
            try {
              handle = await open(path, "wx");
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
              throw error;
            }
            try {
              await handle.writeFile(bytes);
            } finally {
              await handle.close();
            }
            return send(200, { ok: true, filename: name, path });
          }
          throw Error("Choose a different screenshot filename.");
        } catch (error) {
          return send(500, {
            error:
              error instanceof Error &&
              ["Screenshot is too large.", "Invalid PNG screenshot."].includes(
                error.message,
              )
                ? error.message
                : "Windows could not complete the screenshot action. Please try again.",
          });
        } finally {
          busy = false;
        }
      });
    },
  };
}
