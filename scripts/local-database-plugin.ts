import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
export function localDatabasePlugin(directory = process.cwd()) {
  function install(server: any, filename: string) {
    const file = path.resolve(directory, ".local-data", filename);
    let queue = Promise.resolve();
    async function atomic(target: string, data: string) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = target + "." + crypto.randomUUID() + ".tmp";
      try {
        await fs.writeFile(temporary, data, "utf8");
        await fs.rename(temporary, target);
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
    }
    function validate(value: any) {
      if (
        value?.schemaVersion !== 1 ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 0 ||
        !value.documents ||
        Array.isArray(value.documents) ||
        typeof value.documents !== "object"
      )
        throw Error("Invalid JSON database; the file has not been changed.");
      for (const [key, row] of Object.entries(value.documents)) {
        const parts = key.split("/");
        if (
          parts.length % 2 !== 0 ||
          parts.some(
            (p) => !p || ["__proto__", "prototype", "constructor"].includes(p),
          ) ||
          !row ||
          typeof row !== "object" ||
          Array.isArray(row)
        )
          throw Error("Invalid record in local JSON database.");
      }
      return value;
    }
    async function load() {
      try {
        return validate(JSON.parse(await fs.readFile(file, "utf8")));
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
        const state = validate(
          JSON.parse(
            await fs.readFile(
              path.join(directory, "data/database.seed.json"),
              "utf8",
            ),
          ),
        );
        await atomic(file, JSON.stringify(state, null, 2));
        return state;
      }
    }
    server.middlewares.use("/__records/database", (req: any, res: any) => {
      const task = async () => {
        try {
          const origin = req.headers.origin;
          if (
            req.headers["x-records-local"] !== "1" ||
            (origin && origin !== "http://" + req.headers.host)
          ) {
            res.statusCode = 403;
            res.end("Local application requests only.");
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          if (req.method === "GET") {
            res.end(JSON.stringify(await load()));
            return;
          }
          if (!["PUT", "POST"].includes(req.method)) {
            res.statusCode = 405;
            res.end("Unsupported method");
            return;
          }
          if (!req.headers["content-type"]?.startsWith("application/json"))
            throw Error("JSON required");
          let text = "";
          for await (const chunk of req) {
            text += chunk;
            if (Buffer.byteLength(text) > 20 * 1024 * 1024)
              throw Error("Local database request exceeds 20 MB.");
          }
          const body = JSON.parse(text);
          if (req.method === "POST" && body.action === "path") {
            res.end(JSON.stringify({ path: file }));
            return;
          }
          if (req.method !== "PUT") throw Error("Unknown local action");
          const state = await load();
          if (body.expectedRevision !== state.revision) {
            res.statusCode = 409;
            res.end("REVISION_CONFLICT");
            return;
          }
          const next = validate({
            schemaVersion: 1,
            revision: state.revision + 1,
            documents: body.documents,
          });
          await atomic(
            file.replace(".json", ".backup.json"),
            JSON.stringify(state, null, 2),
          );
          await atomic(file, JSON.stringify(next, null, 2));
          res.end(JSON.stringify(next));
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      };
      queue = queue.then(task, task);
    });
  }
  return {
    name: "records-local-json",
    configureServer(server: any) {
      install(server, "development-records.json");
    },
    configurePreviewServer(server: any) {
      install(server, "preview-records.json");
    },
  };
}
