const DEFAULT_PORT = 8000;

const CONFIGS = {
  PORT: process.env.PORT
    ? (Number(process.env.PORT) ?? DEFAULT_PORT)
    : DEFAULT_PORT,
};

export default CONFIGS;
