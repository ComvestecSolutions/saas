export {
  backendApiOpenApiPath,
  createBackendApiOpenApiDocument,
} from "./openapi-document";
export type { BackendApiOpenApiDocument } from "./openapi-document";

export const backendApiDocsPath = "/api/docs";

export const backendApiDocsAssetPath = {
  swaggerUiCss: `${backendApiDocsPath}/swagger-ui.css`,
  swaggerUiBundle: `${backendApiDocsPath}/swagger-ui-bundle.js`,
  swaggerUiStandalonePreset: `${backendApiDocsPath}/swagger-ui-standalone-preset.js`,
} as const;

const swaggerUiPackageJsonPath = Bun.resolveSync(
  "swagger-ui-dist/package.json",
  import.meta.dir,
);
const swaggerUiAssetDirectory = swaggerUiPackageJsonPath.replace(
  /[/\\]package\.json$/,
  "",
);

const swaggerUiAssets = {
  css: await Bun.file(`${swaggerUiAssetDirectory}/swagger-ui.css`).text(),
  bundle: await Bun.file(
    `${swaggerUiAssetDirectory}/swagger-ui-bundle.js`,
  ).text(),
  standalonePreset: await Bun.file(
    `${swaggerUiAssetDirectory}/swagger-ui-standalone-preset.js`,
  ).text(),
};

import {
  backendApiOpenApiPath,
  createBackendApiOpenApiDocument,
} from "./openapi-document";

const jsonContentType = "application/json; charset=utf-8";
const htmlContentType = "text/html; charset=utf-8";
const cssContentType = "text/css; charset=utf-8";
const javascriptContentType = "text/javascript; charset=utf-8";

const createSwaggerUiHtml = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Comvestec Backend API Docs</title>
    <link rel="stylesheet" href="${backendApiDocsAssetPath.swaggerUiCss}" />
    <style>
      html {
        box-sizing: border-box;
        overflow-y: scroll;
      }

      *,
      *::before,
      *::after {
        box-sizing: inherit;
      }

      body {
        margin: 0;
        background: #f5f7fb;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${backendApiDocsAssetPath.swaggerUiBundle}"></script>
    <script src="${backendApiDocsAssetPath.swaggerUiStandalonePreset}"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${backendApiOpenApiPath}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
      });
    </script>
  </body>
</html>`;

const methodNotAllowedResponse = () =>
  new Response(JSON.stringify({ error: "Method not allowed." }), {
    status: 405,
    headers: {
      "Content-Type": jsonContentType,
      Allow: "GET",
    },
  });

export const handleBackendApiDocumentationRequest = (
  request: Request,
): Response => {
  if (request.method !== "GET") {
    return methodNotAllowedResponse();
  }

  const url = new URL(request.url);

  switch (url.pathname) {
    case backendApiOpenApiPath:
      return new Response(
        JSON.stringify(
          createBackendApiOpenApiDocument(new URL(request.url).origin),
          null,
          2,
        ),
        {
          status: 200,
          headers: {
            "Content-Type": jsonContentType,
          },
        },
      );
    case backendApiDocsPath:
      return new Response(createSwaggerUiHtml(), {
        status: 200,
        headers: {
          "Content-Type": htmlContentType,
        },
      });
    case backendApiDocsAssetPath.swaggerUiCss:
      return new Response(swaggerUiAssets.css, {
        status: 200,
        headers: {
          "Content-Type": cssContentType,
        },
      });
    case backendApiDocsAssetPath.swaggerUiBundle:
      return new Response(swaggerUiAssets.bundle, {
        status: 200,
        headers: {
          "Content-Type": javascriptContentType,
        },
      });
    case backendApiDocsAssetPath.swaggerUiStandalonePreset:
      return new Response(swaggerUiAssets.standalonePreset, {
        status: 200,
        headers: {
          "Content-Type": javascriptContentType,
        },
      });
    default:
      return new Response(
        JSON.stringify({ error: "Backend API docs route not found." }),
        {
          status: 404,
          headers: {
            "Content-Type": jsonContentType,
          },
        },
      );
  }
};
