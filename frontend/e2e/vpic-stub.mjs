// A tiny stand-in for the NHTSA vPIC API so end-to-end runs are
// deterministic. It answers in vPIC's JSON shapes for the two endpoints the
// backend uses.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4390);

const models = {
  "toyota|2020": ["Camry", "Corolla", "RAV4"],
  "honda|2003": ["Accord", "Civic"],
};

const vins = {
  "1HGCM82633A004352": {
    ModelYear: "2003",
    Make: "HONDA",
    Model: "Accord",
    Trim: "EX-V6",
    Series: "",
  },
};

function send(response, body) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const { pathname } = new URL(request.url, `http://localhost:${port}`);
  const modelsMatch = pathname.match(
    /^\/api\/vehicles\/GetModelsForMakeYear\/make\/([^/]+)\/modelyear\/(\d+)$/,
  );
  const vinMatch = pathname.match(/^\/api\/vehicles\/DecodeVinValues\/(\w+)$/);

  if (pathname === "/healthz") {
    send(response, { status: "ok" });
  } else if (modelsMatch) {
    const key = `${decodeURIComponent(modelsMatch[1]).toLowerCase()}|${modelsMatch[2]}`;
    const names = models[key] ?? [];

    send(response, {
      Count: names.length,
      Results: names.map((name) => ({ Model_Name: name })),
    });
  } else if (vinMatch) {
    send(response, {
      Count: 1,
      Results: [
        vins[vinMatch[1]] ?? {
          ModelYear: "",
          Make: "",
          Model: "",
          Trim: "",
          Series: "",
        },
      ],
    });
  } else {
    response.writeHead(404);
    response.end();
  }
}).listen(port, () => {
  console.log(`vPIC stub listening on http://localhost:${port}`);
});
