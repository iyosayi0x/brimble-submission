import { _require_env } from "./utils";

const DEFAULT_PORT = 8000;

const CONFIGS = {
  PORT: Number(process.env.PORT) || DEFAULT_PORT,
  DATABASE_URL: _require_env("DATABASE_URL"),
  DOCKER_NETWORK_NAME: _require_env("DOCKER_NETWORK_NAME"),
  APP_DOMAIN: _require_env("APP_DOMAIN"),
  APP_DOMAIN_SECURE: process.env.APP_DOMAIN_SECURE === "true",
  CADDY_API: _require_env("CADDY_API"),
};

export default CONFIGS;
