import { apiRequest } from "./api";
export type NewsArticle = {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  format: "markdown" | "discord";
  thumbnail: string;
  status: "draft" | "scheduled" | "published" | "archived";
  publishAt: number | null;
  author: string;
  authorUid: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};
export type NewsCard = Omit<NewsArticle, "body">;
export const articleStatus = (article: NewsCard, time = Date.now()) =>
  article.status === "scheduled" &&
  article.publishAt !== null &&
  article.publishAt <= time
    ? "published"
    : article.status;
export const newsDate = (value: number | string | null) =>
  value === null
    ? "Not published"
    : new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
export const loadArticle = (id: string) =>
  apiRequest<NewsArticle>("/api/news/" + encodeURIComponent(id));
export async function prepareNewsThumbnail(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 10 * 1024 * 1024) throw Error("Choose an image under 10 MB.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw Error("This image could not be opened.");
  });
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 40000000
    )
      throw Error("Choose an image smaller than 40 megapixels.");
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Image processing is unavailable.");
    context.fillStyle = "#252525";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.6, 0.4, 0.25]) {
      const src = canvas.toDataURL("image/jpeg", quality);
      if (src.length <= 160000) return src;
    }
    throw Error("Choose a smaller or less detailed image.");
  } finally {
    bitmap.close();
  }
}
