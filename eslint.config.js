const js = require("@eslint/js");
const globals = require("globals");

const commonGlobals = {
  ...globals.browser,
  $: "readonly",
  jQuery: "readonly",
  google: "readonly",
  p5: "readonly",
};

// Files/dirs that use `import`/`export` (ES modules). Everything else is
// treated as a plain <script>-tag file (sourceType "script").
const modulePatterns = [
  "static/p5/**/*.js",
  "static/p5_test/**/*.js",
  "static/shared/**/*.js",
  "static/delve/**/*.js",
  "static/overrun/**/*.js",
];

// Vendored third-party code and known legacy plain scripts that live inside
// otherwise-module directories above.
const vendoredOrLegacy = [
  "static/p5/p5.js",
  "static/p5/game/considering/**",
  "static/shared/old_shared/**",
  "static/shared/gamecontrols-old.js",
  "static/legacy/**",
  "static/js/**",
  "static/racer/assets/**",
  "static/racer/CarWheelPhysics/**",
  "**/*.min.js",
  "node_modules/**",
];

// no-undef is disabled everywhere: p5 sketches run in "global mode" (p5.js
// attaches fill/background/PI/etc to window) and the plain <script>-tag
// files intentionally share globals across files (Game, GameControls,
// SCRIPTS, ...). Neither is something a hand-maintained globals list can
// track without constant upkeep.
const commonRules = {
  ...js.configs.recommended.rules,
  "no-undef": "off",
};

module.exports = [
  {
    ignores: vendoredOrLegacy,
  },
  {
    files: ["**/*.js"],
    ignores: modulePatterns,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: commonGlobals,
    },
    rules: commonRules,
  },
  {
    files: modulePatterns,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: commonGlobals,
    },
    rules: commonRules,
  },
];
