import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import { vooyaWebpack } from "@vooya/webpack";

const root = dirname(fileURLToPath(import.meta.url));
export default {
  context: root, entry: "./src/main.jsx", output: { path: resolve(root, "dist"), clean: true },
  resolve: { extensions: [".js", ".jsx"], alias: { react: resolve(root, "node_modules/react"), "react-dom": resolve(root, "node_modules/react-dom") } },
  module: { rules: [
    { test: /\.voo$/, use: [{ loader: "@vooya/webpack/loader", options: { framework: "react" } }] },
    { test: /\.jsx$/, use: { loader: "babel-loader", options: { presets: [["@babel/preset-react", { runtime: "automatic" }]] } } },
    { test: /\.css$/, use: ["style-loader", "css-loader"] },
  ] },
  plugins: [vooyaWebpack({ framework: "react" }), new HtmlWebpackPlugin({ template: "index.html" })],
};
