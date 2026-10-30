import { vooya } from "@vooya/vite";
export default {
  plugins: [vooya({ rust: { artifacts: {
    light: { sourceRoot: "src/light" },
    heavy: { sourceRoot: "src/heavy", dependencies: {
      bevy_ecs: { version: "=0.18.1", defaultFeatures: false, features: ["std"] },
    } },
  } } })],
};
