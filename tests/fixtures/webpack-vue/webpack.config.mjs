import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { VueLoaderPlugin } from "vue-loader";
import HtmlWebpackPlugin from "html-webpack-plugin";
import { vooyaWebpack } from "@vooya/webpack";
const root = dirname(fileURLToPath(import.meta.url));
export default { context: root, entry: "./src/main.js", output: { path: resolve(root, "dist"), clean: true }, resolve: { alias: { vue: resolve(root, "node_modules/vue") } }, experiments: { asyncWebAssembly: true }, module: { rules: [{ test: /\.voo$/, use: [{ loader: "@vooya/webpack/loader", options: { framework: "vue" } }] }, { test: /\.vue$/, loader: "vue-loader" }, { test: /\.css$/, use: ["style-loader", "css-loader"] }] }, plugins: [vooyaWebpack({ framework: "vue" }), new VueLoaderPlugin(), new HtmlWebpackPlugin({ template: "index.html" })] };
