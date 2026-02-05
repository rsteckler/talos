import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "talos-server" });
});

app.listen(PORT, () => {
  console.log(`Talos server listening on http://localhost:${PORT}`);
});
