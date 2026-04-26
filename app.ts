import express from "express";
import routes from "./src/routes/index";
const app = express();
import cors from "cors";

const port = process.env.PORT;

//PORT
app.set("port", port);

const corsOptions = {
  origin: function (origin: any, callback: any) {
    const allowedOrigins = [
      "http://localhost:3000", // Desarrollo local
      "http://localhost:3001", // Si usas otro puerto
      process.env.FRONTEND_URL, // Vercel o tu dominio de producción
    ].filter(Boolean); // Elimina undefined

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));

//routes
app.get("/", (req, res) => {
  res.json({ message: "Clasica Moderna API - Server is running!" });
});

app.use("/api", routes);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
