import { _require_env } from "./utils";

const DEFAULT_PORT = 8000;

const CONFIGS = {
  PORT: Number(process.env.PORT) || DEFAULT_PORT,
  DATABASE_URL: _require_env("DATABASE_URL"),
};

export default CONFIGS;
