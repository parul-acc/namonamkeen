module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018, // <--- This fixes the "Unexpected token =>" error
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "quotes": "off",
    "max-len": "off",
    "indent": "off",
    "no-trailing-spaces": "off",
    "object-curly-spacing": "off",
    "eol-last": "off",
    "keyword-spacing": "off",
    "no-multi-spaces": "off",
    "spaced-comment": "off",
    "comma-dangle": "off",
    "arrow-parens": "off",
    "require-jsdoc": "off",
    "no-dupe-keys": "off",
    "valid-jsdoc": "off"
  },
};