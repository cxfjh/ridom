import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dts from "vite-plugin-dts";


const __dirname = fileURLToPath(new URL(".", import.meta.url));

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as {version: string};

export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [dts({ entryRoot: "src", insertTypesEntry: true })],
    build: {
        target: "esnext",
        emptyOutDir: true,
        sourcemap: true,
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            fileName: (format) => (format === "es" ? `es.${ pkg.version }.js` : `${ pkg.version }.js`),
            name: "Ridom",
            formats: ["es", "iife"],
        },
        rolldownOptions: { output: { exports: "default" } },
    },
});
