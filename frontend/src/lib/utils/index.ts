import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { FetchError } from "../http";

dayjs.extend(relativeTime);

const PROJECT_COLORS = [
  "#6b7cff",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
];

export const timeAgo = (iso: string) => dayjs(iso).fromNow();

export const projectColor = (name: string) =>
  PROJECT_COLORS[name.charCodeAt(0) % PROJECT_COLORS.length];

export const projectInitial = (name: string) => name[0].toUpperCase();

export const truncateUrl = (url: string) => {
  try {
    const { hostname, pathname } = new URL(url);
    return `${hostname}${pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
};

export const extractErrorMessage = (err: unknown) => {
  if (err instanceof Error) {
    return err.message;
  } else if (err instanceof FetchError) {
    return err.message;
  }
  return `${err}`;
};
