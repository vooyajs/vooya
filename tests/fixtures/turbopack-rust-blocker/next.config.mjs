export default {
  turbopack: {
    rules: {
      "*.rs": {
        loaders: ["./vooya-rust-loader.cjs"],
        as: "*.js",
      },
    },
  },
};
