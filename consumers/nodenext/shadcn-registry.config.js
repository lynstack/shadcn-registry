/** @type {import("@lynstack/shadcn-registry").Config} */
export default {
  name: "nodenext",
  homepage: "https://example.com/nodenext",
  outDir: "public/r",
  items: [
    { source: "src/components/ui/{item}", type: "registry:ui", target: "@ui" },
    {
      source: "src/hooks/use-{item}.ts",
      type: "registry:hook",
      target: "@hooks",
    },
    { source: "src/lib/{item}.ts", type: "registry:lib", target: "@lib" },
  ],
};
