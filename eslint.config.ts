import { fixupConfigRules } from "@eslint/compat"
import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import tsParser from "@typescript-eslint/parser"
import { defineConfig } from "eslint/config"
import globals from "globals"

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default defineConfig([
  {
    ignores: [".webpack/**", "dist/**", "node_modules/**", "out/**"],
  },
  {
    extends: fixupConfigRules(
      compat.extends(
        "eslint:recommended",
        "plugin:import/electron",
        "plugin:import/recommended",
        "plugin:react/recommended",
        "plugin:react-hooks/recommended"
      )
    ),
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      ecmaVersion: 2022,
      parser: tsParser,
      sourceType: "module",
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
      react: {
        version: "detect",
      },
    },
    rules: {
      // General code quality
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "warn",
      "prefer-const": "error",
      "no-var": "error",

      // Import organization
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling"],
            "index",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import/no-duplicates": "error",
      "import/no-useless-path-segments": "error",

      // React best practices
      "react/jsx-no-bind": ["warn", { allowArrowFunctions: true }],
      "react/jsx-no-leaked-render": "warn",
      "react/no-array-index-key": "warn",
      "react/self-closing-comp": "error",
      "react/prop-types": "off", // Using TypeScript
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: compat.extends(
      "plugin:@typescript-eslint/eslint-recommended",
      "plugin:@typescript-eslint/recommended"
    ),
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: {
        project: "./tsconfig.json",
      },
      sourceType: "module",
    },
    rules: {
      // Disable base rules that are replaced by TypeScript equivalents
      "no-dupe-class-members": "off",
      "no-loss-of-precision": "off",
      "no-redeclare": "off",
      "no-shadow": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-use-before-define": "off",

      // Enable TypeScript-specific rules
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-shadow": "warn",
      "@typescript-eslint/no-use-before-define": [
        "error",
        { functions: false, classes: true, variables: true },
      ],
      "@typescript-eslint/no-redeclare": "error",
      "@typescript-eslint/no-dupe-class-members": "error",
      "@typescript-eslint/no-loss-of-precision": "error",
      "@typescript-eslint/no-deprecated": "warn",

      // TypeScript code quality
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false,
        },
      ],

      // Naming conventions
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
      ],

      // React rules
      "react/react-in-jsx-scope": "off",
    },
  },
])
