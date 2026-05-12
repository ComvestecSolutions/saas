const http = require("node:http");
const net = require("node:net");

const listenPort = Number.parseInt(
  process.env.OPENPANEL_LOCAL_API_PROXY_PORT ?? "3005",
  10,
);
const upstreamHost = process.env.OPENPANEL_LOCAL_API_PROXY_HOST ?? "op-api";
const upstreamPort = Number.parseInt(
  process.env.OPENPANEL_LOCAL_API_PROXY_UPSTREAM_PORT ?? "3000",
  10,
);

const rewritePath = (requestUrl) => {
  const strippedPath = (requestUrl ?? "/").replace(/^\/api(?=\/|$)/u, "");

  return strippedPath.length === 0 ? "/" : strippedPath;
};

const proxyRequest = (request, response) => {
  const upstreamRequest = http.request(
    {
      host: upstreamHost,
      port: upstreamPort,
      method: request.method,
      path: rewritePath(request.url),
      headers: {
        ...request.headers,
        host: `${upstreamHost}:${upstreamPort}`,
      },
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );

  upstreamRequest.on("error", (error) => {
    response.statusCode = 502;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(`OpenPanel local API proxy error: ${error.message}`);
  });

  request.pipe(upstreamRequest);
};

const server = http.createServer(proxyRequest);

server.on("upgrade", (request, socket, head) => {
  const upstreamSocket = net.connect(upstreamPort, upstreamHost, () => {
    const serializedHeaders = Object.entries({
      ...request.headers,
      host: `${upstreamHost}:${upstreamPort}`,
    })
      .map(([headerName, headerValue]) => {
        if (Array.isArray(headerValue)) {
          return headerValue
            .map((value) => `${headerName}: ${value}`)
            .join("\r\n");
        }

        return `${headerName}: ${headerValue}`;
      })
      .join("\r\n");

    upstreamSocket.write(
      `${request.method} ${rewritePath(request.url)} HTTP/${request.httpVersion}\r\n${serializedHeaders}\r\n\r\n`,
    );

    if (head.length > 0) {
      upstreamSocket.write(head);
    }

    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
  });

  const closeSockets = () => {
    socket.destroy();
    upstreamSocket.destroy();
  };

  upstreamSocket.on("error", closeSockets);
  socket.on("error", closeSockets);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(listenPort, "127.0.0.1", () => {
  console.log(
    `OpenPanel local API proxy listening on 127.0.0.1:${listenPort} -> ${upstreamHost}:${upstreamPort}`,
  );
});
