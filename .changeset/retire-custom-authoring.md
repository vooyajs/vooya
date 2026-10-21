---
"@vooya/compiler": minor
"@vooya/provider-rust": minor
"@vooya/build-core": minor
"@vooya/vite": minor
"@vooya/rspack": minor
"@vooya/webpack": minor
---

Retire the custom component source format from the current development line.
Compile ordinary Rust Components and Stores through schema-driven bindings in
Vite, Webpack, and Rspack. Remove the old parser, formatter, loader branches,
declaration exports, and `buildApplication({ components })` input. Migrate
examples and acceptance fixtures to Rust and referenced CSS. Schema-generated
React declarations retain the host `className` prop. Existing
applications using removed inputs or APIs must follow the migration guide;
historical releases retain their original behavior.
