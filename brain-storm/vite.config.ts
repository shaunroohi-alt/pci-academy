import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const prefix =
    loadEnv(mode, ".", "BASE_PATH").BASE_PATH?.replace(/\/$/, "") ?? "";
  return {
    plugins: [react()],
    base: `${prefix}/brain-storm/`,
    build: { target: "es2022" },
  };
});
