/** @type {import('next').NextConfig} */

/**
 * Static export.
 *
 * Every page in this application is static — no server components fetching data,
 * no middleware, no dynamic routes. Next.js is therefore a build tool here, not a
 * runtime, and `output: 'export'` says so out loud: the build produces plain
 * HTML, CSS and JS that the API server hands out directly.
 *
 * That is what removes three moving parts from a deployment. There is no second
 * Node process for the frontend, so nothing to supervise; and because the same
 * origin serves both the page and the API, there is no reverse proxy needed to
 * glue them together and no CORS to configure.
 *
 * Security headers used to live in this file under `headers()`. That is a server
 * feature and is not available to an exported build, so they moved to the Express
 * layer, which is a better home anyway: one place that sets them, applied to the
 * API responses as well as the documents.
 */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,

  // No image optimiser without a Node server. The app ships one small logo.
  images: { unoptimized: true },

  // Emit directory-style paths (/about-tool/index.html) so a plain static file
  // server resolves them without rewrite rules.
  trailingSlash: true,

  webpack: (config, { webpack, isServer }) => {
    if (!isServer) {
      // The `docx` library references the Node globals `Buffer` and `process`,
      // which don't exist in the browser. Provide polyfills so client-side
      // DOCX generation (SOP download) works.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer/'),
        process: require.resolve('process/browser'),
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );
    }
    return config;
  },
};

module.exports = nextConfig;
