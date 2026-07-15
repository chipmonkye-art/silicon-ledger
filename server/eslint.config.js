import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    ignores: ["node_modules"],
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: "error",
    },
  },
];
