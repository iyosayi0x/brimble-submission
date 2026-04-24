export const _require_env = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Env value missing ${name} missing"`);
  }
  return value;
};
